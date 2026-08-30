const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createDefaultState,
  emptyPlan,
  normalizeAppState,
  normalizePlan,
  elapsedMeals,
  actionableUnresolvedMeals,
  applyPreferredMealSkips
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

test("uses household meal preferences without blocking an unused meal", () => {
  const plan = emptyPlan();
  const now = new Date("2026-08-30T09:00:00+08:00");

  assert.deepEqual(actionableUnresolvedMeals(plan, "2026-08-31", now, ["dinner"]), ["dinner"]);
});

test("normalizes shared meal preferences and editable dish meal tags", () => {
  const base = createDefaultState();
  const normalized = normalizeAppState({
    ...base,
    preferredMeals: ["dinner", "invalid", "dinner"],
    dishes: [{ id: "custom", name: "家常豆腐", meals: ["breakfast", "dinner", "invalid"] }]
  });

  assert.deepEqual(normalized.preferredMeals, ["dinner"]);
  assert.deepEqual(normalized.dishes[0].meals, ["breakfast", "dinner"]);
});

test("keeps all meals as the backwards-compatible default", () => {
  const normalized = normalizeAppState({ dishes: [{ id: "custom", name: "家常豆腐" }] });

  assert.deepEqual(normalized.preferredMeals, ["breakfast", "lunch", "dinner"]);
  assert.deepEqual(normalized.dishes[0].meals, ["breakfast", "lunch", "dinner"]);
});

test("auto-skips unused non-preferred meals without deleting an existing arrangement", () => {
  const plan = normalizePlan({ lunch: ["tomato-eggs"], reopened: { breakfast: true, lunch: true } });

  applyPreferredMealSkips(plan, ["dinner"]);

  assert.equal(plan.skipped.breakfast, true);
  assert.equal(plan.reopened.breakfast, false);
  assert.equal(plan.skipped.lunch, false);
  assert.deepEqual(plan.lunch, ["tomato-eggs"]);
});
