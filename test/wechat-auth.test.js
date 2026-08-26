const test = require("node:test");
const assert = require("node:assert/strict");
const { createHandler } = require("../api/wechat-auth");

test("exchanges wx.login code and stores only a session token hash", async () => {
  const originalAppId = process.env.WECHAT_APP_ID;
  const originalSecret = process.env.WECHAT_APP_SECRET;
  process.env.WECHAT_APP_ID = "wx-test-app";
  process.env.WECHAT_APP_SECRET = "server-only-secret";

  let sessionRecord;
  const database = {
    upsertWechatUser: async ({ openid, unionid }) => {
      assert.equal(openid, "openid-1");
      assert.equal(unionid, "unionid-1");
      return { id: "user-1", display_name: "微信用户" };
    },
    createUserSession: async (userId, tokenHash, expiresAt) => {
      sessionRecord = { userId, tokenHash, expiresAt };
    }
  };
  const fetchImpl = async (url) => {
    const parsed = new URL(url);
    assert.equal(parsed.searchParams.get("appid"), "wx-test-app");
    assert.equal(parsed.searchParams.get("secret"), "server-only-secret");
    assert.equal(parsed.searchParams.get("js_code"), "temporary-code");
    return new Response(JSON.stringify({ openid: "openid-1", unionid: "unionid-1", session_key: "discard-me" }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };
  const response = responseRecorder();

  try {
    await createHandler(database, fetchImpl)({ method: "POST", body: { code: "temporary-code" } }, response);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.user.id, "user-1");
    assert.match(response.body.token, /^[A-Za-z0-9_-]{40,}$/);
    assert.equal(sessionRecord.userId, "user-1");
    assert.match(sessionRecord.tokenHash, /^[0-9a-f]{64}$/);
    assert.notEqual(sessionRecord.tokenHash, response.body.token);
    assert.equal(JSON.stringify(response.body).includes("session_key"), false);
  } finally {
    restoreEnv("WECHAT_APP_ID", originalAppId);
    restoreEnv("WECHAT_APP_SECRET", originalSecret);
  }
});

test("returns a service error when the server-side WeChat secret is missing", async () => {
  const originalAppId = process.env.WECHAT_APP_ID;
  const originalSecret = process.env.WECHAT_APP_SECRET;
  delete process.env.WECHAT_APP_ID;
  delete process.env.WECHAT_APP_SECRET;
  const response = responseRecorder();

  try {
    await createHandler({}, async () => assert.fail("must not call WeChat without config"))(
      { method: "POST", body: { code: "temporary-code" } },
      response
    );
    assert.equal(response.statusCode, 503);
    assert.match(response.body.error, /尚未配置/);
  } finally {
    restoreEnv("WECHAT_APP_ID", originalAppId);
    restoreEnv("WECHAT_APP_SECRET", originalSecret);
  }
});

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function responseRecorder() {
  return {
    headers: {},
    statusCode: 200,
    body: null,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    },
    end() {
      return this;
    }
  };
}
