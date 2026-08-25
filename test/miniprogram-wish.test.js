const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeAppState } = require("../miniprogram/utils/state");

test("preserves automatic recipe search results for mini program wishes", () => {
  const state = normalizeAppState({
    dishes: [],
    plans: {
      "2026-08-25": {
        breakfast: [],
        lunch: [],
        dinner: [],
        skipped: {},
        wishes: [
          {
            id: "wish-1",
            meal: "dinner",
            name: "蒜香排骨",
            status: "found",
            recipe: {
              name: "高分蒜香排骨",
              sourceUrl: "https://www.xiachufang.com/recipe/123/",
              searchRating: 9.1,
              searchCookedCount: 860
            }
          }
        ]
      }
    }
  });

  const wish = state.plans["2026-08-25"].wishes[0];
  assert.equal(wish.status, "found");
  assert.equal(wish.recipe.name, "高分蒜香排骨");
  assert.equal(wish.recipe.searchRating, 9.1);
  assert.equal(wish.recipe.searchCookedCount, 860);
});

test("marks stale automatic recipe searches as failed", () => {
  const state = normalizeAppState({
    dishes: [],
    plans: {
      "2026-08-25": {
        breakfast: [],
        lunch: [],
        dinner: [],
        skipped: {},
        wishes: [
          {
            id: "wish-2",
            meal: "dinner",
            name: "糖醋里脊",
            status: "searching",
            searchStartedAt: "2026-08-25T00:00:00.000Z"
          }
        ]
      }
    }
  });

  const wish = state.plans["2026-08-25"].wishes[0];
  assert.equal(wish.status, "failed");
  assert.match(wish.error, /超时/);
});
