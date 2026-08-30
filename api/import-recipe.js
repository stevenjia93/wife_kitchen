const MAX_HTML_CHARS = 1_500_000;
const MAX_IMAGE_BYTES = 700_000;
const MAX_STEP_IMAGE_BYTES = 220_000;
const MAX_STEP_IMAGES = 20;
const MAX_STEP_ITEMS = 20;
const PAGE_FETCH_TIMEOUT_MS = 8000;
const IMAGE_FETCH_TIMEOUT_MS = 3500;
const USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

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
    const recipe = await importRecipeFromUrl(body.url, {
      includeImages: body.includeImages !== false,
      includeStepImages: body.includeStepImages !== false
    });
    res.status(200).json({ recipe });
  } catch (error) {
    res.status(error.statusCode || 400).json({ error: error.message || "导入失败" });
  }
}

async function importRecipeFromUrl(rawUrl, options = {}) {
  const sourceUrl = normalizeSourceUrl(rawUrl);
  const includeImages = options.includeImages !== false;
  const includeStepImages = options.includeStepImages !== false;
  const maxStepImages = Number.isFinite(options.maxStepImages) ? options.maxStepImages : MAX_STEP_IMAGES;
  const maxStepImageBytes = Number.isFinite(options.maxStepImageBytes) ? options.maxStepImageBytes : MAX_STEP_IMAGE_BYTES;
  const response = await fetch(sourceUrl, {
    headers: {
      "user-agent": USER_AGENT,
      accept: "text/html,application/xhtml+xml",
      "accept-language": "zh-CN,zh;q=0.9,en;q=0.5"
    },
    signal: timeoutSignal(options.pageTimeoutMs || PAGE_FETCH_TIMEOUT_MS)
  });

  if (!response.ok) {
    throw httpError("菜谱页面暂时无法读取", 502);
  }

  const html = (await response.text()).slice(0, MAX_HTML_CHARS);
  const recipe = parseRecipePage(html, sourceUrl);
  if (recipe.image) {
    recipe.imageUrl = recipe.image;
    if (includeImages) {
      const coverImage = await fetchImageDataUrl(
        resizeXiachufangImageUrl(recipe.image),
        sourceUrl,
        options.maxImageBytes || MAX_IMAGE_BYTES,
        options.imageTimeoutMs
      );
      recipe.image = coverImage || recipe.imageUrl;
    }
  }
  if (Array.isArray(recipe.stepDetails)) {
    for (let index = 0; index < recipe.stepDetails.length; index += 1) {
      const step = recipe.stepDetails[index];
      if (!step?.image) continue;
      const originalImage = step.image;
      step.imageUrl = originalImage;
      if (!includeStepImages) {
        step.image = "";
        continue;
      }
      if (index < maxStepImages) {
        step.image = await fetchImageDataUrl(
          resizeXiachufangImageUrl(originalImage),
          sourceUrl,
          maxStepImageBytes,
          options.imageTimeoutMs
        );
      } else {
        step.image = "";
      }
    }
  }
  return recipe;
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

function normalizeSourceUrl(rawUrl) {
  const value = String(rawUrl || "").trim();
  if (!value) throw httpError("请输入下厨房链接", 400);

  let url;
  try {
    url = new URL(value);
  } catch {
    throw httpError("链接格式不正确", 400);
  }

  if (!["https:", "http:"].includes(url.protocol)) throw httpError("只支持 http/https 链接", 400);
  const hostname = url.hostname.toLowerCase();
  if (hostname !== "xiachufang.com" && !hostname.endsWith(".xiachufang.com")) {
    throw httpError("目前只支持下厨房链接", 400);
  }

  if (hostname === "www.xiachufang.com") {
    url.hostname = "m.xiachufang.com";
  }

  return url.toString();
}

function parseRecipePage(html, sourceUrl) {
  if (/滑动验证|安全验证|geetest|captcha/i.test(html.slice(0, 20_000))) {
    throw httpError("下厨房触发访问验证，请换成 m.xiachufang.com 的移动端链接或稍后重试", 502);
  }

  const metadata = extractMetadata(html);
  const recipeJson = findRecipeJson(html);
  const title = cleanRecipeTitle(
    firstText(recipeJson?.name) || metadata["og:title"] || metadata.title || "新菜谱"
  );
  const description = firstText(recipeJson?.description) || metadata["og:description"] || "";
  const ingredients = normalizeLines(recipeJson?.recipeIngredient);
  const jsonStepDetails = normalizeInstructionDetails(recipeJson?.recipeInstructions, sourceUrl);
  const jsonSteps = jsonStepDetails.map((step) => step.text).filter(Boolean);
  const stepDetails = mergeStepDetails(extractStepDetails(html, sourceUrl), jsonStepDetails);
  const steps = stepDetails.length ? stepDetails.map((step) => step.text).filter(Boolean) : jsonSteps;
  const image = absoluteUrl(firstText(recipeJson?.image) || metadata["og:image"] || "", sourceUrl);
  const totalTime = parseDurationMinutes(firstText(recipeJson?.totalTime) || firstText(recipeJson?.cookTime));

  return {
    name: title,
    sourceUrl,
    image,
    time: totalTime || 20,
    ingredients,
    steps,
    stepDetails,
    note: cleanText(description).slice(0, 120)
  };
}

async function fetchImageDataUrl(imageUrl, refererUrl, maxBytes = MAX_IMAGE_BYTES, timeoutMs = IMAGE_FETCH_TIMEOUT_MS) {
  try {
    const response = await fetch(imageUrl, {
      headers: {
        "user-agent": USER_AGENT,
        accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        referer: refererUrl
      },
      signal: timeoutSignal(timeoutMs)
    });
    if (!response.ok) return "";

    const contentType = response.headers.get("content-type") || "image/jpeg";
    if (!contentType.startsWith("image/")) return "";

    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length || buffer.length > maxBytes) return "";

    return `data:${contentType.split(";")[0]};base64,${buffer.toString("base64")}`;
  } catch {
    return "";
  }
}

