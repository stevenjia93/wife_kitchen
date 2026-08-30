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

test("builds an in-app fallback guide when Xiachufang detail pages require verification", () => {
  const matchedRecipe = _internals.recipeFromSearchCandidate({
    url: "https://www.xiachufang.com/recipe/104493058/",
    title: "超嫩滑的番茄炒蛋",
    rating: 8,
    cookedCount: 4346,
    image: "https://i2.chuimg.com/tomato.jpg",
    ingredients: ["鸡蛋", "西红柿", "盐"]
  });
  const recipe = _internals.buildLocalRecipeGuide(matchedRecipe, "番茄炒蛋");

  assert.equal(recipe.name, "超嫩滑的番茄炒蛋");
  assert.equal(recipe.searchRating, 8);
  assert.equal(recipe.searchCookedCount, 4346);
  assert.equal(recipe.guideSource, "local");
  assert.ok(recipe.ingredients.length >= 3);
  assert.ok(recipe.steps.length >= 4);
  assert.doesNotMatch(recipe.steps.join(" "), /复制|链接/);
});

test("uses Qwen to complete a matched recipe without readable steps", async () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.DASHSCOPE_API_KEY;
  process.env.DASHSCOPE_API_KEY = "test-key";
  global.fetch = async (url, options) => {
    assert.equal(url, "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions");
    const body = JSON.parse(options.body);
    assert.equal(body.model, "qwen-plus");
    assert.equal(body.enable_search, undefined);
    assert.equal(body.enable_text_image_mixed, undefined);
    return {
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({
              name: "超嫩滑的番茄炒蛋",
              time: 15,
              ingredients: ["鸡蛋 3个", "西红柿 2个", "盐 2克", "食用油 15毫升"],
              steps: ["鸡蛋打散。", "西红柿切块。", "鸡蛋炒熟盛出。", "炒出番茄汁后回锅合炒。"]
            })
          }
        }]
      })
    };
  };

  try {
    const recipe = await _internals.ensureInAppRecipeGuide({
      name: "超嫩滑的番茄炒蛋",
      sourceUrl: "https://www.xiachufang.com/recipe/104493058/",
      ingredients: ["鸡蛋", "西红柿", "盐"],
      steps: []
    }, "番茄炒蛋");
    assert.equal(recipe.guideSource, "qwen");
    assert.equal(recipe.steps.length, 4);
    assert.match(recipe.note, /千问整理/);
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.DASHSCOPE_API_KEY;
    else process.env.DASHSCOPE_API_KEY = originalKey;
  }
});

test("prefers a complete recipe with step photos", () => {
  const plain = _internals.scoreRecipeCompleteness({
    name: "番茄炒蛋",
    image: "cover.jpg",
    ingredients: ["鸡蛋", "番茄"],
    steps: ["第一步", "第二步", "第三步"],
    stepDetails: [{ text: "第一步" }, { text: "第二步" }, { text: "第三步" }]
  }, "番茄炒蛋");
  const illustrated = _internals.scoreRecipeCompleteness({
    name: "番茄炒蛋",
    image: "cover.jpg",
    ingredients: ["鸡蛋", "番茄"],
    steps: ["第一步", "第二步", "第三步"],
    stepDetails: [
      { text: "第一步", imageUrl: "step-1.jpg" },
      { text: "第二步", imageUrl: "step-2.jpg" },
      { text: "第三步", imageUrl: "step-3.jpg" }
    ]
  }, "番茄炒蛋");
  assert.ok(illustrated > plain);
});

test("keeps source step photos when Qwen supplies cleaner step text", () => {
  const details = _internals.mergeGuideStepDetails(
    ["打散鸡蛋", "炒软番茄"],
    [
      { text: "旧步骤一", imageUrl: "https://i2.chuimg.com/step-1.jpg" },
      { text: "旧步骤二", image: "https://i2.chuimg.com/step-2.jpg" }
    ]
  );
  assert.deepEqual(details, [
    { text: "打散鸡蛋", image: "", imageUrl: "https://i2.chuimg.com/step-1.jpg" },
    {
      text: "炒软番茄",
      image: "https://i2.chuimg.com/step-2.jpg",
      imageUrl: "https://i2.chuimg.com/step-2.jpg"
    }
  ]);
});

test("normalizes image URLs returned by Qwen mixed text-image search", () => {
  const steps = _internals.normalizeGeneratedStepDetails([
    { text: "鸡蛋打散。", imageUrl: "https://i2.chuimg.com/egg.jpg" },
    "<img src=\"https://i2.chuimg.com/tomato.jpg\">番茄炒出汤汁。",
    { text: "合炒一分钟。", imageUrl: "javascript:alert(1)" }
  ]);
  assert.deepEqual(steps, [
    { text: "鸡蛋打散。", image: "", imageUrl: "https://i2.chuimg.com/egg.jpg" },
    { text: "番茄炒出汤汁。", image: "", imageUrl: "https://i2.chuimg.com/tomato.jpg" },
    { text: "合炒一分钟。", image: "", imageUrl: "" }
  ]);
});
