const crypto = require("node:crypto");
const defaultDatabase = require("../server/database");
const defaultAuth = require("../server/auth");

function createHandler(database = defaultDatabase, auth = defaultAuth) {
  return async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.status(204).end();
      return;
    }
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    try {
      const user = await auth.requireUser(req, database);
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const action = String(body.action || "list").trim();

      if (action === "list") {
        const households = await database.listUserHouseholds(user.id);
        res.status(200).json({ user: publicUser(user), households: households.map(publicHousehold) });
        return;
      }

      if (action === "create") {
        const household = await createHousehold(database, user.id, normalizeHouseholdName(body.name));
        res.status(201).json({ household: publicHousehold(household) });
        return;
      }

      if (action === "claimLegacy") {
        const household = await database.claimLegacyHousehold({
          userId: user.id,
          code: normalizeLegacyCode(body.code)
        });
        res.status(200).json({ household: publicHousehold(household) });
        return;
      }

      if (action === "invite") {
        const householdId = normalizeHouseholdId(body.householdId);
        const inviteToken = crypto.randomBytes(24).toString("base64url");
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        const household = await database.createHouseholdInvitation({
          userId: user.id,
          householdId,
          tokenHash: auth.hashToken(inviteToken),
          expiresAt,
          maxUses: 5
        });
        res.status(201).json({
          inviteToken,
          expiresAt: expiresAt.toISOString(),
          household: publicHousehold({
            id: household.householdId,
            name: household.householdName,
            role: household.role
          })
        });
        return;
      }

      if (action === "join") {
        const inviteToken = normalizeInviteToken(body.inviteToken);
        const household = await database.joinHouseholdByInvitation({
          userId: user.id,
          tokenHash: auth.hashToken(inviteToken)
        });
        res.status(200).json({ household: publicHousehold(household) });
        return;
      }

      if (action === "delete") {
        const household = await database.deleteHouseholdOwnedByUser({
          userId: user.id,
          householdId: normalizeHouseholdId(body.householdId)
        });
        res.status(200).json({ deleted: true, household: publicHousehold(household) });
        return;
      }

      throw httpError("不支持的家庭操作", 400);
    } catch (error) {
      res.status(error.statusCode || 400).json({ error: error.message || "家庭操作失败" });
    }
  };
}

async function createHousehold(database, userId, name) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await database.createHouseholdForUser({
        userId,
        name,
        code: `home-${crypto.randomBytes(8).toString("hex")}`
      });
    } catch (error) {
      if (error.code !== "23505" || attempt === 2) throw error;
    }
  }
  throw httpError("家庭创建失败，请重试", 503);
}

function publicUser(user) {
  return { id: user.id, displayName: user.display_name || user.displayName || "微信用户" };
}

function publicHousehold(household) {
  return {
    id: household.id,
    name: String(household.name || "我的家庭"),
    role: household.role === "owner" ? "owner" : "member"
  };
}

function normalizeHouseholdName(value) {
  const name = String(value || "").replace(/\s+/g, " ").trim();
  if (!name) return "我的家庭";
  if (name.length > 30) throw httpError("家庭名称最多 30 个字", 400);
  return name;
}

function normalizeHouseholdId(value) {
  const id = String(value || "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw httpError("家庭编号不正确", 400);
  }
  return id;
}

function normalizeInviteToken(value) {
  const token = String(value || "").trim();
  if (!/^[A-Za-z0-9_-]{24,100}$/.test(token)) throw httpError("邀请链接不正确", 400);
  return token;
}

function normalizeLegacyCode(value) {
  const code = String(value || "").trim().toLowerCase();
  if (!code || code.length > 80 || !/^[a-z0-9][a-z0-9_-]*$/i.test(code)) {
    throw httpError("旧家庭码不正确", 400);
  }
  return code;
}

function httpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
module.exports._internals = {
  normalizeHouseholdId,
  normalizeHouseholdName,
  normalizeInviteToken,
  normalizeLegacyCode,
  publicHousehold
};
