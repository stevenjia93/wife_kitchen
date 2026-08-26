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
把这张餐桌照片编辑成竖版 4:5、可以发小红书的美食热量记录底图。保留原始食物、餐具、桌面和主要构图，不要替换菜品，不要新增不存在的食物，不要把照片变成插画。

视觉要求：
1. 轻微提升自然光、食物色泽和层次，保持真实照片质感，不要过度磨皮或改变食物外观。
2. 不要使用矩形检测框、边界框、UI 样式框或机器视觉风格。
3. 用白色 Apple Pencil 手绘感线条，沿盘子、碗和主要食物的真实外轮廓做不规则圈线；可以有一条虚线或重复描边，线条要松弛自然。
4. 在桌面空白处点缀少量手绘爱心、四角星、波浪线和小箭头，像生活方式博主直接在照片上做的随手笔记。
5. 保持整张照片通透完整，不要制作顶部或底部的大色块、大白卡、信息面板，也不要为了排版制造正式留白区。
6. 图中不要生成任何文字、数字、单位、二维码、水印或品牌标志；准确文字稍后由程序叠加。
7. 手绘线和装饰不要遮挡食物主体，不要改变食物数量、种类或份量。
8. 整体要温暖、有生活气、轻盈俏皮，像好看的小红书美食手账，而不是营养报告或商业海报。

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
  const bubbles = items
    .map((item, index) => {
      const box = normalizeBox(item.bbox);
      const targetX = clampInt((box.x + box.width / 2) * SHARE_IMAGE_WIDTH, 60, SHARE_IMAGE_WIDTH - 60);
      const targetY = clampInt(
        (box.y + Math.min(box.height * 0.34, 0.2)) * SHARE_IMAGE_HEIGHT,
        300,
        SHARE_IMAGE_HEIGHT - 100
      );
      const bubbleWidth = clampInt(250 + cleanText(item.label).length * 22, 350, 470);
      const bubbleCenterX = clampInt(targetX, bubbleWidth / 2 + 38, SHARE_IMAGE_WIDTH - bubbleWidth / 2 - 38);
      const bubbleCenterY = clampInt(
        (box.y + Math.min(box.height * 0.18, 0.06)) * SHARE_IMAGE_HEIGHT,
        220,
        SHARE_IMAGE_HEIGHT - 170
      );
      const x = bubbleCenterX - bubbleWidth / 2;
      const y = bubbleCenterY - 47;
      const rotation = [-2, 1.5, -1, 2, -1.5, 1][index];
      const color = index % 2 ? "#FFE1A6" : "#DDF0DF";
      const label = escapeXml(item.label);
      return `
        <path class="doodle-arrow" d="M ${bubbleCenterX + 8} ${y + 91} C ${bubbleCenterX + 28} ${y + 126}, ${targetX - 34} ${targetY - 38}, ${targetX} ${targetY}" marker-end="url(#arrowhead)"/>
        <g class="meal-bubble" transform="rotate(${rotation} ${bubbleCenterX} ${bubbleCenterY})">
          <path d="M ${x + 26} ${y + 3} Q ${x + bubbleWidth * 0.48} ${y - 4} ${x + bubbleWidth - 22} ${y + 4} Q ${x + bubbleWidth + 5} ${y + 28} ${x + bubbleWidth - 2} ${y + 68} Q ${x + bubbleWidth - 14} ${y + 96} ${x + 32} ${y + 92} Q ${x - 5} ${y + 84} ${x + 2} ${y + 26} Q ${x + 8} ${y + 8} ${x + 26} ${y + 3} Z"/>
          <text x="${bubbleCenterX}" y="${bubbleCenterY - 3}" class="item-label">${label}</text>
          <text x="${bubbleCenterX}" y="${bubbleCenterY + 30}" class="item-kcal" fill="${color}">约 ${item.calories} kcal</text>
        </g>`;
    })
    .join("");

  return `<svg width="${SHARE_IMAGE_WIDTH}" height="${SHARE_IMAGE_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="ink-shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#101510" flood-opacity="0.62"/></filter>
      <filter id="bubble-shadow" x="-20%" y="-30%" width="140%" height="170%"><feDropShadow dx="0" dy="5" stdDeviation="7" flood-color="#101510" flood-opacity="0.32"/></filter>
      <marker id="arrowhead" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L0,6 L9,3 z" fill="#FFFFFF"/></marker>
    </defs>
    <style>
      .title,.total,.item-label,.item-kcal,.note{font-family:'Noto Sans CJK SC','Source Han Sans SC','Microsoft YaHei',sans-serif}
      .title,.total{paint-order:stroke;stroke:#172019;stroke-opacity:0.72;stroke-width:8px;stroke-linejoin:round;filter:url(#ink-shadow)}
      .title{font-size:46px;font-weight:800;fill:#FFFDF7;letter-spacing:2px}.total{font-size:56px;font-weight:900;fill:#FFE4A8}
      .meal-bubble{filter:url(#bubble-shadow)}.meal-bubble path{fill:#1E2620;fill-opacity:0.70;stroke:#FFFFFF;stroke-width:3px;stroke-linejoin:round}
      .item-label,.item-kcal{text-anchor:middle;paint-order:stroke;stroke:#1E2620;stroke-width:2px;stroke-linejoin:round}
      .item-label{font-size:29px;font-weight:800;fill:#FFFFFF}.item-kcal{font-size:24px;font-weight:800}
      .doodle-arrow{fill:none;stroke:#FFFFFF;stroke-width:5px;stroke-linecap:round;stroke-dasharray:11 9;filter:url(#ink-shadow)}
      .note{font-size:22px;font-weight:600;fill:#FFFDF7;paint-order:stroke;stroke:#172019;stroke-opacity:0.72;stroke-width:6px;stroke-linejoin:round}
    </style>
    <g transform="rotate(-2 66 95)">
      <text x="58" y="86" class="title">今日份美食记录</text>
      <text x="60" y="151" class="total">约 ${analysis.totalCalories} kcal</text>
      <path d="M 64 165 Q 210 184 382 164" fill="none" stroke="#FFFDF7" stroke-width="5" stroke-linecap="round" stroke-dasharray="15 10" filter="url(#ink-shadow)"/>
    </g>
    ${bubbles}
    <g fill="none" stroke="#FFFDF7" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" filter="url(#ink-shadow)">
      <path d="M 914 87 C 893 60 856 86 914 132 C 972 86 935 60 914 87 Z"/>
      <path d="M 76 1124 l 11 25 27 2-21 17 6 27-23-15-23 15 6-27-21-17 27-2z"/>
      <path d="M 808 1188 q 18-22 36 0 t 36 0 t 36 0"/>
    </g>
    <text x="970" y="1240" class="note" text-anchor="end">仅按照片粗估</text>
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
