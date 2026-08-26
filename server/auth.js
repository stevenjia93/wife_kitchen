const crypto = require("node:crypto");
const defaultDatabase = require("./database");

function createSessionToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function hashToken(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function bearerToken(req) {
  const header = String(req.headers?.authorization || "").trim();
  const match = /^Bearer\s+([A-Za-z0-9_-]{32,200})$/i.exec(header);
  return match?.[1] || "";
}

async function requireUser(req, database = defaultDatabase) {
  const token = bearerToken(req);
  if (!token) throw authError("请先微信登录", 401);
  const user = await database.findUserBySessionTokenHash(hashToken(token));
  if (!user) throw authError("登录已过期，请重新登录", 401);
  return user;
}

async function revokeSession(req, database = defaultDatabase) {
  const token = bearerToken(req);
  if (token) await database.deleteUserSession(hashToken(token));
}

function authError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

module.exports = {
  bearerToken,
  createSessionToken,
  hashToken,
  requireUser,
  revokeSession
};
