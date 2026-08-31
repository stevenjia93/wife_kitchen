const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createDefaultState,
  emptyPlan,
  canUploadMealPhotos,
  normalizeAppState,
  todayKey,
  dateFromKey,
  dateKeyFromDate
} = require("../miniprogram/utils/state");

test("starts a new household with three illustrated home dishes", () => {
  const state = createDefaultState();
  assert.deepEqual(state.dishes.map((dish) => dish.name), ["西红柿炒鸡蛋", "宫保鸡丁", "玉米排骨汤"]);
  assert.deepEqual(state.dishes.map((dish) => dish.stepDetails.length), [16, 6, 13]);
  assert.ok(state.dishes.every((dish) => dish.imageUrl.startsWith("https://i2.chuimg.com/")));
  assert.ok(state.dishes.every((dish) => dish.stepDetails.every((step) => step.imageUrl.startsWith("https://i2.chuimg.com/"))));
});

test("does not share mutable starter dishes between households", () => {
  const first = createDefaultState();
  first.dishes[0].name = "改过的菜名";
  first.dishes[0].ingredients[0].name = "改过的原料";
  first.dishes[0].stepDetails[0].text = "改过的步骤";

  const second = createDefaultState();
  assert.equal(second.dishes[0].name, "西红柿炒鸡蛋");
  assert.equal(second.dishes[0].ingredients[0].name, "西红柿");
  assert.equal(second.dishes[0].stepDetails[0].text, "准备好所需材料。");
});

test("keeps meal photo upload available before an order is submitted", () => {
  const state = createDefaultState();
  const plan = emptyPlan();
  assert.equal(canUploadMealPhotos(state, plan, todayKey()), true);

  const tomorrow = dateFromKey(todayKey());
  tomorrow.setDate(tomorrow.getDate() + 1);
  assert.equal(canUploadMealPhotos(state, plan, dateKeyFromDate(tomorrow)), true);

  state.photoAnalysisUsage = { dateKey: todayKey(), count: 99 };
  assert.equal(canUploadMealPhotos(state, plan, todayKey()), true);
});

test("blocks replacing a photo while AI processing is still running", () => {
  const state = createDefaultState();
  const plan = emptyPlan();
  plan.afterPhotos = [{ id: "photo-1", analysisStatus: "loading", shareStatus: "idle" }];
  assert.equal(canUploadMealPhotos(state, plan, todayKey()), false);
});

test("keeps a valid shared household cover and rejects oversized cover data", () => {
  const cover = `data:image/jpeg;base64,${"a".repeat(120)}`;
  assert.equal(normalizeAppState({ householdCover: cover }).householdCover, cover);

  const oversized = `data:image/jpeg;base64,${"a".repeat(1_200_001)}`;
  assert.equal(normalizeAppState({ householdCover: oversized }).householdCover, "");
});
