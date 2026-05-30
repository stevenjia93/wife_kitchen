const MAX_BODY_CHARS = 3_000_000;
const MAX_IMAGE_CHARS = 2_500_000;
const DEFAULT_MODEL = "gpt-5.4-mini";
const DEFAULT_IMAGE_MODEL = "gpt-image-2";

async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const body = await readJsonBody(req);
    const image = normalizeImage(body.image);
    const targetNames = normalizeTargetNames(body.targetNames);
    const includeShareImage = Boolean(body.includeShareImage);
    const suppliedAnalysis = includeShareImage ? normalizeAnalysis(body.analysis) : null;
    const analysis = suppliedAnalysis?.items?.length ? suppliedAnalysis : await analyzeMealPhoto(image, targetNames);
    const shareImage = includeShareImage ? await generateMealShareImage(image, analysis) : "";
    res.status(200).json({ analysis, shareImage });
  } catch (error) {
    res.status(error.statusCode || 400).json({ error: error.message || "热量估算失败" });
  }
}

async function analyzeMealPhoto(image, targetNames = []) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw httpError("OpenAI API key 未配置", 500);

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_VISION_MODEL || DEFAULT_MODEL,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: buildPrompt(targetNames)
            },
            {
              type: "input_image",
              image_url: image
            }
          ]
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "meal_calorie_analysis",
          strict: true,
          schema: analysisSchema()
        }
      }
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw httpError(payload.error?.message || "OpenAI 图片分析失败", response.status || 502);
  }

  const text = extractResponseText(payload);
  const parsed = JSON.parse(text);
  return normalizeAnalysis(parsed);
}

function buildPrompt(targetNames) {
  const knownDishes = targetNames.length ? `\n今天菜单候选：${targetNames.join("、")}。优先把画面里的食物匹配到这些菜名；如果明显不是，也可以写识别到的菜名。` : "";
  return `
你是家庭饭菜照片的营养估算助手。请观察图片里的每一盘/每碗主要食物，输出热量估算和标注框。

要求：
1. 每个主要食物单独作为一个 item，不要把餐具、饮料、餐桌背景算进去。
2. bbox 使用 0 到 1 的归一化坐标，x/y 为左上角，width/height 为宽高。
3. calories 是这一盘可见食物的大致千卡估算；totalCalories 是所有 item calories 的合计。
4. confidence 只能是 low、medium、high。照片看不清、遮挡或份量不确定时用 low 或 medium。
5. portion 写你估算的可见份量，比如“约 1 碗”“约 180g”“2 块”。
6. calorieReason 用 24 个中文字符以内说明热量判断依据，比如“含米饭和芝士酱”。
7. notes 简短提醒这是视觉估算，不是精确营养数据。
${knownDishes}
`.trim();
}

function analysisSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["totalCalories", "confidence", "notes", "items"],
    properties: {
      totalCalories: { type: "integer", minimum: 0, maximum: 6000 },
      confidence: { type: "string", enum: ["low", "medium", "high"] },
      notes: { type: "string" },
      items: {
        type: "array",
        maxItems: 12,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["label", "portion", "calorieReason", "calories", "confidence", "bbox"],
          properties: {
            label: { type: "string" },
            portion: { type: "string" },
            calorieReason: { type: "string" },
            calories: { type: "integer", minimum: 0, maximum: 2500 },
            confidence: { type: "string", enum: ["low", "medium", "high"] },
            bbox: {
              type: "object",
              additionalProperties: false,
              required: ["x", "y", "width", "height"],
              properties: {
                x: { type: "number", minimum: 0, maximum: 1 },
                y: { type: "number", minimum: 0, maximum: 1 },
                width: { type: "number", minimum: 0, maximum: 1 },
                height: { type: "number", minimum: 0, maximum: 1 }
              }
            }
          }
        }
      }
    }
  };
}

function normalizeAnalysis(value = {}) {
  const items = Array.isArray(value.items)
    ? value.items
        .map((item) => ({
          label: cleanText(item.label).slice(0, 24) || "食物",
          portion: cleanText(item.portion).slice(0, 24) || "可见份量",
          calorieReason: cleanText(item.calorieReason).slice(0, 32) || "按照片估算",
          calories: clampInt(item.calories, 0, 2500),
          confidence: normalizeConfidence(item.confidence),
          bbox: normalizeBox(item.bbox)
        }))
        .filter((item) => item.bbox.width > 0.02 && item.bbox.height > 0.02)
    : [];
  const total = items.reduce((sum, item) => sum + item.calories, 0);
  return {
    totalCalories: clampInt(value.totalCalories || total, 0, 6000),
    confidence: normalizeConfidence(value.confidence),
    notes: cleanText(value.notes).slice(0, 120) || "根据照片做粗略估算，实际热量会受份量和做法影响。",
    items
  };
}

