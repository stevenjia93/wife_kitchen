const test = require("node:test");
const assert = require("node:assert/strict");
const sharp = require("sharp");

const {
  analyzeMealPhoto,
  buildShareImagePrompt,
  buildShareOverlaySvg,
  dashscopeConfig,
  getMealShareImageTask,
  parseJsonText,
  startMealShareImageTask,
  standardizeImage
} = require("../api/analyze-meal-photo")._internals;

test("千问 VL 使用百炼北京兼容接口并规范化分析结果", async () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.DASHSCOPE_API_KEY;
  const originalBaseUrl = process.env.DASHSCOPE_BASE_URL;
  process.env.DASHSCOPE_API_KEY = "test-dashscope-key";
  process.env.DASHSCOPE_BASE_URL = "https://example.maas.aliyuncs.com/";

  let request;
  global.fetch = async (url, options) => {
    request = { url, options, body: JSON.parse(options.body) };
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                totalCalories: 320,
                confidence: "high",
                notes: "按照片估算",
                items: [
                  {
                    label: "番茄炒蛋",
                    portion: "约1盘",
                    calorieReason: "含鸡蛋和炒制用油",
                    calories: 320,
                    confidence: "high",
                    bbox: { x: 0.1, y: 0.2, width: 0.5, height: 0.4 }
                  }
                ]
              })
            }
          }
        ]
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  };

  try {
    const analysis = await analyzeMealPhoto("data:image/jpeg;base64,AA==", ["番茄炒蛋"]);
    assert.equal(request.url, "https://example.maas.aliyuncs.com/compatible-mode/v1/chat/completions");
    assert.equal(request.body.model, "qwen3-vl-plus");
    assert.equal(request.body.response_format.type, "json_object");
    assert.equal(request.body.messages[0].content[1].image_url.url, "data:image/jpeg;base64,AA==");
    assert.equal(analysis.totalCalories, 320);
    assert.equal(analysis.items[0].label, "番茄炒蛋");
  } finally {
    global.fetch = originalFetch;
    restoreEnv("DASHSCOPE_API_KEY", originalKey);
    restoreEnv("DASHSCOPE_BASE_URL", originalBaseUrl);
  }
});

