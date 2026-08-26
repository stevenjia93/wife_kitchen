const test = require("node:test");
const assert = require("node:assert/strict");
const { createHandler, _internals } = require("../api/households");

const HOUSEHOLD_ID = "44444444-4444-4444-8444-444444444444";

test("lists only households belonging to the authenticated user", async () => {
  const database = {
    listUserHouseholds: async (userId) => {
      assert.equal(userId, "user-1");
      return [{ id: HOUSEHOLD_ID, name: "嘉嘉的小厨房", role: "owner" }];
    }
  };
  const auth = { requireUser: async () => ({ id: "user-1", display_name: "微信用户" }) };
  const response = responseRecorder();

  await createHandler(database, auth)({ method: "POST", body: { action: "list" } }, response);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body.households, [{ id: HOUSEHOLD_ID, name: "嘉嘉的小厨房", role: "owner" }]);
});

test("creates a limited invitation and stores only its hash", async () => {
  let storedInvitation;
  const database = {
    createHouseholdInvitation: async (value) => {
      storedInvitation = value;
      return { householdId: HOUSEHOLD_ID, householdName: "嘉嘉的小厨房", role: "owner" };
    }
  };
  const auth = {
    requireUser: async () => ({ id: "user-1" }),
    hashToken: (token) => `hash:${token}`
  };
  const response = responseRecorder();

  await createHandler(database, auth)(
    { method: "POST", body: { action: "invite", householdId: HOUSEHOLD_ID } },
    response
  );

  assert.equal(response.statusCode, 201);
  assert.match(response.body.inviteToken, /^[A-Za-z0-9_-]{24,}$/);
  assert.equal(storedInvitation.tokenHash, `hash:${response.body.inviteToken}`);
  assert.equal(storedInvitation.maxUses, 5);
  assert.equal(storedInvitation.householdId, HOUSEHOLD_ID);
});

test("joins a household with an invitation token", async () => {
  const database = {
    joinHouseholdByInvitation: async ({ userId, tokenHash }) => {
      assert.equal(userId, "user-2");
      assert.equal(tokenHash, "hashed-invite");
      return { id: HOUSEHOLD_ID, name: "嘉嘉的小厨房", role: "member" };
    }
  };
  const auth = {
    requireUser: async () => ({ id: "user-2" }),
    hashToken: () => "hashed-invite"
  };
  const response = responseRecorder();

  await createHandler(database, auth)(
    { method: "POST", body: { action: "join", inviteToken: "abcdefghijklmnopqrstuvwxyz123456" } },
    response
  );

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.household.role, "member");
});

test("validates household and invitation identifiers", () => {
  assert.equal(_internals.normalizeHouseholdId(HOUSEHOLD_ID), HOUSEHOLD_ID);
  assert.throws(() => _internals.normalizeHouseholdId("household-1"), /家庭编号/);
  assert.throws(() => _internals.normalizeInviteToken("short"), /邀请链接/);
});

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
