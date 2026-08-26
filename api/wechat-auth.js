const defaultDatabase = require("../server/database");
const auth = require("../server/auth");

function createHandler(database = defaultDatabase, fetchImpl = global.fetch) {
  return async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Methods", "POST, DELETE, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.status(204).end();
      return;
    }

    try {
      if (req.method === "DELETE") {
        await auth.revokeSession(req, database);
        res.status(204).end();
        return;
      }
      if (req.method !== "POST") {
        res.status(405).json({ error: "Method not allowed" });
        return;
      }

      const body = req.body && typeof req.body === "object" ? req.body : {};
      const code = normalizeLoginCode(body.code);
      const config = wechatConfig();
      const params = new URLSearchParams({
        appid: config.appId,
        secret: config.appSecret,
        js_code: code,
        grant_type: "authorization_code"
      });
      const response = await fetchImpl(`https://api.weixin.qq.com/sns/jscode2session?${params}`, {
        signal: AbortSignal.timeout(10_000)
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.errcode || !payload.openid) {
        throw httpError(wechatErrorMessage(payload), response.ok ? 502 : response.status || 502);
      }

      const user = await database.upsertWechatUser({ openid: payload.openid, unionid: payload.unionid || null });
      const token = auth.createSessionToken();
      const expiresAt = new Date(Date.now() + config.sessionDays * 24 * 60 * 60 * 1000);
      await database.createUserSession(user.id, auth.hashToken(token), expiresAt);
      res.status(200).json({
        token,
        expiresAt: expiresAt.toISOString(),
        user: { id: user.id, displayName: user.display_name || "微信用户" }
      });
    } catch (error) {
      res.status(error.statusCode || 400).json({ error: error.message || "微信登录失败" });
    }
  };
}

function normalizeLoginCode(value) {
  const code = String(value || "").trim();
  if (!code || code.length > 256) throw httpError("微信登录凭证不正确", 400);
  return code;
}

function wechatConfig() {
  const appId = String(process.env.WECHAT_APP_ID || "").trim();
  const appSecret = String(process.env.WECHAT_APP_SECRET || "").trim();
  if (!appId || !appSecret) throw httpError("微信登录服务尚未配置", 503);
  const requestedDays = Number.parseInt(process.env.WECHAT_SESSION_DAYS, 10);
  const sessionDays = Number.isInteger(requestedDays) ? Math.min(90, Math.max(1, requestedDays)) : 30;
  return { appId, appSecret, sessionDays };
}

function wechatErrorMessage(payload) {
  if (payload.errcode === 40029) return "微信登录凭证已失效，请重试";
  if (payload.errcode === 45011) return "登录过于频繁，请稍后重试";
  return "微信登录暂时不可用";
}

function httpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
module.exports._internals = { normalizeLoginCode, wechatConfig };
