const MAX_BODY_CHARS = 3_000_000;
const MAX_IMAGE_CHARS = 2_500_000;
const DEFAULT_DASHSCOPE_BASE_URL = "https://dashscope.aliyuncs.com";
const DEFAULT_VISION_MODEL = "qwen3-vl-plus";
const DEFAULT_IMAGE_MODEL = "qwen-image-3.0-pro";
const SHARE_IMAGE_WIDTH = 1024;
const SHARE_IMAGE_HEIGHT = 1280;

async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
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
    const includeShareImage = Boolean(body.includeShareImage);
    const suppliedAnalysis = includeShareImage ? normalizeAnalysis(body.analysis) : null;
    if (includeShareImage && body.shareTaskId) {
      if (!suppliedAnalysis?.items?.length) throw httpError("分享图缺少热量分析结果", 400);
      const shareResult = await getMealShareImageTask(body.shareTaskId, suppliedAnalysis);
      res.status(200).json({
        analysis: suppliedAnalysis,
        shareImage: shareResult.shareImage,
        shareTaskId: shareResult.taskId,
        shareStatus: shareResult.status
      });
      return;
    }

    const image = await standardizeImage(normalizeImage(body.image));
    const targetNames = normalizeTargetNames(body.targetNames);
    const analysis = suppliedAnalysis?.items?.length ? suppliedAnalysis : await analyzeMealPhoto(image, targetNames);
    if (includeShareImage) {
      const shareResult = await startMealShareImageTask(image, analysis);
      res.status(200).json({
        analysis,
        shareImage: "",
        shareTaskId: shareResult.taskId,
        shareStatus: shareResult.status
      });
      return;
    }
    res.status(200).json({ analysis, shareImage: "" });
  } catch (error) {
    res.status(error.statusCode || 400).json({ error: error.message || "热量估算失败" });
  }
}

