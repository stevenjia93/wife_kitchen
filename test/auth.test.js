const test = require("node:test");
const assert = require("node:assert/strict");
const { hashToken, requireUser } = require("../server/auth");

test("authenticates bearer sessions by token hash", async () => {
  const token = "abcdefghijklmnopqrstuvwxyz1234567890ABCDEFGH";
  const database = {
    findUserBySessionTokenHash: async (tokenHash) => {
      assert.equal(tokenHash, hashToken(token));
      return { id: "user-1", display_name: "微信用户" };
    }
  };

  const user = await requireUser({ headers: { authorization: `Bearer ${token}` } }, database);
  assert.equal(user.id, "user-1");
});

test("rejects requests without a valid bearer session", async () => {
  await assert.rejects(() => requireUser({ headers: {} }, {}), /请先微信登录/);
  await assert.rejects(
    () => requireUser({ headers: { authorization: "Bearer abcdefghijklmnopqrstuvwxyz123456" } }, { findUserBySessionTokenHash: async () => null }),
    /登录已过期/
  );
});
