const test = require("node:test");
const assert = require("node:assert/strict");
const {
  emptyPlan,
  normalizePlan,
  elapsedMeals,
  actionableUnresolvedMeals
} = require("../miniprogram/utils/state");

test("treats elapsed unresolved meals as non-blocking for today's order", () => {
  const plan = emptyPlan();
  const now = new Date("2026-08-30T15:16:00+08:00");

  assert.deepEqual(elapsedMeals(plan, "2026-08-30", now), ["breakfast", "lunch"]);
  assert.deepEqual(actionableUnresolvedMeals(plan, "2026-08-30", now), ["dinner"]);
});

test("keeps future meals actionable and supports explicitly reopening an elapsed meal", () => {
  const now = new Date("2026-08-30T15:16:00+08:00");
  const futurePlan = emptyPlan();
  assert.deepEqual(actionableUnresolvedMeals(futurePlan, "2026-08-31", now), ["breakfast", "lunch", "dinner"]);

  const todayPlan = normalizePlan({ reopened: { breakfast: true } });
  assert.deepEqual(elapsedMeals(todayPlan, "2026-08-30", now), ["lunch"]);
  assert.deepEqual(actionableUnresolvedMeals(todayPlan, "2026-08-30", now), ["breakfast", "dinner"]);
});

test("does not mark an already arranged meal as elapsed", () => {
  const plan = normalizePlan({ breakfast: ["egg-pancake"] });
  const now = new Date("2026-08-30T15:16:00+08:00");

  assert.deepEqual(elapsedMeals(plan, "2026-08-30", now), ["lunch"]);
});
