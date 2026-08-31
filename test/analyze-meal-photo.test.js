const test = require("node:test");
const assert = require("node:assert/strict");
const sharp = require("sharp");

const analyzeMealPhotoModule = require("../api/analyze-meal-photo");
const { createHandler } = analyzeMealPhotoModule;
const {
  analyzeMealPhoto,
  buildPrompt,
  buildShareImagePrompt,
  buildShareOverlaySvg,
  shareLabel,
  dashscopeConfig,
  getMealShareImageTask,
  parseJsonText,
  startMealShareImageTask,
  standardizeImage,
  usageDateShanghai
} = analyzeMealPhotoModule._internals;

test("照片识别验证家庭成员并原子消耗每日额度", async () => {
  const householdId = "11111111-1111-4111-8111-111111111111";
  let consumed;
  const database = {
    findHouseholdMembership: async (userId, id) => {
      assert.equal(userId, "user-1");
      assert.equal(id, householdId);
      return { role: "member" };
    },
    consumeHouseholdPhotoAnalysis: async (input) => {
      consumed = input;
      return { used: 2, remaining: 1, limit: 3 };
    }
  };
  const auth = { requireUser: async () => ({ id: "user-1" }) };
  const response = responseRecorder();
  const handler = createHandler(database, auth, {
    standardizeImage: async (image) => image,
    analyzeMealPhoto: async () => ({ totalCalories: 320, confidence: "medium", items: [{ label: "番茄炒蛋" }] })
  });

  await handler(
    {
      method: "POST",
      body: { householdId, image: "data:image/jpeg;base64,AA==", includeShareImage: false }
    },
    response
  );

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body.usage, { used: 2, remaining: 1, limit: 3 });
  assert.equal(consumed.householdId, householdId);
  assert.equal(consumed.limit, 3);
  assert.match(consumed.usageDate, /^\d{4}-\d{2}-\d{2}$/);
});

test("已有识别结果生成分享图时不重复消耗照片识别额度", async () => {
  const householdId = "22222222-2222-4222-8222-222222222222";
  const database = {
    findHouseholdMembership: async () => ({ role: "owner" }),
    consumeHouseholdPhotoAnalysis: async () => assert.fail("share generation must not consume recognition quota")
  };
  const auth = { requireUser: async () => ({ id: "user-2" }) };
  const response = responseRecorder();
  const handler = createHandler(database, auth, {
    standardizeImage: async (image) => image,
    startMealShareImageTask: async () => ({ taskId: "task-1", status: "PENDING" })
  });

  await handler(
    {
      method: "POST",
      body: {
        householdId,
        image: "data:image/jpeg;base64,AA==",
        includeShareImage: true,
        analysis: {
          totalCalories: 320,
          confidence: "medium",
          items: [
            {
              label: "番茄炒蛋",
              portion: "约1盘",
              calories: 320,
              confidence: "medium",
              bbox: { x: 0.1, y: 0.1, width: 0.6, height: 0.5 }
            }
          ]
        }
      }
    },
    response
  );

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.shareTaskId, "task-1");
  assert.equal(response.body.usage, null);
});

