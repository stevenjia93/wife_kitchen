const path = require("path");
const express = require("express");
const database = require("./server/database");

const app = express();
const port = Number.parseInt(process.env.PORT, 10) || 3000;
const root = __dirname;

app.disable("x-powered-by");
app.set("trust proxy", process.env.TRUST_PROXY === "true" ? 1 : false);
app.use(express.json({ limit: "6mb", type: ["application/json", "application/*+json"] }));

app.get("/healthz", async (_req, res) => {
  try {
    await database.checkConnection();
    res.status(200).json({ ok: true });
  } catch {
    res.status(503).json({ ok: false, error: "database unavailable" });
  }
});

app.use("/api/wechat-auth", fixedWindowLimit({ windowMs: 60_000, max: 20 }));
app.use("/api/households", fixedWindowLimit({ windowMs: 60_000, max: 60 }));
app.use("/api/miniprogram-state", fixedWindowLimit({ windowMs: 60_000, max: 120 }));
mountHandler("/api/wechat-auth", require("./api/wechat-auth"));
mountHandler("/api/households", require("./api/households"));
mountHandler("/api/miniprogram-state", require("./api/miniprogram-state"));
mountHandler("/api/search-recipe", require("./api/search-recipe"));
mountHandler("/api/import-recipe", require("./api/import-recipe"));
mountHandler("/api/proxy-image", require("./api/proxy-image"));
mountHandler("/api/analyze-meal-photo", require("./api/analyze-meal-photo"));

const publicFiles = ["app.js", "config.js", "index.html", "manifest.webmanifest", "service-worker.js", "styles.css"];
for (const file of publicFiles) {
  app.get(`/${file}`, (_req, res) => res.sendFile(path.join(root, file)));
}
app.get("/", (_req, res) => res.sendFile(path.join(root, "index.html")));

app.use((error, _req, res, _next) => {
  if (error?.type === "entity.too.large") {
    res.status(413).json({ error: "请求内容过大" });
    return;
  }
  console.error(error);
  res.status(error.statusCode || 500).json({ error: error.message || "服务器内部错误" });
});

if (require.main === module) {
  app.listen(port, "0.0.0.0", () => console.log(`Wife Kitchen listening on ${port}`));
}

function mountHandler(route, handler) {
  app.all(route, (req, res, next) => Promise.resolve(handler(req, res)).catch(next));
}

function fixedWindowLimit({ windowMs, max }) {
  const counters = new Map();
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, value] of counters) {
      if (value.resetAt <= now) counters.delete(key);
    }
  }, windowMs);
  cleanup.unref();

  return (req, res, next) => {
    const key = req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();
    const current = counters.get(key);
    const entry = !current || current.resetAt <= now ? { count: 0, resetAt: now + windowMs } : current;
    entry.count += 1;
    counters.set(key, entry);
    res.setHeader("X-RateLimit-Limit", String(max));
    res.setHeader("X-RateLimit-Remaining", String(Math.max(0, max - entry.count)));
    if (entry.count > max) {
      res.setHeader("Retry-After", String(Math.ceil((entry.resetAt - now) / 1000)));
      res.status(429).json({ error: "请求过于频繁，请稍后重试" });
      return;
    }
    next();
  };
}

module.exports = app;
