const { Pool } = require("pg");

let pool;
let mealPhotoSchemaPromise;

function getPool() {
  if (pool) return pool;
  pool = new Pool({
    ...connectionOptions(),
    max: positiveInteger(process.env.DATABASE_POOL_MAX, 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    ssl: databaseSslOptions()
  });
  pool.on("error", (error) => console.error("PostgreSQL pool error", error));
  return pool;
}

function connectionOptions() {
  const connectionString = String(process.env.DATABASE_URL || "").trim();
  if (connectionString) return { connectionString };
  const host = String(process.env.POSTGRES_HOST || "").trim();
  const user = String(process.env.POSTGRES_USER || "").trim();
  const password = String(process.env.POSTGRES_PASSWORD || "");
  const database = String(process.env.POSTGRES_DB || "").trim();
  if (!host || !user || !password || !database) {
    throw serviceError("数据库连接环境变量未配置", 503);
  }
  return {
    host,
    port: positiveInteger(process.env.POSTGRES_PORT, 5432),
    user,
    password,
    database
  };
}

async function checkConnection() {
  await getPool().query("select 1");
  await ensureMealPhotoSchema();
}

function ensureMealPhotoSchema() {
  if (mealPhotoSchemaPromise) return mealPhotoSchemaPromise;
  mealPhotoSchemaPromise = getPool()
    .query(`
      create table if not exists household_meal_photos (
        household_id uuid not null references households(id) on delete cascade,
        date_key date not null,
        photo_id text not null check (char_length(photo_id) between 8 and 120),
        original_image bytea not null,
        original_mime text not null default 'image/jpeg',
        analysis jsonb,
        share_task_id text,
        share_status text not null default 'idle'
          check (share_status in ('idle', 'PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELED', 'UNKNOWN')),
        share_image bytea,
        share_mime text,
        share_created_at timestamptz,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        primary key (household_id, date_key)
      );
      create index if not exists household_meal_photos_updated_at_idx
        on household_meal_photos (household_id, updated_at desc);
    `)
    .catch((error) => {
      mealPhotoSchemaPromise = null;
      throw error;
    });
  return mealPhotoSchemaPromise;
}

async function findOrCreateHousehold(code) {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const householdResult = await client.query(
      `insert into households (code)
       values ($1)
       on conflict (code) do update set code = excluded.code
       returning id`,
      [code]
    );
    const householdId = householdResult.rows[0].id;
    await client.query(
      `insert into household_states (household_id, payload)
       values ($1, '{}'::jsonb)
       on conflict (household_id) do nothing`,
      [householdId]
    );
    await client.query("commit");
    return householdId;
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function loadHouseholdState(householdId) {
  const result = await getPool().query(
    `select payload, updated_at
     from household_states
     where household_id = $1
     limit 1`,
    [householdId]
  );
  return result.rows[0] || { payload: null, updated_at: null };
}

async function saveHouseholdState(householdId, payload) {
  const result = await getPool().query(
    `insert into household_states (household_id, payload, updated_at)
     values ($1, $2::jsonb, now())
     on conflict (household_id) do update
       set payload = excluded.payload,
           updated_at = excluded.updated_at
     returning updated_at`,
    [householdId, JSON.stringify(payload)]
  );
  return result.rows[0]?.updated_at || new Date();
}

async function consumeHouseholdPhotoAnalysis({ householdId, usageDate, limit }) {
  const result = await getPool().query(
    `insert into household_ai_usage_daily (household_id, usage_date, photo_analysis_count)
     values ($1, $2, 1)
     on conflict (household_id, usage_date) do update
       set photo_analysis_count = household_ai_usage_daily.photo_analysis_count + 1,
           updated_at = now()
       where household_ai_usage_daily.photo_analysis_count < $3
     returning photo_analysis_count`,
    [householdId, usageDate, limit]
  );
  if (!result.rowCount) throw serviceError(`今天的 ${limit} 次照片识别已用完`, 429);
  const used = Number(result.rows[0].photo_analysis_count || 0);
  return { used, remaining: Math.max(0, limit - used), limit };
}

async function upsertHouseholdMealPhoto({ householdId, dateKey, photoId, originalImage, originalMime, analysis }) {
  const result = await getPool().query(
    `insert into household_meal_photos
       (household_id, date_key, photo_id, original_image, original_mime, analysis,
        share_task_id, share_status, share_image, share_mime, share_created_at, updated_at)
     values ($1, $2, $3, $4, $5, $6::jsonb, null, 'idle', null, null, null, now())
     on conflict (household_id, date_key) do update
       set photo_id = excluded.photo_id,
           original_image = excluded.original_image,
           original_mime = excluded.original_mime,
           analysis = excluded.analysis,
           share_task_id = null,
           share_status = 'idle',
           share_image = null,
           share_mime = null,
           share_created_at = null,
           updated_at = now()
     returning photo_id, share_status, updated_at`,
    [householdId, dateKey, photoId, originalImage, originalMime, JSON.stringify(analysis || null)]
  );
  return result.rows[0] || null;
}

async function loadHouseholdMealPhoto({ householdId, dateKey, photoId }) {
  const result = await getPool().query(
    `select photo_id, original_image, original_mime, analysis, share_task_id, share_status,
            share_image, share_mime, share_created_at, created_at, updated_at
     from household_meal_photos
     where household_id = $1 and date_key = $2 and ($3::text is null or photo_id = $3)
     limit 1`,
    [householdId, dateKey, photoId || null]
  );
  return result.rows[0] || null;
}

async function updateHouseholdMealPhotoShareTask({ householdId, dateKey, photoId, taskId, status }) {
  const result = await getPool().query(
    `update household_meal_photos
     set share_task_id = $4, share_status = $5, updated_at = now()
     where household_id = $1 and date_key = $2 and photo_id = $3
     returning photo_id, share_task_id, share_status, updated_at`,
    [householdId, dateKey, photoId, taskId, status]
  );
  return result.rows[0] || null;
}

async function saveHouseholdMealPhotoShare({ householdId, dateKey, photoId, taskId, status, shareImage, shareMime }) {
  const result = await getPool().query(
    `update household_meal_photos
     set share_task_id = $4,
         share_status = $5,
         share_image = coalesce($6, share_image),
         share_mime = coalesce($7, share_mime),
         share_created_at = case when $6 is null then share_created_at else now() end,
         updated_at = now()
     where household_id = $1 and date_key = $2 and photo_id = $3
     returning photo_id, share_task_id, share_status, share_created_at, updated_at`,
    [householdId, dateKey, photoId, taskId || null, status, shareImage || null, shareMime || null]
  );
  return result.rows[0] || null;
}

async function deleteHouseholdMealPhoto({ householdId, dateKey, photoId }) {
  const result = await getPool().query(
    `delete from household_meal_photos
     where household_id = $1 and date_key = $2 and ($3::text is null or photo_id = $3)
     returning photo_id`,
    [householdId, dateKey, photoId || null]
  );
  return result.rows[0] || null;
}

async function upsertWechatUser({ openid, unionid }) {
  const result = await getPool().query(
    `insert into users (wechat_openid, wechat_unionid)
     values ($1, $2)
     on conflict (wechat_openid) do update
       set wechat_unionid = coalesce(excluded.wechat_unionid, users.wechat_unionid),
           updated_at = now()
     returning id, display_name, created_at`,
    [openid, unionid || null]
  );
  return result.rows[0];
}

async function createUserSession(userId, tokenHash, expiresAt) {
  await getPool().query(
    `insert into user_sessions (user_id, token_hash, expires_at)
     values ($1, $2, $3)`,
    [userId, tokenHash, expiresAt]
  );
}

async function findUserBySessionTokenHash(tokenHash) {
  const result = await getPool().query(
    `with active_session as (
       update user_sessions
       set last_used_at = now()
       where token_hash = $1 and expires_at > now()
       returning user_id, expires_at
     )
     select users.id, users.display_name, active_session.expires_at
     from active_session
     join users on users.id = active_session.user_id
     limit 1`,
    [tokenHash]
  );
  return result.rows[0] || null;
}

async function deleteUserSession(tokenHash) {
  await getPool().query("delete from user_sessions where token_hash = $1", [tokenHash]);
}

async function listUserHouseholds(userId) {
  const result = await getPool().query(
    `select households.id, coalesce(households.name, households.code) as name,
            household_members.role, household_members.joined_at
     from household_members
     join households on households.id = household_members.household_id
     where household_members.user_id = $1
     order by household_members.joined_at desc`,
    [userId]
  );
  return result.rows;
}

async function createHouseholdForUser({ userId, code, name }) {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const householdResult = await client.query(
      `insert into households (code, name, owner_user_id)
       values ($1, $2, $3)
       returning id, name`,
      [code, name, userId]
    );
    const household = householdResult.rows[0];
    await client.query(
      `insert into household_members (household_id, user_id, role)
       values ($1, $2, 'owner')`,
      [household.id, userId]
    );
    await client.query(
      `insert into household_states (household_id, payload)
       values ($1, '{}'::jsonb)`,
      [household.id]
    );
    await client.query("commit");
    return { ...household, role: "owner" };
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function deleteHouseholdOwnedByUser({ userId, householdId }) {
  const result = await getPool().query(
    `delete from households
     where id = $1 and owner_user_id = $2
     returning id, coalesce(name, code) as name`,
    [householdId, userId]
  );
  const household = result.rows[0];
  if (!household) throw serviceError("只有家庭创建者可以删除该家庭", 403);
  return { ...household, role: "owner" };
}

async function claimLegacyHousehold({ userId, code }) {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const result = await client.query(
      `select id, coalesce(name, code) as name, owner_user_id
       from households
       where code = $1
       for update`,
      [code]
    );
    const household = result.rows[0];
    if (!household) throw serviceError("没有找到这个旧家庭", 404);

    const membership = await client.query(
      `select role from household_members where household_id = $1 and user_id = $2`,
      [household.id, userId]
    );
    if (household.owner_user_id && !membership.rows[0]) {
      throw serviceError("这个家庭已完成迁移，请让家庭成员重新分享邀请", 409);
    }
    if (!household.owner_user_id) {
      await client.query(
        `update households set owner_user_id = $2, name = coalesce(name, code) where id = $1`,
        [household.id, userId]
      );
      await client.query(
        `insert into household_members (household_id, user_id, role)
         values ($1, $2, 'owner')
         on conflict (household_id, user_id) do update set role = 'owner'`,
        [household.id, userId]
      );
    }
    await client.query("commit");
    return { id: household.id, name: household.name, role: membership.rows[0]?.role || "owner" };
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function findHouseholdMembership(userId, householdId) {
  const result = await getPool().query(
    `select household_members.role, coalesce(households.name, households.code) as name
     from household_members
     join households on households.id = household_members.household_id
     where household_members.user_id = $1 and household_members.household_id = $2
     limit 1`,
    [userId, householdId]
  );
  return result.rows[0] || null;
}

async function createHouseholdInvitation({ userId, householdId, tokenHash, expiresAt, maxUses }) {
  const membership = await findHouseholdMembership(userId, householdId);
  if (!membership) throw serviceError("你不是这个家庭的成员", 403);
  await getPool().query(
    `insert into household_invitations
       (household_id, created_by, token_hash, expires_at, max_uses)
     values ($1, $2, $3, $4, $5)`,
    [householdId, userId, tokenHash, expiresAt, maxUses]
  );
  return { householdId, householdName: membership.name, role: membership.role };
}

async function joinHouseholdByInvitation({ userId, tokenHash }) {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const result = await client.query(
      `select household_invitations.id, household_invitations.household_id,
              household_invitations.expires_at, household_invitations.max_uses,
              household_invitations.use_count, household_invitations.revoked_at,
              coalesce(households.name, households.code) as name
       from household_invitations
       join households on households.id = household_invitations.household_id
       where household_invitations.token_hash = $1
       for update`,
      [tokenHash]
    );
    const invitation = result.rows[0];
    if (!invitation) throw serviceError("邀请已失效，请让家庭成员重新分享", 410);
    const existingMembership = await client.query(
      `select role from household_members where household_id = $1 and user_id = $2`,
      [invitation.household_id, userId]
    );
    if (existingMembership.rows[0]) {
      await client.query("commit");
      return { id: invitation.household_id, name: invitation.name, role: existingMembership.rows[0].role };
    }
    if (
      invitation.revoked_at ||
      new Date(invitation.expires_at).getTime() <= Date.now() ||
      invitation.use_count >= invitation.max_uses
    ) {
      throw serviceError("邀请已失效，请让家庭成员重新分享", 410);
    }
    const inserted = await client.query(
      `insert into household_members (household_id, user_id, role)
       values ($1, $2, 'member')
       on conflict (household_id, user_id) do nothing
       returning role`,
      [invitation.household_id, userId]
    );
    if (inserted.rowCount) {
      await client.query(
        `update household_invitations set use_count = use_count + 1 where id = $1`,
        [invitation.id]
      );
    }
    await client.query("commit");
    return { id: invitation.household_id, name: invitation.name, role: "member" };
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

function databaseSslOptions() {
  const mode = String(process.env.DATABASE_SSL || "disable").trim().toLowerCase();
  if (["", "0", "false", "disable"].includes(mode)) return false;
  return {
    rejectUnauthorized: String(process.env.DATABASE_SSL_REJECT_UNAUTHORIZED || "true").toLowerCase() !== "false"
  };
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function serviceError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

module.exports = {
  checkConnection,
  claimLegacyHousehold,
  consumeHouseholdPhotoAnalysis,
  connectionOptions,
  createHouseholdForUser,
  createHouseholdInvitation,
  createUserSession,
  databaseSslOptions,
  deleteHouseholdOwnedByUser,
  deleteHouseholdMealPhoto,
  deleteUserSession,
  findHouseholdMembership,
  findUserBySessionTokenHash,
  findOrCreateHousehold,
  joinHouseholdByInvitation,
  listUserHouseholds,
  loadHouseholdMealPhoto,
  loadHouseholdState,
  saveHouseholdMealPhotoShare,
  saveHouseholdState,
  updateHouseholdMealPhotoShareTask,
  upsertHouseholdMealPhoto,
  upsertWechatUser
};
