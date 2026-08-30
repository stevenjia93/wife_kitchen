const importRecipeApi = require("./import-recipe.js");

const MAX_SEARCH_HTML_CHARS = 1_000_000;
const SEARCH_IMPORT_LIMIT = 3;
const SEARCH_FETCH_TIMEOUT_MS = 6500;
const RECIPE_FETCH_TIMEOUT_MS = 9000;
const RECIPE_IMAGE_TIMEOUT_MS = 6500;
const DEFAULT_DASHSCOPE_BASE_URL = "https://dashscope.aliyuncs.com";
const DEFAULT_RECIPE_MODEL = "qwen-plus";
const USER_AGENT =
  "Mozilla/5.0 (compatible; WifeKitchenRecipeSearcher/1.2)";

const { importRecipeFromUrl } = importRecipeApi._internals;

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
    const query = normalizeQuery(body.query);
    const searchUrl = `https://www.xiachufang.com/search/?keyword=${encodeURIComponent(query)}`;
    const response = await fetch(searchUrl, {
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml",
        "accept-language": "zh-CN,zh;q=0.9,en;q=0.5"
      },
      signal: timeoutSignal(SEARCH_FETCH_TIMEOUT_MS)
    });

    if (!response.ok) throw httpError("下厨房搜索暂时不可用", 502);

    const html = (await response.text()).slice(0, MAX_SEARCH_HTML_CHARS);
    assertSearchPageReadable(html);
    const candidates = extractSearchCandidates(html, searchUrl, query);
    if (!candidates.length) throw httpError("没找到合适的下厨房菜谱", 404);

    const matchedRecipe = await importBestRecipe(candidates, query, {
      includeImages: body.includeImages !== false,
      includeStepImages: body.includeStepImages !== false
    });
    if (!matchedRecipe) throw httpError("找到了候选菜谱，但详情暂时无法读取", 502);
    const recipe = await ensureInAppRecipeGuide(matchedRecipe, query);

    res.status(200).json({ recipe, candidates: candidates.slice(0, 3) });
  } catch (error) {
    const timedOut = error.name === "AbortError" || /timeout|aborted/i.test(error.message || "");
    res.status(error.statusCode || (timedOut ? 504 : 400)).json({
      error: timedOut ? "找菜超时了，请点重新找或直接挑战" : error.message || "搜索失败"
    });
  }
}

async function importBestRecipe(candidates, query, options = {}) {
  const ranked = candidates.slice(0, SEARCH_IMPORT_LIMIT);
  const imported = await Promise.all(ranked.map(async (candidate) => {
    try {
      const recipe = await importRecipeFromUrl(candidate.url, {
        includeImages: options.includeImages !== false,
        includeStepImages: options.includeStepImages !== false,
        pageTimeoutMs: RECIPE_FETCH_TIMEOUT_MS,
        imageTimeoutMs: RECIPE_IMAGE_TIMEOUT_MS,
        maxImageBytes: 520_000,
        maxStepImages: 5,
        maxStepImageBytes: 180_000
      });
      const score = candidate.score + scoreRecipeCompleteness(recipe, query);
      return {
        score,
        recipe: {
          ...recipe,
          sourceUrl: recipe.sourceUrl || candidate.url,
          searchTitle: candidate.title,
          searchRating: candidate.rating,
          searchCookedCount: candidate.cookedCount
        }
      };
    } catch {
      return null;
    }
  }));

  const best = imported
    .filter((item) => item && isUsefulRecipe(item.recipe))
    .sort((a, b) => b.score - a.score)[0];
  return best?.recipe || recipeFromSearchCandidate(ranked[0]);
}

function isUsefulRecipe(recipe) {
  return Boolean(
    recipe?.sourceUrl &&
      (recipe.name || (Array.isArray(recipe.ingredients) && recipe.ingredients.length) || (Array.isArray(recipe.steps) && recipe.steps.length))
  );
}

