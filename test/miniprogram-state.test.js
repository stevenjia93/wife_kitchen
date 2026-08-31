const test = require("node:test");
const assert = require("node:assert/strict");
const { createHandler, _internals } = require("../api/miniprogram-state");

test("loads an existing household state", async () => {
  const householdId = "11111111-1111-4111-8111-111111111111";
  const database = {
    findHouseholdMembership: async (userId, id) => {
      assert.equal(userId, "user-1");
      assert.equal(id, householdId);
      return { role: "owner", name: "嘉嘉的小厨房" };
    },
    loadHouseholdState: async () => ({
      payload: { dishes: [{ id: "dish-1", name: "番茄炒蛋" }] },
      updated_at: new Date("2026-08-17T00:00:00.000Z")
    }),
    saveHouseholdState: async () => assert.fail("load must not save an unchanged payload")
  };
  const auth = { requireUser: async () => ({ id: "user-1" }) };
  const response = responseRecorder();

  await createHandler(database, auth)({ method: "POST", body: { householdId } }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.householdId, householdId);
  assert.equal(response.body.role, "owner");
  assert.equal(response.body.payload.dishes[0].name, "番茄炒蛋");
  assert.equal(response.body.updatedAt, "2026-08-17T00:00:00.000Z");
});

test("saves compacted state without embedded data images", async () => {
  const householdId = "22222222-2222-4222-8222-222222222222";
  let savedPayload;
  const database = {
    findHouseholdMembership: async () => ({ role: "member", name: "我们的家" }),
    loadHouseholdState: async () => assert.fail("save must not load"),
    saveHouseholdState: async (_householdId, payload) => {
      savedPayload = payload;
      return new Date("2026-08-17T01:00:00.000Z");
    }
  };
  const auth = { requireUser: async () => ({ id: "user-2" }) };
  const response = responseRecorder();

  await createHandler(database, auth)(
    {
      method: "POST",
      body: {
        householdId,
        payload: {
          dishes: [{ id: "dish-2", image: "data:image/jpeg;base64,abc", imageUrl: "https://img.example/dish.jpg" }],
          plans: {}
        }
      }
    },
    response
  );

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.saved, true);
  assert.equal(savedPayload.dishes[0].image, "https://img.example/dish.jpg");
  assert.equal(JSON.stringify(savedPayload).includes("data:image"), false);
});

test("keeps the household cover in shared state while stripping transient meal media", async () => {
  const householdId = "66666666-6666-4666-8666-666666666666";
  const cover = "data:image/jpeg;base64,family-cover";
  let savedPayload;
  const database = {
    findHouseholdMembership: async () => ({ role: "member", name: "我们的家" }),
    saveHouseholdState: async (_householdId, payload) => {
      savedPayload = payload;
      return new Date("2026-08-31T02:00:00.000Z");
    }
  };
  const auth = { requireUser: async () => ({ id: "user-cover" }) };
  const response = responseRecorder();

  await createHandler(database, auth)(
    {
      method: "POST",
      body: {
        householdId,
        payload: {
          householdCover: cover,
          plans: {
            "2026-08-31": { afterPhotos: [{ id: "photo-1", image: "data:image/jpeg;base64,meal" }] }
          }
        }
      }
    },
    response
  );

  assert.equal(response.statusCode, 200);
  assert.equal(savedPayload.householdCover, cover);
  assert.equal(savedPayload.plans["2026-08-31"].afterPhotos[0].image, "");
});

test("rejects an invalid household id before membership access", async () => {
  const database = {
    findHouseholdMembership: async () => assert.fail("invalid input must not access database")
  };
  const auth = { requireUser: async () => ({ id: "user-3" }) };
  const response = responseRecorder();

  await createHandler(database, auth)({ method: "POST", body: { householdId: "不合法" } }, response);

  assert.equal(response.statusCode, 400);
  assert.match(response.body.error, /家庭编号/);
});

test("rejects state access for a non-member", async () => {
  const database = {
    findHouseholdMembership: async () => null,
    loadHouseholdState: async () => assert.fail("non-member must not load household state")
  };
  const auth = { requireUser: async () => ({ id: "user-4" }) };
  const response = responseRecorder();

  await createHandler(database, auth)(
    { method: "POST", body: { householdId: "55555555-5555-4555-8555-555555555555" } },
    response
  );

  assert.equal(response.statusCode, 403);
  assert.match(response.body.error, /不是这个家庭的成员/);
});

test("normalizes household ids", () => {
  const id = "33333333-3333-4333-8333-333333333333";
  assert.equal(_internals.normalizeHouseholdId(`  ${id}  `), id);
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
