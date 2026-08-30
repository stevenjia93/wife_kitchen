const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createDefaultState,
  emptyPlan,
  canUploadMealPhotos,
  todayKey,
  dateFromKey,
  dateKeyFromDate
} = require("../miniprogram/utils/state");

test("starts a new household without seeded dishes", () => {
  assert.deepEqual(createDefaultState().dishes, []);
});

test("keeps meal photo upload available before an order is submitted", () => {
  const state = createDefaultState();
  const plan = emptyPlan();
  assert.equal(canUploadMealPhotos(state, plan, todayKey()), true);

  const tomorrow = dateFromKey(todayKey());
  tomorrow.setDate(tomorrow.getDate() + 1);
  assert.equal(canUploadMealPhotos(state, plan, dateKeyFromDate(tomorrow)), true);
});
