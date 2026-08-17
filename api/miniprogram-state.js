const MAX_BODY_CHARS = 5_000_000;
const MAX_CODE_LENGTH = 80;
const defaultDatabase = require("../server/database");

function createHandler(database = defaultDatabase) {
  return async function handler(req, res) {
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
    const code = normalizeHouseholdCode(body.code);
    const payload = body.payload && typeof body.payload === "object" ? body.payload : null;
    const householdId = await database.findOrCreateHousehold(code);

    if (payload) {
      const updatedAt = await database.saveHouseholdState(householdId, compactPayloadForStorage(payload));
      res.status(200).json({ householdId, saved: true, updatedAt: toIsoString(updatedAt) });
      return;
    }

    const row = await database.loadHouseholdState(householdId);
    const remotePayload = row?.payload || null;
    const compactPayload = compactPayloadForStorage(remotePayload);
    let updatedAt = row?.updated_at || null;
    if (hasPayload(remotePayload) && payloadSize(compactPayload) < payloadSize(remotePayload)) {
      updatedAt = await database.saveHouseholdState(householdId, compactPayload);
    }
    res.status(200).json({
      householdId,
      payload: hasPayload(compactPayload) ? compactPayload : null,
      isNew: !hasPayload(remotePayload),
      updatedAt: toIsoString(updatedAt)
    });
  } catch (error) {
    const statusCode = error.statusCode || (isDatabaseError(error) ? 503 : 400);
    res.status(statusCode).json({
      error: statusCode === 503 ? "国内同步服务暂时不可用，请稍后重试" : error.message || "家庭菜单同步失败"
    });
  }
  };
}

function normalizeHouseholdCode(value) {
  const code = String(value || "").trim().toLowerCase();
  if (!code) throw httpError("请输入家庭码", 400);
  if (code.length > MAX_CODE_LENGTH) throw httpError("家庭码太长", 400);
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(code)) {
    throw httpError("家庭码只能包含字母、数字、横线和下划线", 400);
  }
  return code;
}

function hasPayload(payload) {
  return payload && typeof payload === "object" && Object.keys(payload).length > 0;
}

function compactPayloadForStorage(payload) {
  if (!payload || typeof payload !== "object") return payload;
  const compacted = stripDataImages(payload);
  if (Array.isArray(compacted.dishes)) compacted.dishes = compacted.dishes.map(compactDish);
  if (compacted.plans && typeof compacted.plans === "object") {
    Object.keys(compacted.plans).forEach((dateKey) => {
      compacted.plans[dateKey] = compactPlan(compacted.plans[dateKey]);
    });
  }
  return compacted;
}

function compactPlan(plan) {
  if (!plan || typeof plan !== "object") return plan;
  return {
    ...plan,
    afterPhotos: Array.isArray(plan.afterPhotos) ? plan.afterPhotos.map(stripPhotoImages).filter(Boolean) : [],
    wishes: Array.isArray(plan.wishes) ? plan.wishes.map(compactWish).filter(Boolean) : []
  };
}

function compactWish(wish) {
  if (!wish || typeof wish !== "object") return null;
  return {
    ...wish,
    recipe: wish.recipe && typeof wish.recipe === "object" ? compactDish(wish.recipe) : wish.recipe || null
  };
}

function compactDish(dish) {
  if (!dish || typeof dish !== "object") return null;
  return {
    ...dish,
    image: stripImageValue(dish.image, dish.imageUrl),
    imageUrl: stripImageValue(dish.imageUrl, dish.image),
    stepDetails: Array.isArray(dish.stepDetails) ? dish.stepDetails.map(compactStep) : []
  };
}

function compactStep(step) {
  if (!step || typeof step !== "object") return step;
  return {
    ...step,
    image: stripImageValue(step.image, step.imageUrl),
    imageUrl: stripImageValue(step.imageUrl, step.image)
  };
}

function stripPhotoImages(photo) {
  if (!photo || typeof photo !== "object") return null;
  const hadImage = Boolean(photo.image || photo.imageOmitted);
  const hadShareImage = Boolean(photo.shareImage || photo.shareOmitted);
  return {
    ...photo,
    image: "",
    imageOmitted: hadImage,
    shareImage: "",
    shareOmitted: hadShareImage,
    shareStatus: photo.shareStatus === "done" ? "idle" : photo.shareStatus,
    shareCreatedAt: photo.shareStatus === "done" ? null : photo.shareCreatedAt
  };
}

function stripDataImages(value) {
  if (Array.isArray(value)) return value.map(stripDataImages);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, stripDataImages(item)]));
}

function stripImageValue(value, fallback) {
  const image = String(value || "").trim();
  const fallbackUrl = nonDataUrl(fallback);
  if (isDataImage(image)) return fallbackUrl;
  return image;
}

function isDataImage(value) {
  return typeof value === "string" && value.startsWith("data:image/");
}

function nonDataUrl(value) {
  const url = String(value || "").trim();
  return /^https?:\/\//i.test(url) ? url : "";
}

function payloadSize(payload) {
  try {
    return JSON.stringify(payload || {}).length;
  } catch {
    return 0;
  }
}

function toIsoString(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function isDatabaseError(error) {
  return Boolean(error && (error.code || /database|postgres|connection|timeout/i.test(error.message || "")));
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

function httpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
module.exports._internals = {
  compactPayloadForStorage,
  normalizeHouseholdCode
};
