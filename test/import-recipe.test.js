const test = require("node:test");
const assert = require("node:assert/strict");
const { _internals } = require("../api/import-recipe");

test("parses step photos from Xiachufang mobile step blocks", () => {
  const html = `
    <div class="steps relative">
      <div class="recipe-steps">
        <div class="step step">
          <div class="step-cover"><img src="https://i2.chuimg.com/step-1.jpg?imageView2/1/w/800/h/600" /></div>
          <p class="step-text">1. 鸡蛋打散，加入少许盐。</p>
        </div>
        <div class="step step">
          <div class="step-cover"><img data-src="https://i2.chuimg.com/step-2.jpg" /></div>
          <p class="step-text">2. 西红柿炒出汤汁。<br />倒回鸡蛋。</p>
        </div>
      </div>
    </div>`;

  const steps = _internals.extractStepDetails(html, "https://m.xiachufang.com/recipe/104493058/");
  assert.equal(steps.length, 2);
  assert.equal(steps[0].image, "https://i2.chuimg.com/step-1.jpg?imageView2/1/w/800/h/600");
  assert.match(steps[0].text, /鸡蛋打散/);
  assert.equal(steps[1].image, "https://i2.chuimg.com/step-2.jpg");
  assert.match(steps[1].text, /倒回鸡蛋/);
});

test("keeps JSON-LD HowToStep images as a fallback", () => {
  const html = `
    <title>【步骤图】超嫩滑的番茄炒蛋的做法_下厨房</title>
    <script type="application/ld+json">${JSON.stringify({
      "@type": "Recipe",
      name: "超嫩滑的番茄炒蛋",
      recipeIngredient: ["鸡蛋 4个", "西红柿 2个"],
      recipeInstructions: [
        { "@type": "HowToStep", text: "1. 鸡蛋打散。", image: "https://i2.chuimg.com/json-step-1.jpg" },
        { "@type": "HowToStep", text: "2. 西红柿切块。", image: { url: "https://i2.chuimg.com/json-step-2.jpg" } }
      ]
    })}</script>`;

  const recipe = _internals.parseRecipePage(html, "https://m.xiachufang.com/recipe/104493058/");
  assert.equal(recipe.steps.length, 2);
  assert.equal(recipe.stepDetails[0].image, "https://i2.chuimg.com/json-step-1.jpg");
  assert.equal(recipe.stepDetails[1].image, "https://i2.chuimg.com/json-step-2.jpg");
});

test("parses every illustrated step from the readable Xiachufang fallback", () => {
  const steps = Array.from({ length: 30 }, (_, index) => `
${index + 1}.   第 ${index + 1} 步的详细做法。

![Image ${index + 2}: 葱烧海参步骤${index + 1}](https://i2.chuimg.com/sea-cucumber-${index + 1}.jpg)
`).join("");
  const markdown = `
Title: 葱烧海参

Markdown Content:
![Image 1: 葱烧海参](https://i2.chuimg.com/cover.jpg)

## 用料

干海参 3根
[葱白](http://www.xiachufang.com/category/2321/) 8段

## 葱烧海参的做法
${steps}
## 小贴士
按口味调整。
`;

  const recipe = _internals.parseReadableRecipeMarkdown(
    markdown,
    "https://m.xiachufang.com/recipe/100449129/"
  );
  assert.equal(recipe.name, "葱烧海参");
  assert.equal(recipe.ingredients.length, 2);
  assert.equal(recipe.stepDetails.length, 30);
  assert.equal(recipe.stepDetails[0].image, "https://i2.chuimg.com/sea-cucumber-1.jpg");
  assert.match(recipe.stepDetails[29].text, /第 30 步/);
});

test("uses the readable public-page fallback when Xiachufang blocks the server", async () => {
  const originalFetch = global.fetch;
  const requestedUrls = [];
  global.fetch = async (url) => {
    requestedUrls.push(String(url));
    if (requestedUrls.length === 1) return { ok: false, status: 403 };
    return {
      ok: true,
      text: async () => `
Title: 葱烧海参
## 用料
干海参 3根
葱白 8段
## 葱烧海参的做法
1. 处理海参。\n\n![步骤1](https://i2.chuimg.com/step-1.jpg)
2. 熬制葱油。\n\n![步骤2](https://i2.chuimg.com/step-2.jpg)
3. 收汁装盘。\n\n![步骤3](https://i2.chuimg.com/step-3.jpg)
`
    };
  };

  try {
    const recipe = await _internals.importRecipeFromUrl(
      "https://www.xiachufang.com/recipe/100449129/",
      { includeImages: false, includeStepImages: false }
    );
    assert.match(requestedUrls[0], /^https:\/\/m\.xiachufang\.com\/recipe\/100449129\//);
    assert.equal(requestedUrls[1], "https://r.jina.ai/http://www.xiachufang.com/recipe/100449129/");
    assert.equal(recipe.stepDetails.length, 3);
    assert.equal(recipe.stepDetails[0].image, "");
    assert.equal(recipe.stepDetails[0].imageUrl, "https://i2.chuimg.com/step-1.jpg");
  } finally {
    global.fetch = originalFetch;
  }
});
