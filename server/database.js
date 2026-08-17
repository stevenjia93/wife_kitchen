const { Pool } = require("pg");

let pool;

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
  connectionOptions,
  databaseSslOptions,
  findOrCreateHousehold,
  loadHouseholdState,
  saveHouseholdState
};
