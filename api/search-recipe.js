const importRecipeApi = require("./import-recipe.js");

const MAX_SEARCH_HTML_CHARS = 1_000_000;
const SEARCH_IMPORT_LIMIT = 5;
const USER_AGENT =
  "Mozilla/5.0 (compatible; WifeKitchenRecipeSearcher/1.0; +https://wifekitchen.vercel.app)";

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
    const searchUrl = `https://m.xiachufang.com/search/?keyword=${encodeURIComponent(query)}`;
    const response = await fetch(searchUrl, {
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml",
        "accept-language": "zh-CN,zh;q=0.9,en;q=0.5"
      }
    });

    if (!response.ok) throw httpError("下厨房搜索暂时不可用", 502);

    const html = (await response.text()).slice(0, MAX_SEARCH_HTML_CHARS);
    assertSearchPageReadable(html);
    const candidates = extractSearchCandidates(html, searchUrl, query);
    if (!candidates.length) throw httpError("没找到合适的下厨房菜谱", 404);

    const recipe = await importBestRecipe(candidates, query);
    if (!recipe) throw httpError("找到了候选菜谱，但详情暂时无法读取", 502);

    res.status(200).json({ recipe, candidates: candidates.slice(0, 3) });
  } catch (error) {
    res.status(error.statusCode || 400).json({ error: error.message || "搜索失败" });
  }
}

async function importBestRecipe(candidates, query) {
  let best = null;
  const ranked = candidates.slice(0, SEARCH_IMPORT_LIMIT);

  for (const candidate of ranked) {
    try {
      const recipe = await importRecipeFromUrl(candidate.url);
      const score = candidate.score + scoreRecipeCompleteness(recipe, query);
      if (!best || score > best.score) {
        best = {
          score,
          recipe: {
            ...recipe,
            sourceUrl: recipe.sourceUrl || candidate.url,
            searchTitle: candidate.title,
            searchRating: candidate.rating,
            searchCookedCount: candidate.cookedCount
          }
        };
      }
    } catch {
      continue;
    }
  }

  return best?.recipe || null;
}

function extractSearchCandidates(html, searchUrl, query) {
  const found = new Map();
  const anchors = html.matchAll(/<a\b([^>]*href=["'][^"']*\/recipe\/\d+\/?[^"']*["'][^>]*)>([\s\S]*?)<\/a>/gi);

  for (const [, attrs, body] of anchors) {
    const href = attr(attrs, "href");
    const url = absoluteUrl(href, searchUrl);
    if (!url || found.has(url)) continue;

    const title =
      attr(body, "title") ||
      attr(body, "alt") ||
      firstMatch(body, /<header\b[^>]*class=["'][^"']*name[^"']*["'][^>]*>([\s\S]*?)<\/header>/i) ||
      "";
    const ratingText = firstMatch(body, /评分\s*<span[^>]*>([\d.]+)<\/span>/i);
    const cookedText = firstMatch(body, /<span[^>]*class=["'][^"']*ml10[^"']*["'][^>]*>([\d,]+)<\/span>\s*人做过/i);
    const candidate = {
      url,
      title: cleanText(decodeHtml(stripTags(title))),
      rating: Number(ratingText) || 0,
      cookedCount: Number(String(cookedText || "").replace(/,/g, "")) || 0,
      rank: found.size + 1
    };
    candidate.score = scoreSearchCandidate(candidate, query);
    found.set(url, candidate);
  }

  return Array.from(found.values()).sort((a, b) => b.score - a.score);
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

function httpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

module.exports = handler;
module.exports._internals = {
  extractSearchCandidates,
  scoreSearchCandidate,
  scoreRecipeCompleteness
};
