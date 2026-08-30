const MAX_BODY_CHARS = 3_000_000;
const MAX_IMAGE_CHARS = 2_500_000;
const DEFAULT_DASHSCOPE_BASE_URL = "https://dashscope.aliyuncs.com";
const DEFAULT_VISION_MODEL = "qwen3-vl-plus";
const DEFAULT_IMAGE_MODEL = "qwen-image-3.0-pro";
const SHARE_IMAGE_WIDTH = 1024;
const SHARE_IMAGE_HEIGHT = 1280;
const PHOTO_ANALYSIS_DAILY_LIMIT = 3;
const defaultDatabase = require("../server/database");
const defaultAuth = require("../server/auth");

function createHandler(database = defaultDatabase, auth = defaultAuth, services = {}) {
  const analyzePhoto = services.analyzeMealPhoto || analyzeMealPhoto;
  const standardizePhoto = services.standardizeImage || standardizeImage;
  const startShareTask = services.startMealShareImageTask || startMealShareImageTask;
  const getShareTask = services.getMealShareImageTask || getMealShareImageTask;

  return async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.status(204).end();
      return;
    }

    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    try {
      const body = await readJsonBody(req);
      const user = await auth.requireUser(req, database);
      const householdId = normalizeHouseholdId(body.householdId);
      const membership = await database.findHouseholdMembership(user.id, householdId);
      if (!membership) throw httpError("你不是这个家庭的成员", 403);
      const includeShareImage = Boolean(body.includeShareImage);
      const suppliedAnalysis = includeShareImage ? normalizeAnalysis(body.analysis) : null;
      if (includeShareImage && body.shareTaskId) {
        if (!suppliedAnalysis?.items?.length) throw httpError("分享图缺少热量分析结果", 400);
        const shareResult = await getShareTask(body.shareTaskId, suppliedAnalysis);
        res.status(200).json({
          analysis: suppliedAnalysis,
          shareImage: shareResult.shareImage,
          shareTaskId: shareResult.taskId,
          shareStatus: shareResult.status
        });
        return;
      }

      const image = await standardizePhoto(normalizeImage(body.image));
      const targetNames = normalizeTargetNames(body.targetNames);
      let usage = null;
      let analysis = suppliedAnalysis;
      if (!analysis?.items?.length) {
        usage = await database.consumeHouseholdPhotoAnalysis({
          householdId,
          usageDate: usageDateShanghai(),
          limit: PHOTO_ANALYSIS_DAILY_LIMIT
        });
        analysis = await analyzePhoto(image, targetNames);
      }
      if (includeShareImage) {
        const shareResult = await startShareTask(image, analysis);
        res.status(200).json({
          analysis,
          shareImage: "",
          shareTaskId: shareResult.taskId,
          shareStatus: shareResult.status,
          usage
        });
        return;
      }
      res.status(200).json({ analysis, shareImage: "", usage });
    } catch (error) {
      res.status(error.statusCode || 400).json({ error: error.message || "热量估算失败" });
    }
  };
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