async function analyzeMealPhoto(image, targetNames = []) {
  const { apiKey, baseUrl } = dashscopeConfig();

  const response = await fetch(`${baseUrl}/compatible-mode/v1/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    signal: AbortSignal.timeout(timeoutMs("DASHSCOPE_VISION_TIMEOUT_MS", 60_000)),
    body: JSON.stringify({
      model: process.env.DASHSCOPE_VISION_MODEL || DEFAULT_VISION_MODEL,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: buildPrompt(targetNames)
            },
            {
              type: "image_url",
              image_url: { url: image }
            }
          ]
        }
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 2200
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw httpError(payload.error?.message || payload.message || "千问 VL 图片分析失败", response.status || 502);
  }

  const text = extractChatText(payload);
  const parsed = parseJsonText(text);
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
8. 只输出一个 JSON 对象，不要输出 Markdown 或解释文字。JSON 必须严格符合以下字段：
{"totalCalories":整数,"confidence":"low|medium|high","notes":"字符串","items":[{"label":"字符串","portion":"字符串","calorieReason":"字符串","calories":整数,"confidence":"low|medium|high","bbox":{"x":0到1,"y":0到1,"width":0到1,"height":0到1}}]}
${knownDishes}
`.trim();
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

async function startMealShareImageTask(image, analysis) {
  const { apiKey, baseUrl } = dashscopeConfig();
  const response = await fetch(`${baseUrl}/api/v1/services/aigc/image-generation/generation`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      "x-dashscope-async": "enable"
    },
    signal: AbortSignal.timeout(timeoutMs("DASHSCOPE_TASK_TIMEOUT_MS", 30_000)),
    body: JSON.stringify(buildShareImageRequest(image, analysis))
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw httpError(payload.message || payload.error?.message || "阿里云分享图任务创建失败", response.status || 502);
  }
  const taskId = normalizeShareTaskId(payload.output?.task_id);
  return { taskId, status: normalizeShareTaskStatus(payload.output?.task_status) };
}

async function getMealShareImageTask(taskIdValue, analysis) {
  const { apiKey, baseUrl } = dashscopeConfig();
  const taskId = normalizeShareTaskId(taskIdValue);
  const response = await fetch(`${baseUrl}/api/v1/tasks/${encodeURIComponent(taskId)}`, {
    headers: { authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(timeoutMs("DASHSCOPE_TASK_TIMEOUT_MS", 30_000))
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw httpError(payload.message || payload.output?.message || "分享图任务查询失败", response.status || 502);
  }

  const status = normalizeShareTaskStatus(payload.output?.task_status);
  if (["PENDING", "RUNNING"].includes(status)) return { taskId, status, shareImage: "" };
  if (status !== "SUCCEEDED") {
    throw httpError(payload.output?.message || payload.message || "阿里云分享图生成失败", 502);
  }

  const imageUrl = payload.output?.choices?.[0]?.message?.content?.find((item) => item.image)?.image || "";
  if (!imageUrl) throw httpError("阿里云没有返回分享图", 502);

  const imageResponse = await fetch(imageUrl, {
    signal: AbortSignal.timeout(timeoutMs("DASHSCOPE_DOWNLOAD_TIMEOUT_MS", 30_000))
  });
  if (!imageResponse.ok) throw httpError("分享图下载失败", 502);
  const generatedImage = Buffer.from(await imageResponse.arrayBuffer());
  const finalImage = await composeShareCard(generatedImage, analysis);
  return {
    taskId,
    status,
    shareImage: `data:image/jpeg;base64,${finalImage.toString("base64")}`
  };
}

function buildShareImageRequest(image, analysis) {
  return {
    model: process.env.DASHSCOPE_IMAGE_MODEL || DEFAULT_IMAGE_MODEL,
    input: {
      messages: [
        {
          role: "user",
          content: [{ image }, { text: buildShareImagePrompt(analysis) }]
        }
      ]
    },
    parameters: {
      prompt_extend: true,
      prompt_extend_mode: "direct",
      enable_thinking: true,
      n: 1,
      size: process.env.DASHSCOPE_IMAGE_SIZE || `${SHARE_IMAGE_WIDTH}*${SHARE_IMAGE_HEIGHT}`,
      negative_prompt:
        "乱码，错误汉字，错误数字，二维码，水印，品牌标志，新增菜品，替换食物，卡通插画，塑料质感，过度磨皮，机器视觉检测框",
      watermark: false
    }
  };
}

function buildShareImagePrompt(analysis) {
  const itemLines = (analysis.items || [])
    .slice(0, 8)
    .map((item, index) => `${index + 1}. ${item.label}，约 ${item.calories} kcal，${item.portion}，位置：${boxPositionText(item.bbox)}`)
    .join("\n");

  return `
把这张餐桌照片编辑成竖版 4:5、可以发小红书的精致美食记录底图。保留原始食物、餐具和主要构图，不要替换菜品，不要新增不存在的食物，不要把照片变成插画。

视觉要求：
1. 提升自然光、食物色泽和层次，使用奶油白、鼠尾草绿和少量暖橙色，保持真实摄影质感。
2. 不要使用矩形检测框、边界框、UI 样式框或机器视觉风格。
3. 用轻盈的白色手绘线沿盘子、碗和主要食物外轮廓做少量不规则圈线，搭配小爱心、星星和波浪线。
4. 上方和下方各保留一块干净、对比度稳定的留白区域，后续由程序写入标题和精确热量信息。
5. 图中不要生成任何文字、数字、单位、二维码、水印或品牌标志，避免错误信息。
6. 不要遮挡食物主体，不要改变食物数量、种类或份量。
7. 整体像生活方式博主精修过的真实美食照片，干净、温暖、克制。

画面内容参考（仅用于构图，不得渲染成文字）：总计约 ${analysis.totalCalories} kcal；${itemLines || "一份家庭餐"}。
`.trim();
}

function boxPositionText(box = {}) {
  const x = clampNumber(box.x + box.width / 2, 0, 1);
  const y = clampNumber(box.y + box.height / 2, 0, 1);
  const horizontal = x < 0.34 ? "左侧" : x > 0.66 ? "右侧" : "中间";
  const vertical = y < 0.34 ? "上方" : y > 0.66 ? "下方" : "中部";
  return `${vertical}${horizontal}`;
}

async function composeShareCard(imageBuffer, analysis) {
  const sharp = require("sharp");
  const svg = buildShareOverlaySvg(analysis);
  return sharp(imageBuffer)
    .rotate()
    .resize(SHARE_IMAGE_WIDTH, SHARE_IMAGE_HEIGHT, { fit: "cover" })
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .jpeg({ quality: 88, chromaSubsampling: "4:4:4" })
    .toBuffer();
}

function buildShareOverlaySvg(analysis) {
  const items = (analysis.items || []).slice(0, 6);
  const rows = items
    .map((item, index) => {
      const column = index % 2;
      const row = Math.floor(index / 2);
      const x = 78 + column * 455;
      const y = 982 + row * 64;
      const color = column ? "#E9A95B" : "#6C8B76";
      return `<circle cx="${x}" cy="${y - 7}" r="13" fill="${color}"/><text x="${x}" y="${y - 1}" class="marker">${index + 1}</text><text x="${x + 26}" y="${y}" class="item">${escapeXml(item.label)} · ${item.calories} kcal</text>`;
    })
    .join("");
  const markers = items
    .map((item, index) => {
      const centerX = clampInt((item.bbox.x + item.bbox.width / 2) * SHARE_IMAGE_WIDTH, 34, SHARE_IMAGE_WIDTH - 34);
      const centerY = clampInt((item.bbox.y + item.bbox.height / 2) * SHARE_IMAGE_HEIGHT, 250, 880);
      return `<circle cx="${centerX}" cy="${centerY}" r="23" fill="#FFFFFF" fill-opacity="0.92" stroke="#6C8B76" stroke-width="4"/><text x="${centerX}" y="${centerY + 8}" class="photo-marker">${index + 1}</text>`;
    })
    .join("");

  return `<svg width="${SHARE_IMAGE_WIDTH}" height="${SHARE_IMAGE_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <style>
      .title,.total,.item,.note,.marker,.photo-marker{font-family:'Noto Sans CJK SC','Source Han Sans SC','Microsoft YaHei',sans-serif}
      .title{font-size:48px;font-weight:700;fill:#182019}.total{font-size:66px;font-weight:800;fill:#182019}
      .item{font-size:28px;font-weight:600;fill:#27322A}.note{font-size:23px;font-weight:400;fill:#556159}
      .marker{font-size:18px;font-weight:800;fill:#FFFFFF;text-anchor:middle}.photo-marker{font-size:28px;font-weight:800;fill:#476351;text-anchor:middle}
    </style>
    <rect x="42" y="38" width="940" height="188" rx="38" fill="#FFFDF8" fill-opacity="0.90"/>
    <text x="78" y="105" class="title">今日份美食记录</text>
    <text x="78" y="184" class="total">约 ${analysis.totalCalories} kcal</text>
    ${markers}
    <rect x="42" y="914" width="940" height="326" rx="42" fill="#FFFDF8" fill-opacity="0.93"/>
    ${rows}
    <text x="78" y="1200" class="note">AI 视觉估算，仅供日常记录参考</text>
  </svg>`;
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

async function standardizeImage(image) {
  try {
    const sharp = require("sharp");
    const base64 = image.slice(image.indexOf(",") + 1);
    const buffer = await sharp(Buffer.from(base64, "base64"))
      .rotate()
      .resize({ width: 1536, height: 1536, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 86, chromaSubsampling: "4:4:4" })
      .toBuffer();
    return `data:image/jpeg;base64,${buffer.toString("base64")}`;
  } catch {
    throw httpError("图片无法读取，请重新选择照片", 400);
  }
}

function normalizeTargetNames(value) {
  const list = Array.isArray(value) ? value : [];
  return list.map(cleanText).filter(Boolean).slice(0, 12);
}

function normalizeShareTaskId(value) {
  const taskId = String(value || "").trim();
  if (!/^[a-z0-9][a-z0-9-]{7,79}$/i.test(taskId)) throw httpError("分享图任务编号不正确", 400);
  return taskId;
}

function normalizeShareTaskStatus(value) {
  const status = String(value || "").trim().toUpperCase();
  if (!["PENDING", "RUNNING", "SUCCEEDED", "FAILED", "CANCELED", "UNKNOWN"].includes(status)) {
    throw httpError("阿里云返回了未知的分享图任务状态", 502);
  }
  return status;
}

function dashscopeConfig() {
  const apiKey = String(process.env.DASHSCOPE_API_KEY || "").trim();
  if (!apiKey) throw httpError("阿里云百炼 API Key 未配置", 500);
  const baseUrl = String(process.env.DASHSCOPE_BASE_URL || DEFAULT_DASHSCOPE_BASE_URL)
    .trim()
    .replace(/\/+$/, "");
  return { apiKey, baseUrl };
}

function extractChatText(payload) {
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content === "string" && content.trim()) return content;
  if (Array.isArray(content)) {
    const text = content.map((item) => item.text || item.content || "").join("").trim();
    if (text) return text;
  }
  throw httpError("千问 VL 没有返回可解析结果", 502);
}

function parseJsonText(value) {
  const text = String(value || "").trim();
  try {
    return JSON.parse(text);
  } catch {
    const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(text)?.[1];
    if (fenced) return JSON.parse(fenced);
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
    throw httpError("千问 VL 返回的数据格式不正确", 502);
  }
}

function timeoutMs(envName, fallback) {
  return clampInt(process.env[envName] || fallback, 5_000, 180_000);
}

function escapeXml(value) {
  return cleanText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
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
  buildShareImagePrompt,
  buildShareOverlaySvg,
  dashscopeConfig,
  getMealShareImageTask,
  normalizeAnalysis,
  normalizeImage,
  parseJsonText,
  startMealShareImageTask,
  standardizeImage
};
