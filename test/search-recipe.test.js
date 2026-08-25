const test = require("node:test");
const assert = require("node:assert/strict");
const { _internals } = require("../api/search-recipe");

test("extracts rating, popularity and ingredients from desktop Xiachufang search cards", () => {
  const html = `
    <ul class="list">
      <li>
        <div class="recipe">
          <a href="/recipe/104493058/"><img data-src="https://i2.chuimg.com/tomato.jpg" alt="超嫩滑的番茄炒蛋" /></a>
          <p class="name"><a href="/recipe/104493058/">超嫩滑的番茄炒蛋</a></p>
          <p class="ing ellipsis"><a>鸡蛋</a>、<a>西红柿</a>、<span>盐</span></p>
          <p class="stats">综合评分&nbsp;<span class="score bold green-font">8.0</span>&nbsp;（<span class="bold score">4346</span>&nbsp;做过）</p>
        </div>
      </li>
    </ul>`;

  const [candidate] = _internals.extractSearchCandidates(
    html,
    "https://www.xiachufang.com/search/?keyword=test",
    "番茄炒蛋"
  );

  assert.equal(candidate.url, "https://www.xiachufang.com/recipe/104493058/");
  assert.equal(candidate.title, "超嫩滑的番茄炒蛋");
  assert.equal(candidate.rating, 8);
  assert.equal(candidate.cookedCount, 4346);
  assert.deepEqual(candidate.ingredients, ["鸡蛋", "西红柿", "盐"]);
});

test("builds a usable fallback recipe when Xiachufang detail pages require verification", () => {
  const recipe = _internals.recipeFromSearchCandidate({
    url: "https://www.xiachufang.com/recipe/104493058/",
    title: "超嫩滑的番茄炒蛋",
    rating: 8,
    cookedCount: 4346,
    image: "https://i2.chuimg.com/tomato.jpg",
    ingredients: ["鸡蛋", "西红柿", "盐"]
  });

  assert.equal(recipe.name, "超嫩滑的番茄炒蛋");
  assert.equal(recipe.searchRating, 8);
  assert.equal(recipe.searchCookedCount, 4346);
  assert.match(recipe.note, /访问验证/);
});