async function generateMealShareImage(image, analysis) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw httpError("OpenAI API key 未配置", 500);

  const form = new FormData();
  form.append("model", process.env.OPENAI_IMAGE_MODEL || DEFAULT_IMAGE_MODEL);
  form.append("prompt", buildShareImagePrompt(analysis));
  form.append("image", dataUrlToBlob(image), "meal-photo.jpg");
  form.append("size", process.env.OPENAI_IMAGE_SIZE || "auto");
  form.append("quality", process.env.OPENAI_IMAGE_QUALITY || "medium");
  form.append("output_compression", process.env.OPENAI_IMAGE_OUTPUT_COMPRESSION || "85");
  form.append("output_format", "jpeg");

  const response = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`
    },
    body: form
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw httpError(payload.error?.message || "OpenAI 手绘分享图生成失败", response.status || 502);
  }

  const base64 = payload.data?.[0]?.b64_json || payload.b64_json || "";
  if (!base64) throw httpError("OpenAI 没有返回分享图", 502);
  return `data:image/jpeg;base64,${base64}`;
}

function buildShareImagePrompt(analysis) {
  const itemLines = (analysis.items || [])
    .slice(0, 8)
    .map((item, index) => `${index + 1}. ${item.label}，约 ${item.calories} kcal，${item.portion}`)
    .join("\n");

  return `
编辑这张餐桌照片：保留原始食物、餐具、桌面和构图，不要替换菜品，不要新增不存在的食物。

在照片上添加小红书/ins 风格的白色手绘涂鸦标注：每道主要菜旁边用白色手绘圈线、箭头、可爱气泡和少量爱心/星星装饰圈出来。中文手写风标注要清晰、温馨、日常。

必须标注这些热量估算：
总计：约 ${analysis.totalCalories} kcal
${itemLines}

画面风格参考：白色涂鸦线条、手写中文、轻松治愈、像美食日记。文字尽量贴近对应菜品，不要遮住食物主体。热量是粗略估算，请在角落加一行小字“仅按照片粗估”。
`.trim();
}

function dataUrlToBlob(dataUrl) {
  const [header, base64 = ""] = String(dataUrl || "").split(",");
  const mime = /^data:([^;]+);base64$/i.exec(header)?.[1] || "image/jpeg";
  return new Blob([Buffer.from(base64, "base64")], { type: mime });
}

function normalizeBox(box = {}) {
  const x = clampNumber(box.x, 0, 1);
  const y = clampNumber(box.y, 0, 1);
  const width = clampNumber(box.width, 0, 1 - x);
  const height = clampNumber(box.height, 0, 1 - y);
  return { x, y, width, height };
}

function normalizeConfidence(value) {
  return ["low", "medium", "high"].includes(value) ? value : "medium";
}

function normalizeImage(value) {
  const image = String(value || "").trim();
  if (!image) throw httpError("请上传照片", 400);
  if (!/^data:image\/(jpeg|jpg|png|webp);base64,[a-z0-9+/=]+$/i.test(image)) {
    throw httpError("图片格式不正确", 400);
  }
  if (image.length > MAX_IMAGE_CHARS) throw httpError("图片过大，请压缩后再试", 413);
  return image;
}

function normalizeTargetNames(value) {
  const list = Array.isArray(value) ? value : [];
  return list.map(cleanText).filter(Boolean).slice(0, 12);
}

function extractResponseText(payload) {
  if (payload.output_text) return payload.output_text;
  for (const item of payload.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) return content.text;
      if (content.text) return content.text;
    }
  }
  throw httpError("OpenAI 没有返回可解析结果", 502);
}

function readJsonBody(req) {
  if (req.body !== undefined) {
    if (typeof req.body === "string") return Promise.resolve(JSON.parse(req.body || "{}"));
    return Promise.resolve(req.body || {});
  }

  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > MAX_BODY_CHARS) reject(httpError("请求内容过大", 413));
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(raw || "{}"));
      } catch {
        reject(httpError("请求格式不正确", 400));
      }
    });
    req.on("error", reject);
  });
}

function clampInt(value, min, max) {
  return Math.round(clampNumber(value, min, max));
}

function clampNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, number));
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function httpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

module.exports = handler;
module.exports._internals = {
  analyzeMealPhoto,
  generateMealShareImage,
  normalizeAnalysis,
  normalizeImage
};
