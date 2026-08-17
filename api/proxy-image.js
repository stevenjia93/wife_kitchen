const MAX_IMAGE_BYTES = 1_200_000;
const IMAGE_TIMEOUT_MS = 15000;
const USER_AGENT = "Mozilla/5.0 (compatible; WifeKitchenImageProxy/1.2)";
const ALLOWED_HOSTS = [
  "chuimg.com",
  "images.unsplash.com",
  "xiachufang.com",
  "sinaimg.cn",
  "sina.com.cn"
];

async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.status(204).end();
    return;
  }

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const imageUrl = normalizeImageUrl(req.query?.url);
    const fetchUrl = resizeImageUrl(imageUrl);
    const response = await fetch(fetchUrl.toString(), {
      headers: {
        "user-agent": USER_AGENT,
        accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        referer: refererFor(imageUrl)
      },
      signal: timeoutSignal(IMAGE_TIMEOUT_MS)
    });

    if (!response.ok) throw httpError("图片暂时无法读取", 502);

    const contentType = response.headers.get("content-type") || "image/jpeg";
    if (!contentType.startsWith("image/")) throw httpError("目标不是图片", 400);

    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > MAX_IMAGE_BYTES) throw httpError("图片过大", 413);

    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length) throw httpError("图片为空", 502);
    if (buffer.length > MAX_IMAGE_BYTES) throw httpError("图片过大", 413);

    res.setHeader("Content-Type", contentType.split(";")[0]);
    res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800");
    res.status(200).end(buffer);
  } catch (error) {
    res.status(error.statusCode || 400).json({ error: error.message || "图片读取失败" });
  }
}

function normalizeImageUrl(value) {
  let url;
  try {
    url = new URL(String(value || ""));
  } catch {
    throw httpError("图片链接格式不正确", 400);
  }

  if (!["https:", "http:"].includes(url.protocol)) throw httpError("只支持 http/https 图片", 400);
  const hostname = url.hostname.toLowerCase();
  if (!ALLOWED_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`))) {
    throw httpError("不支持的图片域名", 400);
  }
  return url;
}

function refererFor(url) {
  const hostname = url.hostname.toLowerCase();
  if (hostname.includes("chuimg.com") || hostname.includes("xiachufang.com")) {
    return "https://www.xiachufang.com/";
  }
  return url.origin;
}

function resizeImageUrl(url) {
  const next = new URL(url.toString());
  const hostname = next.hostname.toLowerCase();
  if (hostname === "chuimg.com" || hostname.endsWith(".chuimg.com")) {
    next.search = "imageView2/1/w/560/h/420/q/75/format/jpg";
  }
  return next;
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