function extractSearchCandidates(html, searchUrl, query) {
  const found = new Map();
  const cards = html.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi);

  for (const [, body] of cards) {
    const href = firstMatch(body, /<a\b[^>]*href=["']([^"']*\/recipe\/\d+\/?[^"']*)["'][^>]*>/i);
    const url = absoluteUrl(href, searchUrl);
    if (!url || found.has(url)) continue;

    const title =
      firstMatch(body, /<p\b[^>]*class=["'][^"']*name[^"']*["'][^>]*>[\s\S]*?<a\b[^>]*>([\s\S]*?)<\/a>/i) ||
      attr(body, "alt") ||
      "";
    const ratingText = firstMatch(body, /综合评分(?:\s|&nbsp;)*<span[^>]*>([\d.]+)<\/span>/i);
    const cookedText = firstMatch(body, /（(?:\s|&nbsp;)*<span[^>]*>([\d,]+)<\/span>(?:\s|&nbsp;)*做过/i);
    const ingredientText = cleanText(
      decodeHtml(stripTags(firstMatch(body, /<p\b[^>]*class=["'][^"']*ing[^"']*["'][^>]*>([\s\S]*?)<\/p>/i)))
    );
    const image = absoluteUrl(attr(body, "data-src") || attr(body, "src"), searchUrl);
    const candidate = {
      url,
      title: cleanText(decodeHtml(stripTags(title))),
      rating: Number(ratingText) || 0,
      cookedCount: Number(String(cookedText || "").replace(/,/g, "")) || 0,
      image,
      ingredients: ingredientText.split(/[、；;\n]+/).map(cleanText).filter(Boolean).slice(0, 20),
      rank: found.size + 1
    };
    candidate.score = scoreSearchCandidate(candidate, query);
    found.set(url, candidate);
  }

  return Array.from(found.values()).sort((a, b) => b.score - a.score);
}

function recipeFromSearchCandidate(candidate) {
  if (!candidate?.url) return null;
  const ratingNote = candidate.rating ? `下厨房评分 ${candidate.rating}` : "下厨房高分参考";
  const cookedNote = candidate.cookedCount ? `，${candidate.cookedCount} 人做过` : "";
  return {
    name: candidate.title || "下厨房参考菜谱",
    sourceUrl: candidate.url,
    image: candidate.image || "",
    imageUrl: candidate.image || "",
    ingredients: candidate.ingredients || [],
    steps: [],
    stepDetails: [],
    time: 20,
    note: `${ratingNote}${cookedNote}。小程序会整理可直接查看的参考做法。`,
    searchRating: candidate.rating || 0,
    searchCookedCount: candidate.cookedCount || 0
  };
}

async function ensureInAppRecipeGuide(recipe, query) {
  const ingredients = normalizeStringList(recipe?.ingredients, 32);
  const steps = normalizeStringList(recipe?.steps, 12);
  if (ingredients.length >= 2 && steps.length >= 3) {
    return {
      ...recipe,
      ingredients,
      steps,
      stepDetails: mergeGuideStepDetails(steps, recipe?.stepDetails),
      guideSource: recipe.guideSource || "source"
    };
  }

  try {
    const generated = await generateRecipeGuide(recipe, query);
    return {
      ...recipe,
      ...generated,
      stepDetails: mergeGuideStepDetails(generated.steps, recipe?.stepDetails, generated.stepDetails),
      image: recipe.image || "",
      imageUrl: recipe.imageUrl || recipe.image || "",
      sourceUrl: recipe.sourceUrl || "",
      searchRating: recipe.searchRating || 0,
      searchCookedCount: recipe.searchCookedCount || 0,
      guideSource: "qwen",
      note: `${recipe.note || "已匹配高分菜谱。"} 以下为小程序整理的家庭参考做法。`.slice(0, 160)
    };
  } catch (error) {
    console.warn("Recipe guide generation fell back to local steps:", error.message || error);
    return buildLocalRecipeGuide(recipe, query);
  }
}

async function generateRecipeGuide(recipe, query) {
  const apiKey = String(process.env.DASHSCOPE_API_KEY || "").trim();
  if (!apiKey) throw new Error("DASHSCOPE_API_KEY missing");
  const baseUrl = String(process.env.DASHSCOPE_BASE_URL || DEFAULT_DASHSCOPE_BASE_URL).trim().replace(/\/+$/, "");
  const response = await fetch(`${baseUrl}/compatible-mode/v1/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    signal: timeoutSignal(18_000),
    body: JSON.stringify({
      model: process.env.DASHSCOPE_RECIPE_MODEL || DEFAULT_RECIPE_MODEL,
      messages: [
        {
          role: "system",
          content: "你是家庭中餐菜谱编辑。输出安全、清晰、可在小程序内直接照做的 JSON，不要声称复刻来源网站原文。"
        },
        {
          role: "user",
          content: buildRecipeGuidePrompt(recipe, query)
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.35,
      max_completion_tokens: 1800
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error?.message || payload.message || "菜谱整理失败");
  const content = payload.choices?.[0]?.message?.content;
  const responseText = Array.isArray(content) ? content.map((item) => item.text || "").join("") : content;
  const parsed = parseJsonText(responseText);
  const ingredients = normalizeStringList(parsed.ingredients, 32);
  const stepDetails = normalizeGeneratedStepDetails(parsed.steps, extractImageUrls(responseText));
  const steps = stepDetails.map((step) => step.text).filter(Boolean);
  if (ingredients.length < 2 || steps.length < 3) throw new Error("菜谱内容不完整");
  return {
    name: cleanText(parsed.name || recipe?.name || query).slice(0, 40),
    time: Math.max(5, Math.min(180, Math.round(Number(parsed.time) || Number(recipe?.time) || 20))),
    ingredients,
    steps,
    stepDetails
  };
}

function buildRecipeGuidePrompt(recipe, query) {
  const ingredients = normalizeStringList(recipe?.ingredients, 32);
  return [
    `菜名：${cleanText(recipe?.name || query)}`,
    ingredients.length ? `搜索结果原料线索：${ingredients.join("、")}` : "搜索结果没有完整原料线索，请给出常见家庭用量。",
    "请返回严格 JSON：{\"name\":\"菜名\",\"time\":分钟整数,\"ingredients\":[\"食材 用量\"],\"steps\":[\"步骤\"]}",
    "要求：原料 4-12 项并写常见用量；步骤 4-8 步，每步完整、按顺序、包含火候或时间；生肉和蛋类必须写熟透；只输出 JSON。"
  ].join("\n");
}

function buildLocalRecipeGuide(recipe, query) {
  const name = cleanText(recipe?.name || query || "家常菜");
  const existingIngredients = normalizeStringList(recipe?.ingredients, 32);
  const ingredients = existingIngredients.length >= 2
    ? existingIngredients
    : ["主料 适量", "葱姜蒜 适量", "食用油 适量", "盐和常用调味料 适量"];
  const mainIngredients = ingredients.slice(0, 5).join("、");
  const steps = [
    `准备${mainIngredients}，主料洗净并按入口大小切配。`,
    "锅具预热，加入少量食用油；需要爆香时先下葱姜蒜，小火炒出香味。",
    "放入主料，按较难熟到易熟的顺序翻炒或炖煮；肉类和蛋类务必完全熟透。",
    "分次加入调味料和少量水，保持中小火至食材熟透并入味。",
    "尝味后再补盐，按口味收汁或保留汤汁，关火装盘。"
  ];
  return {
    ...recipe,
    name,
    ingredients,
    steps,
    stepDetails: mergeGuideStepDetails(steps, recipe?.stepDetails),
    guideSource: "local",
    note: `${recipe?.note || "已匹配高分菜谱。"} 详情读取受限，以下为小程序整理的家庭参考做法。`.slice(0, 160)
  };
}

function mergeGuideStepDetails(steps, value, fallbackValue = []) {
  const details = Array.isArray(value) ? value : [];
  const fallback = Array.isArray(fallbackValue) ? fallbackValue : [];
  return steps.map((text, index) => ({
    text,
    image: cleanText(details[index]?.image || fallback[index]?.image || ""),
    imageUrl: cleanText(
      details[index]?.imageUrl || details[index]?.image || fallback[index]?.imageUrl || fallback[index]?.image || ""
    )
  }));
}

function normalizeGeneratedStepDetails(value, fallbackImages = []) {
  return (Array.isArray(value) ? value : [])
    .map((item, index) => {
      const rawText = typeof item === "string" ? item : item?.text || item?.name || "";
      const inlineImages = extractImageUrls(typeof item === "string" ? item : JSON.stringify(item || {}));
      const text = cleanText(String(rawText).replace(/<img\b[^>]*>/gi, " ").replace(/<[^>]+>/g, " "));
      const imageUrl = normalizeGeneratedImageUrl(
        (typeof item === "object" && (item?.imageUrl || item?.image)) || inlineImages[0] || fallbackImages[index] || ""
      );
      return { text, image: "", imageUrl };
    })
    .filter((step) => step.text)
    .slice(0, 12);
}

function extractImageUrls(value) {
  const text = String(value || "");
  const urls = [];
  for (const match of text.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)) urls.push(match[1]);
  for (const match of text.matchAll(/https?:\\?\/\\?\/[^\s"'<>]+/gi)) urls.push(match[0].replace(/\\\//g, "/"));
  return Array.from(new Set(urls.map(normalizeGeneratedImageUrl).filter(Boolean)));
}

function normalizeGeneratedImageUrl(value) {
  const text = cleanText(value);
  try {
    const url = new URL(text);
    if (url.protocol !== "https:") return "";
    return url.toString();
  } catch {
    return "";
  }
}

function normalizeStringList(value, limit) {
  return (Array.isArray(value) ? value : [])
    .map((item) => cleanText(typeof item === "string" ? item : item?.text || item?.name || ""))
    .filter(Boolean)
    .slice(0, limit);
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
    throw new Error("菜谱返回格式不正确");
  }
}

function scoreSearchCandidate(candidate, query) {
  const title = compactText(candidate.title);
  const target = compactText(query);
  let score = 100 - candidate.rank * 2;

  if (title === target) score += 45;
  else if (title.includes(target)) score += 30;
  else if (target.includes(title)) score += 12;

  score += Math.max(0, candidate.rating) * 12;
  score += Math.min(30, Math.log10(candidate.cookedCount + 1) * 8);
  return score;
}

function scoreRecipeCompleteness(recipe, query) {
  let score = 0;
  const title = compactText(recipe?.name || "");
  const target = compactText(query);
  if (title === target) score += 25;
  else if (title.includes(target)) score += 16;
  if (recipe?.image) score += 8;
  if (Array.isArray(recipe?.ingredients)) score += Math.min(10, recipe.ingredients.length);
  if (Array.isArray(recipe?.steps)) score += Math.min(10, recipe.steps.length);
  const stepImageCount = (Array.isArray(recipe?.stepDetails) ? recipe.stepDetails : []).filter(
    (step) => step?.imageUrl || step?.image
  ).length;
  score += Math.min(48, stepImageCount * 8);
  return score;
}

function normalizeQuery(value) {
  const query = cleanText(value).slice(0, 40);
  if (!query) throw httpError("请输入想吃的菜名", 400);
  return query;
}

function assertSearchPageReadable(html) {
  if (/滑动验证|安全验证|geetest|captcha/i.test(html.slice(0, 20_000))) {
    throw httpError("下厨房触发访问验证，请稍后重试", 502);
  }
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
      if (raw.length > 20_000) reject(httpError("请求内容过大", 413));
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

function absoluteUrl(value, baseUrl) {
  if (!value) return "";
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return "";
  }
}

function attr(tag, name) {
  const match = String(tag || "").match(new RegExp(`${name}=["']([^"']+)["']`, "i"));
  return match ? decodeHtml(match[1]) : "";
}

function firstMatch(value, pattern) {
  const match = String(value || "").match(pattern);
  return match ? match[1] : "";
}

function stripTags(value) {
  return String(value || "").replace(/<[^>]+>/g, " ");
}

function cleanText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function compactText(value) {
  return cleanText(value).replace(/[^\u4e00-\u9fa5a-z0-9]/gi, "").toLowerCase();
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function timeoutSignal(timeoutMs) {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(timeoutMs);
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs);
  return controller.signal;
}

function httpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

module.exports = handler;
module.exports._internals = {
  extractSearchCandidates,
  recipeFromSearchCandidate,
  ensureInAppRecipeGuide,
  buildLocalRecipeGuide,
  mergeGuideStepDetails,
  normalizeGeneratedStepDetails,
  extractImageUrls,
  scoreSearchCandidate,
  scoreRecipeCompleteness
};