function timeoutSignal(timeoutMs) {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(timeoutMs);
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs);
  return controller.signal;
}

function extractMetadata(html) {
  const metadata = {};
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) metadata.title = cleanText(decodeHtml(titleMatch[1]));

  const metaTags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of metaTags) {
    const key = attr(tag, "property") || attr(tag, "name");
    const content = attr(tag, "content");
    if (key && content) metadata[key.toLowerCase()] = cleanText(decodeHtml(content));
  }
  return metadata;
}

function findRecipeJson(html) {
  const scripts = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const [, raw] of scripts) {
    try {
      const parsed = JSON.parse(decodeHtml(raw.trim()));
      const recipe = findRecipeObject(parsed);
      if (recipe) return recipe;
    } catch {
      continue;
    }
  }
  return null;
}

function findRecipeObject(value) {
  if (!value) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findRecipeObject(item);
      if (found) return found;
    }
    return null;
  }
  if (typeof value !== "object") return null;

  const type = value["@type"];
  const types = Array.isArray(type) ? type : [type];
  if (types.some((item) => String(item).toLowerCase() === "recipe")) return value;

  return findRecipeObject(value["@graph"]);
}

function normalizeLines(value) {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  return list.map((item) => cleanText(firstText(item))).filter(Boolean).slice(0, 40);
}

function normalizeInstructionDetails(value, sourceUrl) {
  return flattenInstructionDetails(value)
    .flatMap((item) => {
      const texts = splitInstructionText(item.text).map(cleanStepText).filter(Boolean);
      const image = absoluteUrl(item.image, sourceUrl);
      return texts.map((text, index) => ({ text, image: index === 0 ? image : "" }));
    })
    .slice(0, MAX_STEP_ITEMS);
}

