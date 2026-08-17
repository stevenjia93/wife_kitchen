const test = require("node:test");
const assert = require("node:assert/strict");
const { createHandler, _internals } = require("../api/miniprogram-state");

test("loads an existing household state", async () => {
  const database = {
    findOrCreateHousehold: async (code) => {
      assert.equal(code, "family-2026");
      return "household-1";
    },
    loadHouseholdState: async () => ({
      payload: { dishes: [{ id: "dish-1", name: "番茄炒蛋" }] },
      updated_at: new Date("2026-08-17T00:00:00.000Z")
    }),
    saveHouseholdState: async () => assert.fail("load must not save an unchanged payload")
  };
  const response = responseRecorder();

  await createHandler(database)({ method: "POST", body: { code: "Family-2026" } }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.householdId, "household-1");
  assert.equal(response.body.payload.dishes[0].name, "番茄炒蛋");
  assert.equal(response.body.updatedAt, "2026-08-17T00:00:00.000Z");
});

test("saves compacted state without embedded data images", async () => {
  let savedPayload;
  const database = {
    findOrCreateHousehold: async () => "household-2",
    loadHouseholdState: async () => assert.fail("save must not load"),
    saveHouseholdState: async (_householdId, payload) => {
      savedPayload = payload;
      return new Date("2026-08-17T01:00:00.000Z");
    }
  };
  const response = responseRecorder();

  await createHandler(database)(
    {
      method: "POST",
      body: {
        code: "home",
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

test("rejects an invalid household code before database access", async () => {
  const database = {
    findOrCreateHousehold: async () => assert.fail("invalid input must not access database")
  };
  const response = responseRecorder();

  await createHandler(database)({ method: "POST", body: { code: "不合法" } }, response);

  assert.equal(response.statusCode, 400);
  assert.match(response.body.error, /只能包含/);
});

test("normalizes household codes", () => {
  assert.equal(_internals.normalizeHouseholdCode("  Family_A  "), "family_a");
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