test("照片识别结果和原图按家庭日期保存", async () => {
  const householdId = "33333333-3333-4333-8333-333333333333";
  let stored;
  const database = {
    findHouseholdMembership: async () => ({ role: "member" }),
    consumeHouseholdPhotoAnalysis: async () => ({ used: 1, remaining: 2, limit: 3 }),
    upsertHouseholdMealPhoto: async (value) => {
      stored = value;
      return { photo_id: value.photoId };
    }
  };
  const handler = createHandler(database, { requireUser: async () => ({ id: "user-3" }) }, {
    standardizeImage: async (image) => image,
    analyzeMealPhoto: async () => ({
      totalCalories: 320,
      confidence: "medium",
      items: [{ label: "番茄炒蛋", calories: 320, bbox: { x: 0.1, y: 0.1, width: 0.6, height: 0.5 } }]
    })
  });
  const response = responseRecorder();

  await handler({
    method: "POST",
    body: {
      householdId,
      dateKey: "2026-08-31",
      photoId: "photo-12345678",
      image: "data:image/jpeg;base64,AA=="
    }
  }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(stored.householdId, householdId);
  assert.equal(stored.dateKey, "2026-08-31");
  assert.equal(stored.photoId, "photo-12345678");
  assert.equal(stored.originalMime, "image/jpeg");
  assert.equal(Buffer.isBuffer(stored.originalImage), true);
  assert.equal(stored.analysis.totalCalories, 320);
});

test("已登录家庭成员可恢复当天原图、识别结果和分享图", async () => {
  const householdId = "44444444-4444-4444-8444-444444444444";
  const database = {
    findHouseholdMembership: async () => ({ role: "owner" }),
    loadHouseholdMealPhoto: async () => ({
      photo_id: "photo-87654321",
      original_image: Buffer.from("original"),
      original_mime: "image/jpeg",
      analysis: { totalCalories: 500, confidence: "medium", items: [] },
      share_task_id: "task-87654321",
      share_status: "SUCCEEDED",
      share_image: Buffer.from("share"),
      share_mime: "image/jpeg",
      share_created_at: new Date("2026-08-31T04:00:00.000Z")
    })
  };
  const handler = createHandler(database, { requireUser: async () => ({ id: "user-4" }) });
  const response = responseRecorder();

  await handler({
    method: "POST",
    body: {
      action: "load",
      householdId,
      dateKey: "2026-08-31",
      photoId: "photo-87654321"
    }
  }, response);

  assert.equal(response.statusCode, 200);
  assert.match(response.body.image, /^data:image\/jpeg;base64,/);
  assert.match(response.body.shareImage, /^data:image\/jpeg;base64,/);
  assert.equal(response.body.shareStatus, "SUCCEEDED");
  assert.equal(response.body.remoteStored, true);
});

test("分享图任务编号和完成图片会写回当天照片记录", async () => {
  const householdId = "55555555-5555-4555-8555-555555555555";
  let savedShare;
  const analysis = {
    totalCalories: 260,
    confidence: "medium",
    items: [{ label: "玉米排骨汤", calories: 260, bbox: { x: 0.2, y: 0.2, width: 0.5, height: 0.5 } }]
  };
  const database = {
    findHouseholdMembership: async () => ({ role: "member" }),
    loadHouseholdMealPhoto: async () => ({
      photo_id: "photo-abcdefgh",
      original_image: Buffer.from("original"),
      original_mime: "image/jpeg",
      analysis
    }),
    saveHouseholdMealPhotoShare: async (value) => {
      savedShare = value;
    }
  };
  const handler = createHandler(database, { requireUser: async () => ({ id: "user-5" }) }, {
    getMealShareImageTask: async () => ({
      taskId: "task-abcdefgh",
      status: "SUCCEEDED",
      shareImage: "data:image/jpeg;base64,c2hhcmU="
    })
  });
  const response = responseRecorder();

  await handler({
    method: "POST",
    body: {
      householdId,
      dateKey: "2026-08-31",
      photoId: "photo-abcdefgh",
      includeShareImage: true,
      shareTaskId: "task-abcdefgh",
      analysis
    }
  }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(savedShare.status, "SUCCEEDED");
  assert.equal(savedShare.shareMime, "image/jpeg");
  assert.equal(savedShare.shareImage.toString(), "share");
});

test("每日额度按上海自然日计算", () => {
  assert.equal(usageDateShanghai(new Date("2026-08-30T15:59:59.000Z")), "2026-08-30");
  assert.equal(usageDateShanghai(new Date("2026-08-30T16:00:00.000Z")), "2026-08-31");
});

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
    assert.doesNotMatch(request.body.messages[0].content[0].text, /今天菜单候选|番茄炒蛋/);
    assert.match(request.body.messages[0].content[0].text, /只依据照片中实际可见/);
    assert.equal(analysis.totalCalories, 320);
    assert.equal(analysis.items[0].label, "番茄炒蛋");
  } finally {
    global.fetch = originalFetch;
    restoreEnv("DASHSCOPE_API_KEY", originalKey);
    restoreEnv("DASHSCOPE_BASE_URL", originalBaseUrl);
  }
});

test("图片识别提示词不把既有菜单当作菜品答案", () => {
  const prompt = buildPrompt(["椒盐排条", "蚝油生菜"]);
  assert.doesNotMatch(prompt, /椒盐排条|蚝油生菜|菜单候选/);
  assert.match(prompt, /不要补全照片里看不到的菜/);
  assert.match(prompt, /描述性名称/);
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
    assert.equal(generationRequest.body.model, "qwen-image-3.0");
    assert.equal(generationRequest.body.parameters.enable_thinking, false);
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

test("分享图叠加层使用克制的 ins 手账标题、粉色点缀和云朵注解", () => {
  const svg = buildShareOverlaySvg({
    totalCalories: 680,
    items: [{ label: "蒜蓉西兰花", calories: 120, bbox: { x: 0.62, y: 0.3, width: 0.22, height: 0.2 } }]
  });
  assert.match(svg, /paper-grain/);
  assert.match(svg, /今日份美食记录/);
  assert.match(svg, /蒜蓉西兰花/);
  assert.match(svg, /class="note-cloud"/);
  assert.match(svg, /class="accent-pink"/);
  assert.doesNotMatch(svg, /class="object-contour"/);
  assert.doesNotMatch(svg, /stroke-dasharray="19 13"/);
  assert.match(svg, /清爽脆嫩，刚刚好/);
  assert.doesNotMatch(svg, /#F7E9C9/);
  assert.equal(shareLabel("滑蛋汤（含蛋花与少量青豆）"), "滑蛋汤");
});

test("分享图提示词禁止模型渲染不可靠的文字和数字", () => {
  const prompt = buildShareImagePrompt({ totalCalories: 500, items: [] });
  assert.match(prompt, /不要生成任何文字、数字/);
  assert.match(prompt, /禁止全局偏黄、偏橙、偏棕/);
  assert.match(prompt, /给 3 到 4 个最主要、边缘清楚的盘子或碗描绘真实物体轮廓/);
  assert.match(prompt, /原图观感至少保留 95%/);
  assert.match(prompt, /禁止用粗大的闭合圆圈/);
  assert.match(prompt, /画面至少保留 65% 完全没有涂画的区域/);
  assert.match(prompt, /不要在图中添加气泡框、箭头、标题/);
  assert.match(prompt, /输出必须高清/);
  assert.match(prompt, /保留原始食物/);
  assert.match(prompt, /不要制作顶部或底部的大色块、大白卡、深色信息面板/);
  const overlay = buildShareOverlaySvg({
    totalCalories: 500,
    items: [{ label: "番茄炒蛋", calories: 500, bbox: { x: 0.1, y: 0.1, width: 0.4, height: 0.4 } }]
  });
  assert.match(overlay, /约 500 kcal/);
  assert.match(overlay, /class="note-cloud"/);
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

function responseRecorder() {
  return {
    headers: {},
    statusCode: 200,
    body: null,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    },
    end() {
      return this;
    }
  };
}