test("分享图使用百炼异步任务接口创建", async () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.DASHSCOPE_API_KEY;
  const originalBaseUrl = process.env.DASHSCOPE_BASE_URL;
  process.env.DASHSCOPE_API_KEY = "test-dashscope-key";
  process.env.DASHSCOPE_BASE_URL = "https://example.maas.aliyuncs.com";

  let generationRequest;
  global.fetch = async (url, options = {}) => {
    generationRequest = { url, options, body: JSON.parse(options.body) };
    return new Response(
      JSON.stringify({ output: { task_id: "0385dc79-5ff8-4d82-bcb6-123456789abc", task_status: "PENDING" } }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  };

  const analysis = {
    totalCalories: 468,
    items: [
      {
        label: "鱼香肉丝",
        calories: 468,
        portion: "约1盘",
        bbox: { x: 0.2, y: 0.25, width: 0.45, height: 0.35 }
      }
    ]
  };

  try {
    const result = await startMealShareImageTask("data:image/jpeg;base64,AA==", analysis);
    assert.equal(generationRequest.url, "https://example.maas.aliyuncs.com/api/v1/services/aigc/image-generation/generation");
    assert.equal(generationRequest.options.headers["x-dashscope-async"], "enable");
    assert.equal(generationRequest.body.model, "qwen-image-3.0-pro");
    assert.equal(generationRequest.body.input.messages[0].content[0].image, "data:image/jpeg;base64,AA==");
    assert.equal(generationRequest.body.parameters.size, "1024*1280");
    assert.equal(result.status, "PENDING");
    assert.equal(result.taskId, "0385dc79-5ff8-4d82-bcb6-123456789abc");
  } finally {
    global.fetch = originalFetch;
    restoreEnv("DASHSCOPE_API_KEY", originalKey);
    restoreEnv("DASHSCOPE_BASE_URL", originalBaseUrl);
  }
});

test("异步分享图完成后叠加精确热量文字并返回 JPEG", async () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.DASHSCOPE_API_KEY;
  const originalBaseUrl = process.env.DASHSCOPE_BASE_URL;
  process.env.DASHSCOPE_API_KEY = "test-dashscope-key";
  process.env.DASHSCOPE_BASE_URL = "https://example.maas.aliyuncs.com";

  const generatedPng = await sharp({
    create: { width: 1024, height: 1280, channels: 3, background: "#d8d0bd" }
  })
    .png()
    .toBuffer();
  global.fetch = async (url) => {
    if (url.includes("/api/v1/tasks/")) {
      return new Response(
        JSON.stringify({
          output: {
            task_id: "0385dc79-5ff8-4d82-bcb6-123456789abc",
            task_status: "SUCCEEDED",
            choices: [{ message: { content: [{ image: "https://result.example/share.png" }] } }]
          }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    if (url === "https://result.example/share.png") {
      return new Response(generatedPng, { status: 200, headers: { "content-type": "image/png" } });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  try {
    const result = await getMealShareImageTask("0385dc79-5ff8-4d82-bcb6-123456789abc", {
      totalCalories: 468,
      items: [{ label: "鱼香肉丝", calories: 468, bbox: { x: 0.2, y: 0.25, width: 0.45, height: 0.35 } }]
    });
    assert.equal(result.status, "SUCCEEDED");
    assert.match(result.shareImage, /^data:image\/jpeg;base64,/);
    const metadata = await sharp(Buffer.from(result.shareImage.split(",")[1], "base64")).metadata();
    assert.equal(metadata.format, "jpeg");
    assert.equal(metadata.width, 1024);
    assert.equal(metadata.height, 1280);
  } finally {
    global.fetch = originalFetch;
    restoreEnv("DASHSCOPE_API_KEY", originalKey);
    restoreEnv("DASHSCOPE_BASE_URL", originalBaseUrl);
  }
});

test("分享图提示词禁止模型渲染不可靠的文字和数字", () => {
  const prompt = buildShareImagePrompt({ totalCalories: 500, items: [] });
  assert.match(prompt, /不要生成任何文字、数字/);
  assert.match(prompt, /保留原始食物/);
  assert.match(prompt, /不要制作顶部或底部的大色块、大白卡、信息面板/);
  const overlay = buildShareOverlaySvg({
    totalCalories: 500,
    items: [{ label: "番茄炒蛋", calories: 500, bbox: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 } }]
  });
  assert.match(overlay, /约 500 kcal/);
  assert.match(overlay, /class="meal-bubble"/);
  assert.match(overlay, /class="doodle-arrow"/);
  assert.match(overlay, /LXGW WenKai Lite/);
  assert.doesNotMatch(overlay, /width="940" height="326"/);
  assert.doesNotMatch(overlay, /仅按照片粗估/);
});

test("服务端会把上传图片统一转换为标准 JPEG", async () => {
  const png = await sharp({ create: { width: 24, height: 24, channels: 3, background: "#e6b354" } })
    .png()
    .toBuffer();
  const dataUrl = await standardizeImage(`data:image/jpeg;base64,${png.toString("base64")}`);
  assert.match(dataUrl, /^data:image\/jpeg;base64,/);
  const metadata = await sharp(Buffer.from(dataUrl.split(",")[1], "base64")).metadata();
  assert.equal(metadata.format, "jpeg");
});

test("百炼响应可兼容 JSON 代码块且缺少密钥时给出明确错误", () => {
  assert.deepEqual(parseJsonText("```json\n{\"totalCalories\":120}\n```"), { totalCalories: 120 });
  const originalKey = process.env.DASHSCOPE_API_KEY;
  delete process.env.DASHSCOPE_API_KEY;
  try {
    assert.throws(() => dashscopeConfig(), /阿里云百炼 API Key 未配置/);
  } finally {
    restoreEnv("DASHSCOPE_API_KEY", originalKey);
  }
});

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
