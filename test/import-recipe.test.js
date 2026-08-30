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