function buildPrompt() {
  return `
你是家庭饭菜照片的营养估算助手。请观察图片里的每一盘/每碗主要食物，输出热量估算和标注框。

要求：
1. 只依据照片中实际可见的食材、颜色、形态和做法识别菜品；不要参考、猜测或套用用户菜单，也不要补全照片里看不到的菜。
2. 每个主要食物单独作为一个 item，不要把餐具、饮料、餐桌背景算进去；同一盘菜不要重复计算。
3. 菜名不确定时，使用贴合画面的描述性名称（例如“蒜蓉西兰花”“清炒豆芽”），并降低 confidence，不能为了给出熟悉菜名而臆测。
4. 区分相似菜时优先依据可见主料、配菜、汤汁和烹饪形态；看不清的细节不要写进名称或热量依据。
5. bbox 使用 0 到 1 的归一化坐标，x/y 为左上角，width/height 为宽高。
6. calories 是这一盘可见食物的大致千卡估算；先按可见份量、主料和烹饪用油分别估算，再给出整数；totalCalories 是所有 item calories 的合计。
7. confidence 只能是 low、medium、high。照片看不清、遮挡或份量不确定时用 low 或 medium。
8. portion 写你估算的可见份量，比如“约 1 碗”“约 180g”“2 块”。
9. calorieReason 用 24 个中文字符以内说明热量判断依据，比如“鸡蛋约3个并含炒制用油”。
10. notes 简短提醒这是视觉估算，不是精确营养数据。
11. 只输出一个 JSON 对象，不要输出 Markdown 或解释文字。JSON 必须严格符合以下字段：
{"totalCalories":整数,"confidence":"low|medium|high","notes":"字符串","items":[{"label":"字符串","portion":"字符串","calorieReason":"字符串","calories":整数,"confidence":"low|medium|high","bbox":{"x":0到1,"y":0到1,"width":0到1,"height":0到1}}]}
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
        "乱码，错误汉字，错误数字，二维码，水印，品牌标志，新增菜品，替换食物，卡通插画，塑料质感，过度磨皮，机器视觉检测框，黄色滤镜，棕色滤镜，复古滤镜，暗角，压暗照片，过度饱和，改变食物颜色",
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
把这张餐桌照片编辑成竖版 4:5、可以发小红书的自然手绘美食日记。保留原始食物、餐具、桌面和主要构图，不要替换菜品，不要新增不存在的食物，不要把照片变成插画。

视觉要求：
1. 严格保留原照片的自然白平衡、曝光和真实食物颜色，只允许轻微提亮与增加清晰度。禁止全局偏黄、偏橙、偏棕、偏绿、复古胶片、暗角、压暗或高饱和滤镜。
2. 首要任务是逐个描绘物体轮廓：用白色细笔沿每个盘子、碗、杯子、饮料和主要食物的真实外边缘紧贴描线，不是画矩形框，也不是只在旁边画装饰。
3. 每个主要物体至少有一条连续、略不均匀的一笔画白线；重点物体再加一条轻微错位的断续重复线。轮廓必须能让人一眼看出对应的是哪个物体。
4. 从轮廓附近向桌面空白处画短箭头或虚线作为视线引导，箭头不能横穿或遮挡其他食物。
5. 只在空白处适量加入热气、闪光、爱心、星星、小表情和波浪线，保留空白，不要过度装饰。
6. 保持整张照片通透完整，只加入很细的手绘相框轮廓；不要制作顶部或底部的大色块、大白卡、深色信息面板或大面积半透明色块。
7. 图中不要生成任何文字、数字、单位、二维码、水印或品牌标志；准确的菜名、日记短句和热量稍后由程序叠加。
8. 手绘线不能改变食物数量、种类、份量和形状。最终效果应像用白色笔直接在真实照片上随手记录，而不是营养报告或商业海报。

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
  const items = (analysis.items || [])
    .slice(0, 6)
    .sort((a, b) => normalizeBox(a.bbox).y - normalizeBox(b.bbox).y);
  const lastBubbleY = { left: 175, right: 175 };
  const bubbles = items
    .map((item, index) => {
      const box = normalizeBox(item.bbox);
      const targetX = clampInt((box.x + box.width / 2) * SHARE_IMAGE_WIDTH, 60, SHARE_IMAGE_WIDTH - 60);
      const targetY = clampInt(
        (box.y + Math.min(box.height * 0.34, 0.2)) * SHARE_IMAGE_HEIGHT,
        300,
        SHARE_IMAGE_HEIGHT - 100
      );
      const bubbleWidth = clampInt(230 + cleanText(item.label).length * 18, 310, 390);
      const bubbleOnLeft = targetX === SHARE_IMAGE_WIDTH / 2 ? index % 2 === 0 : targetX < SHARE_IMAGE_WIDTH / 2;
      const horizontalDirection = bubbleOnLeft ? 1 : -1;
      const bubbleCenterX = bubbleOnLeft ? bubbleWidth / 2 + 38 : SHARE_IMAGE_WIDTH - bubbleWidth / 2 - 38;
      const sideKey = bubbleOnLeft ? "left" : "right";
      const preferredBubbleY = clampInt(targetY, 245, SHARE_IMAGE_HEIGHT - 130);
      const bubbleCenterY = clampInt(Math.max(preferredBubbleY, lastBubbleY[sideKey] + 145), 245, SHARE_IMAGE_HEIGHT - 130);
      lastBubbleY[sideKey] = bubbleCenterY;
      const x = bubbleCenterX - bubbleWidth / 2;
      const y = bubbleCenterY - 55;
      const rotation = [-2, 1.5, -1, 2, -1.5, 1][index];
      const label = escapeXml(item.label);
      const diaryNote = escapeXml(shareDiaryNote(item.label, index));
      const outlineX = clampInt(box.x * SHARE_IMAGE_WIDTH - 13, 24, SHARE_IMAGE_WIDTH - 80);
      const outlineY = clampInt(box.y * SHARE_IMAGE_HEIGHT - 13, 70, SHARE_IMAGE_HEIGHT - 100);
      const outlineWidth = clampInt(box.width * SHARE_IMAGE_WIDTH + 26, 90, SHARE_IMAGE_WIDTH - outlineX - 24);
      const outlineHeight = clampInt(box.height * SHARE_IMAGE_HEIGHT + 26, 80, SHARE_IMAGE_HEIGHT - outlineY - 30);
      const right = outlineX + outlineWidth;
      const bottom = outlineY + outlineHeight;
      return `
        <g class="object-contour">
          <path d="M ${outlineX + outlineWidth * 0.18} ${outlineY} C ${outlineX + outlineWidth * 0.48} ${outlineY - 8}, ${outlineX + outlineWidth * 0.78} ${outlineY + 5}, ${right - 6} ${outlineY + outlineHeight * 0.23} C ${right + 8} ${outlineY + outlineHeight * 0.52}, ${right - 4} ${outlineY + outlineHeight * 0.8}, ${outlineX + outlineWidth * 0.72} ${bottom} C ${outlineX + outlineWidth * 0.42} ${bottom + 8}, ${outlineX + outlineWidth * 0.14} ${bottom - 4}, ${outlineX + 3} ${outlineY + outlineHeight * 0.72} C ${outlineX - 7} ${outlineY + outlineHeight * 0.42}, ${outlineX + 2} ${outlineY + outlineHeight * 0.14}, ${outlineX + outlineWidth * 0.18} ${outlineY} Z"/>
          <path class="echo" d="M ${outlineX + outlineWidth * 0.2} ${outlineY + 8} C ${outlineX + outlineWidth * 0.5} ${outlineY}, ${outlineX + outlineWidth * 0.8} ${outlineY + 12}, ${right - 13} ${outlineY + outlineHeight * 0.26} C ${right} ${outlineY + outlineHeight * 0.55}, ${right - 12} ${outlineY + outlineHeight * 0.78}, ${outlineX + outlineWidth * 0.7} ${bottom - 8} C ${outlineX + outlineWidth * 0.4} ${bottom}, ${outlineX + outlineWidth * 0.17} ${bottom - 12}, ${outlineX + 11} ${outlineY + outlineHeight * 0.69}"/>
        </g>
        <path class="doodle-arrow" d="M ${bubbleCenterX - horizontalDirection * (bubbleWidth * 0.34)} ${bubbleCenterY + 25} C ${bubbleCenterX - horizontalDirection * (bubbleWidth * 0.54)} ${bubbleCenterY + 47}, ${targetX + horizontalDirection * 32} ${targetY - 24}, ${targetX} ${targetY}" marker-end="url(#arrowhead)"/>
        <g class="meal-bubble" transform="rotate(${rotation} ${bubbleCenterX} ${bubbleCenterY})">
          <path d="M ${x + 22} ${y + 5} Q ${x + bubbleWidth * 0.48} ${y - 3} ${x + bubbleWidth - 18} ${y + 5} Q ${x + bubbleWidth + 3} ${y + 31} ${x + bubbleWidth - 3} ${y + 91} Q ${x + bubbleWidth - 17} ${y + 111} ${x + 27} ${y + 106} Q ${x - 4} ${y + 97} ${x + 3} ${y + 27} Q ${x + 8} ${y + 10} ${x + 22} ${y + 5} Z"/>
          <text x="${bubbleCenterX}" y="${bubbleCenterY - 20}" class="item-label">${label}</text>
          <text x="${bubbleCenterX}" y="${bubbleCenterY + 10}" class="item-note">${diaryNote}</text>
          <text x="${bubbleCenterX}" y="${bubbleCenterY + 39}" class="item-kcal">约 ${item.calories} kcal</text>
        </g>`;
    })
    .join("");

  return `<svg width="${SHARE_IMAGE_WIDTH}" height="${SHARE_IMAGE_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="ink-shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#101510" flood-opacity="0.62"/></filter>
      <filter id="bubble-shadow" x="-20%" y="-30%" width="140%" height="170%"><feDropShadow dx="0" dy="5" stdDeviation="7" flood-color="#101510" flood-opacity="0.32"/></filter>
      <filter id="paper-grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" seed="17"/><feColorMatrix type="saturate" values="0"/></filter>
      <marker id="arrowhead" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L0,6 L9,3 z" fill="#FFFFFF"/></marker>
    </defs>
    <style>
      .title,.total,.item-label,.item-note,.item-kcal{font-family:'LXGW WenKai Lite','LXGW WenKai','Kaiti SC','STKaiti','KaiTi',serif;font-weight:600}
      .title,.total{paint-order:stroke;stroke:#172019;stroke-opacity:0.78;stroke-width:8px;stroke-linejoin:round;filter:url(#ink-shadow)}
      .title{font-size:48px;fill:#FFFDF7;letter-spacing:3px}.total{font-size:56px;fill:#FFE4A8;letter-spacing:1px}
      .meal-bubble{filter:url(#bubble-shadow)}.meal-bubble path{fill:#121713;fill-opacity:0.05;stroke:#FFFDF7;stroke-width:3px;stroke-linejoin:round}
      .item-label,.item-note,.item-kcal{text-anchor:middle;paint-order:stroke;stroke:#172019;stroke-width:3px;stroke-linejoin:round}
      .item-label{font-size:29px;fill:#FFFFFF}.item-note{font-size:21px;fill:#FFFDF7}.item-kcal{font-size:24px;fill:#FFE3A5}
      .doodle-arrow{fill:none;stroke:#FFFDF7;stroke-width:4px;stroke-linecap:round;stroke-dasharray:10 9;filter:url(#ink-shadow)}
      .object-contour{fill:none;stroke:#FFFDF7;stroke-width:5px;stroke-linecap:round;stroke-linejoin:round;filter:url(#ink-shadow)}
      .object-contour .echo{stroke-width:3px;stroke-dasharray:16 12;opacity:0.72}
    </style>
    <rect width="${SHARE_IMAGE_WIDTH}" height="${SHARE_IMAGE_HEIGHT}" filter="url(#paper-grain)" opacity="0.018"/>
    <g fill="none" stroke="#FFFDF7" stroke-linecap="round" stroke-linejoin="round" filter="url(#ink-shadow)">
      <path d="M 35 46 Q 302 24 509 39 T 987 48 Q 1005 306 991 620 T 988 1235 Q 742 1257 503 1243 T 34 1234 Q 18 930 32 643 T 35 46 Z" stroke-width="6"/>
      <path d="M 51 62 Q 284 42 511 57 T 971 65 Q 985 321 974 636 T 970 1218 Q 750 1239 511 1224 T 51 1218 Q 37 927 49 642 T 51 62 Z" stroke-width="3" stroke-dasharray="19 13" opacity="0.82"/>
    </g>
    <g transform="rotate(-2 66 95)">
      <path d="M 45 39 Q 208 20 409 39 L 429 112 Q 225 128 48 112 Z" fill="#111713" fill-opacity="0.28" stroke="#FFFDF7" stroke-width="4" stroke-linejoin="round" filter="url(#bubble-shadow)"/>
      <text x="66" y="88" class="title">今日份美食记录</text>
      <path d="M 48 128 Q 205 111 382 129 L 397 184 Q 216 202 53 184 Z" fill="#111713" fill-opacity="0.24" stroke="#FFFDF7" stroke-width="3" stroke-linejoin="round" filter="url(#bubble-shadow)"/>
      <text x="66" y="173" class="total">约 ${analysis.totalCalories} kcal</text>
    </g>
    ${bubbles}
    <g fill="none" stroke="#FFFDF7" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" filter="url(#ink-shadow)">
      <path d="M 914 87 C 893 60 856 86 914 132 C 972 86 935 60 914 87 Z"/>
      <path d="M 76 1124 l 11 25 27 2-21 17 6 27-23-15-23 15 6-27-21-17 27-2z"/>
      <path d="M 808 1188 q 18-22 36 0 t 36 0 t 36 0"/>
    </g>
  </svg>`;
}

function shareDiaryNote(label, index) {
  const name = cleanText(label);
  if (/咖啡|茶|奶|酒|可乐|汽水|果汁|饮料/.test(name)) return "清爽微甜，刚刚好";
  if (/汤|粥|羹/.test(name)) return "暖乎乎的一口";
  if (/面|粉|饭|饺|包|饼/.test(name)) return "一口下去，好满足";
  if (/鸡|鸭|鱼|虾|牛|羊|猪|肉|排骨|海参/.test(name)) return "香香的，太下饭啦";
  if (/菜|花|瓜|豆|笋|菇|藕|茄|椒|芽/.test(name)) return "清爽脆嫩，刚刚好";
  return ["今天也吃得很幸福", "这一口值得记下来", "刚刚好的小满足"][index % 3];
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

function normalizeHouseholdId(value) {
  const id = String(value || "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw httpError("家庭编号不正确", 400);
  }
  return id;
}

function usageDateShanghai(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now);
}

function httpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
module.exports._internals = {
  analyzeMealPhoto,
  buildPrompt,
  buildShareImagePrompt,
  buildShareOverlaySvg,
  shareDiaryNote,
  dashscopeConfig,
  getMealShareImageTask,
  normalizeAnalysis,
  normalizeImage,
  normalizeHouseholdId,
  parseJsonText,
  startMealShareImageTask,
  standardizeImage,
  usageDateShanghai
};