function extractStepDetails(html, sourceUrl) {
  const blocks =
    html.match(/<div\b[^>]*class=["'][^"']*\bstep\s+step\b[^"']*["'][\s\S]*?(?=<div\b[^>]*class=["'][^"']*\bstep\s+step\b|<\/section>|<\/main>|$)/gi) ||
    [];

  return blocks
    .map((block) => {
      const rawText = firstMatch(
        block,
        /<p\b[^>]*class=["'][^"']*\bstep-text\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/i
      );
      const imageTag = firstMatch(block, /(<img\b[^>]*>)/i);
      const styleImage = firstMatch(block, /background-image:\s*url\((['"]?)(.*?)\1\)/i, 2);
      const rawImage =
        attr(imageTag, "data-original") ||
        attr(imageTag, "data-src") ||
        attr(imageTag, "data-lazy-src") ||
        attr(imageTag, "src") ||
        styleImage;
      const text = cleanStepText(stripTags(rawText.replace(/<br\s*\/?>/gi, "\n")));
      const image = absoluteUrl(decodeHtml(rawImage), sourceUrl);
      return { text, image };
    })
    .filter((step) => step.text || step.image)
    .slice(0, MAX_STEP_ITEMS);
}

function mergeStepDetails(domSteps, jsonSteps) {
  const dom = Array.isArray(domSteps) ? domSteps : [];
  const json = Array.isArray(jsonSteps) ? jsonSteps : [];
  const count = Math.min(MAX_STEP_ITEMS, Math.max(dom.length, json.length));
  return Array.from({ length: count }, (_, index) => ({
    text: dom[index]?.text || json[index]?.text || "",
    image: dom[index]?.image || json[index]?.image || ""
  })).filter((step) => step.text || step.image);
}

function flattenInstructionDetails(value) {
  if (!value) return [];
  if (typeof value === "string") return [{ text: value, image: "" }];
  if (Array.isArray(value)) return value.flatMap(flattenInstructionDetails);
  if (typeof value !== "object") return [];
  if (value.itemListElement) return flattenInstructionDetails(value.itemListElement);
  const text = firstText(value.text) || firstText(value.name);
  const image = firstText(value.image);
  return text || image ? [{ text, image }] : [];
}

function parseDurationMinutes(value) {
  const text = String(value || "");
  const iso = text.match(/PT(?:(\d+)H)?(?:(\d+)M)?/i);
  if (iso) return (Number(iso[1]) || 0) * 60 + (Number(iso[2]) || 0);
  const minutes = text.match(/(\d+)\s*(分钟|分|min|minutes?)/i);
  if (minutes) return Number(minutes[1]) || 0;
  return 0;
}

function splitInstructionText(value) {
  const text = cleanText(value);
  if (!text) return [];
  const parts = text
    .split(/(?=\d+[.．、]\s*)/g)
    .map((item) => item.replace(/^\d+[.．、]\s*/, "").trim())
    .filter(Boolean);
  return parts.length > 1 ? parts : [text];
}

function firstText(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return firstText(value[0]);
  if (typeof value === "object") return value.url || value.text || value.name || "";
  return String(value);
}

function cleanRecipeTitle(value) {
  return cleanText(value)
    .replace(/^【步骤图】\s*/, "")
    .replace(/\s*的做法.*$/i, "")
    .replace(/[_-]\s*下厨房.*$/i, "")
    .replace(/\s*下厨房\s*$/i, "")
    .trim();
}

function cleanText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/^\s+|\s+$/g, "");
}

function cleanStepText(value) {
  return cleanText(value).replace(/[，,]\s*$/g, "");
}

function stripTags(value) {
  return decodeHtml(String(value || "").replace(/<[^>]+>/g, " "));
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
  if (!tag) return "";
  const match = tag.match(new RegExp(`${name}=["']([^"']+)["']`, "i"));
  return match ? match[1] : "";
}

function firstMatch(value, pattern, group = 1) {
  const match = String(value || "").match(pattern);
  return match ? match[group] || "" : "";
}

function resizeXiachufangImageUrl(imageUrl) {
  return String(imageUrl || "").replace(/\/w\/\d+\/h\/\d+\/q\/\d+\/format\/\w+/i, "/w/520/h/390/q/72/format/jpg");
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
  importRecipeFromUrl,
  parseRecipePage,
  normalizeSourceUrl,
  fetchImageDataUrl,
  extractStepDetails,
  normalizeInstructionDetails
};
