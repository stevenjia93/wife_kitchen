const STORAGE_KEY = "wife-kitchen-prototype-v1";
const HOUSEHOLD_SESSION_KEY = "wife-kitchen-household-session-v1";
const FORCE_LOCAL_MODE = new URLSearchParams(location.search).has("local");
const APP_CONFIG = FORCE_LOCAL_MODE ? {} : window.WIFE_KITCHEN_CONFIG || {};
const API_BASE = String(APP_CONFIG.apiBase || "").replace(/\/+$/, "");
const REMOTE_POLL_INTERVAL_MS = 5000;
const MEAL_PHOTO_LIMIT = 6;
const MEAL_PHOTO_IMAGE_OPTIONS = { maxSide: 800, quality: 0.62 };
const SHARE_IMAGE_OPTIONS = { maxSide: 900, quality: 0.66 };
const DEFAULT_IMAGE_OPTIONS = { maxSide: 900, quality: 0.68 };
const PHOTO_PROCESSING_STALE_MS = 90 * 1000;
const WISH_SEARCH_TIMEOUT_MS = 55 * 1000;
const WISH_SEARCH_STALE_MS = 120 * 1000;
const photoStatusValues = ["idle", "loading", "done", "failed"];
const shoppingGroupOrder = ["肉蛋", "海鲜", "蛋奶", "蔬菜", "主食", "干货", "饮品", "调味", "其他"];
const unitAliases = {
  g: "克",
  G: "克",
  kg: "千克",
  KG: "千克",
  公斤: "千克",
  ml: "毫升",
  ML: "毫升",
  mL: "毫升"
};
const ingredientAliases = [
  ["生抽", ["生抽", "薄盐生抽"]],
  ["老抽", ["老抽"]],
  ["酱油", ["煲仔饭酱油", "蒸鱼豉油", "酱油"]],
  ["蚝油", ["蚝油"]],
  ["料酒", ["料酒", "黄酒"]],
  ["豆瓣酱", ["郫县豆瓣酱", "豆瓣酱"]],
  ["芝麻油", ["芝麻油", "香油"]],
  ["食用油", ["食用油", "植物油", "菜籽油", "花生油", "玉米油", "油"]],
  ["盐", ["食盐", "海盐", "盐"]],
  ["冰糖", ["冰糖"]],
  ["白糖", ["白糖", "砂糖", "细砂糖"]],
  ["醋", ["米醋", "陈醋", "香醋", "白醋", "醋"]],
  ["淀粉", ["玉米淀粉", "土豆淀粉", "淀粉"]],
  ["胡椒粉", ["白胡椒粉", "黑胡椒粉", "胡椒粉"]],
  ["辣椒粉", ["辣椒面", "辣椒粉"]],
  ["番茄酱", ["番茄酱"]]
];

const online = {
  enabled: !FORCE_LOCAL_MODE && APP_CONFIG.onlineEnabled !== false && location.protocol !== "file:",
  householdId: null,
  householdCode: "",
  status: "本地模式",
  error: "",
  loading: false,
  applyingRemote: false,
  saveTimer: null,
  pollTimer: null,
  updatedAt: null
};

loadHouseholdSession();

const mealLabels = {
  breakfast: "早餐",
  lunch: "午餐",
  dinner: "晚餐"
};

const mealOrder = ["breakfast", "lunch", "dinner"];
const categories = ["全部", "快手菜", "肉菜", "蔬菜", "汤粥", "早餐", "主食"];
const wishStatuses = {
  searching: "找菜谱中",
  found: "已找到参考",
  accepted: "老公已接招",
  declined: "这次做不了",
  failed: "没找到参考"
};

const defaultImages = [
  "https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=900&q=80"
];

const starterDishes = [
  {
    id: "tomato-eggs",
    name: "番茄炒蛋",
    category: "快手菜",
    meals: ["lunch", "dinner"],
    time: 15,
    difficulty: "轻松",
    rating: 5,
    image:
      "https://images.unsplash.com/photo-1589927986089-35812388d1f4?auto=format&fit=crop&w=900&q=80",
    ingredients: [
      { name: "番茄", amount: 2, unit: "个", group: "蔬菜" },
      { name: "鸡蛋", amount: 3, unit: "个", group: "蛋奶" },
      { name: "小葱", amount: 1, unit: "根", group: "蔬菜" },
      { name: "生抽", amount: 1, unit: "勺", group: "调味" }
    ],
    steps: ["番茄切块，鸡蛋打散。", "先炒鸡蛋盛出，再炒番茄出汁。", "回锅合炒，少量生抽调味。"],
    note: "拌饭友好，适合工作日。"
  },
  {
    id: "cola-wings",
    name: "可乐鸡翅",
    category: "肉菜",
    meals: ["lunch", "dinner"],
    time: 35,
    difficulty: "稳妥",
    rating: 5,
    image:
      "https://images.unsplash.com/photo-1562967916-eb82221dfb92?auto=format&fit=crop&w=900&q=80",
    ingredients: [
      { name: "鸡翅中", amount: 10, unit: "个", group: "肉蛋" },
      { name: "可乐", amount: 1, unit: "罐", group: "饮品" },
      { name: "姜", amount: 4, unit: "片", group: "蔬菜" },
      { name: "生抽", amount: 2, unit: "勺", group: "调味" }
    ],
    steps: ["鸡翅划刀焯水。", "煎到两面微黄后加姜片。", "倒入可乐和生抽，小火收汁。"],
    note: "甜口，适合配清淡蔬菜。"
  },
  {
    id: "garlic-broccoli",
    name: "蒜蓉西兰花",
    category: "蔬菜",
    meals: ["lunch", "dinner"],
    time: 12,
    difficulty: "轻松",
    rating: 4,
    image:
      "https://images.unsplash.com/photo-1584270354949-c26b0d5b4a0c?auto=format&fit=crop&w=900&q=80",
    ingredients: [
      { name: "西兰花", amount: 1, unit: "颗", group: "蔬菜" },
      { name: "蒜", amount: 4, unit: "瓣", group: "蔬菜" },
      { name: "蚝油", amount: 1, unit: "勺", group: "调味" },
      { name: "盐", amount: 1, unit: "撮", group: "调味" }
    ],
    steps: ["西兰花掰小朵焯水。", "蒜末炒香。", "西兰花回锅，加蚝油和盐快炒。"],
    note: "作为配菜很稳。"
  },
  {
    id: "beef-potato",
    name: "土豆炖牛腩",
    category: "肉菜",
    meals: ["lunch", "dinner"],
    time: 90,
    difficulty: "周末",
    rating: 5,
    image:
      "https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?auto=format&fit=crop&w=900&q=80",
    ingredients: [
      { name: "牛腩", amount: 500, unit: "克", group: "肉蛋" },
      { name: "土豆", amount: 2, unit: "个", group: "蔬菜" },
      { name: "胡萝卜", amount: 1, unit: "根", group: "蔬菜" },
      { name: "洋葱", amount: 0.5, unit: "个", group: "蔬菜" },
      { name: "八角", amount: 2, unit: "颗", group: "调味" }
    ],
    steps: ["牛腩焯水洗净。", "香料和洋葱炒香，下牛腩翻炒。", "加热水炖软，再放土豆胡萝卜。"],
    note: "一次多做，第二顿更入味。"
  },
  {
    id: "egg-pancake",
    name: "鸡蛋饼",
    category: "早餐",
    meals: ["breakfast"],
    time: 15,
    difficulty: "轻松",
    rating: 4,
    image:
      "https://images.unsplash.com/photo-1525351484163-7529414344d8?auto=format&fit=crop&w=900&q=80",
    ingredients: [
      { name: "鸡蛋", amount: 2, unit: "个", group: "蛋奶" },
      { name: "面粉", amount: 80, unit: "克", group: "主食" },
      { name: "小葱", amount: 1, unit: "根", group: "蔬菜" },
      { name: "牛奶", amount: 80, unit: "毫升", group: "蛋奶" }
    ],
    steps: ["面粉、鸡蛋、牛奶调成面糊。", "加入葱花和盐。", "平底锅小火摊熟。"],
    note: "早餐快手，也可加火腿。"
  },
  {
    id: "pumpkin-congee",
    name: "南瓜小米粥",
    category: "汤粥",
    meals: ["breakfast", "dinner"],
    time: 35,
    difficulty: "省心",
    rating: 4,
    image:
      "https://images.unsplash.com/photo-1547592166-23ac45744acd?auto=format&fit=crop&w=900&q=80",
    ingredients: [
      { name: "南瓜", amount: 250, unit: "克", group: "蔬菜" },
      { name: "小米", amount: 80, unit: "克", group: "主食" },
      { name: "红枣", amount: 4, unit: "颗", group: "干货" }
    ],
    steps: ["小米淘洗，南瓜切块。", "加水煮到小米开花。", "加入红枣，小火继续煮浓稠。"],
    note: "胃口一般时很合适。"
  },
  {
    id: "shrimp-noodle",
    name: "虾仁葱油面",
    category: "主食",
    meals: ["lunch", "dinner"],
    time: 20,
    difficulty: "稳妥",
    rating: 5,
    image:
      "https://images.unsplash.com/photo-1612927601601-6638404737ce?auto=format&fit=crop&w=900&q=80",
    ingredients: [
      { name: "鲜面条", amount: 2, unit: "份", group: "主食" },
      { name: "虾仁", amount: 200, unit: "克", group: "海鲜" },
      { name: "小葱", amount: 4, unit: "根", group: "蔬菜" },
      { name: "生抽", amount: 2, unit: "勺", group: "调味" }
    ],
    steps: ["小葱切段，小火炸葱油。", "虾仁煎熟。", "面条煮好后拌葱油、生抽和虾仁。"],
    note: "不想炒多个菜时很好用。"
  },
  {
    id: "corn-ribs-soup",
    name: "玉米排骨汤",
    category: "汤粥",
    meals: ["lunch", "dinner"],
    time: 70,
    difficulty: "省心",
    rating: 5,
    image:
      "https://images.unsplash.com/photo-1616501268209-edfff098fdd2?auto=format&fit=crop&w=900&q=80",
    ingredients: [
      { name: "排骨", amount: 500, unit: "克", group: "肉蛋" },
      { name: "甜玉米", amount: 1, unit: "根", group: "蔬菜" },
      { name: "胡萝卜", amount: 1, unit: "根", group: "蔬菜" },
      { name: "姜", amount: 3, unit: "片", group: "蔬菜" }
    ],
    steps: ["排骨焯水。", "和姜片一起加水炖煮。", "后半程放玉米胡萝卜，出锅前加盐。"],
    note: "和任何快手炒菜都搭。"
  }
];

let state = loadState();
let ui = {
  view: getInitialView(),
  dateKey: todayKey(),
  meal: "dinner",
  category: "全部",
  search: "",
  menuDrawerOpen: false,
  menuMode: "browse",
  menuCategory: "全部",
  menuSearch: "",
  featuredDishIndex: 0,
  editingDishId: null,
  detailDishId: null
};

const app = document.querySelector("#app");
let storageQuotaNoticeShown = false;

function todayKey() {
  return dateKeyFromDate(new Date());
}

function dateKeyFromDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateFromKey(key) {
  return new Date(`${key}T00:00:00`);
}

function selectedDateKey() {
  return ui.dateKey || todayKey();
}

function dayLabel(key = selectedDateKey()) {
  return dateFromKey(key).toLocaleDateString("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long"
  });
}

function dateMode(key = selectedDateKey()) {
  if (key < todayKey()) return "past";
  if (key > todayKey()) return "future";
  return "today";
}

function dateModeText(key = selectedDateKey()) {
  const mode = dateMode(key);
  if (mode === "past") return "历史记录";
  if (mode === "future") return "预约点餐";
  return "今天";
}

function isPastDate(key = selectedDateKey()) {
  return dateMode(key) === "past";
}

function isEditableDate(key = selectedDateKey()) {
  return !isPastDate(key);
}

function getInitialView() {
  return location.hash === "#husband" ? "husband" : "wife";
}

function emptyPlan() {
  return {
    breakfast: [],
    lunch: [],
    dinner: [],
    skipped: {
      breakfast: false,
      lunch: false,
      dinner: false
    },
    wishes: [],
    afterPhotos: [],
    submitted: false,
    submittedAt: null,
    notificationUnread: false
  };
}

function normalizePlan(plan = {}) {
  const normalized = {
    ...emptyPlan(),
    ...plan,
    skipped: {
      ...emptyPlan().skipped,
      ...(plan.skipped || {})
    }
  };

  for (const meal of mealOrder) {
    normalized[meal] = Array.isArray(normalized[meal]) ? normalized[meal] : [];
    normalized.skipped[meal] = Boolean(normalized.skipped[meal]);
  }

  normalized.wishes = Array.isArray(normalized.wishes)
    ? normalized.wishes.map(normalizeWish).filter(Boolean)
    : [];
  normalized.afterPhotos = Array.isArray(normalized.afterPhotos)
    ? normalized.afterPhotos.map(normalizeMealPhoto).filter(Boolean)
    : [];
  normalized.submitted = Boolean(normalized.submitted);
  normalized.submittedAt = normalized.submittedAt || null;
  normalized.notificationUnread = Boolean(normalized.notificationUnread);
  return normalized;
}

function normalizeMealPhoto(photo = {}) {
  const image = String(photo.image || "").trim();
  const targetKeys = Array.isArray(photo.targetKeys)
    ? photo.targetKeys.map(String).filter(Boolean)
    : Array.isArray(photo.dishIds)
      ? photo.dishIds.map((id) => `dish:${id}`).filter(Boolean)
      : [];
  const analysis = normalizeMealAnalysis(photo.analysis);
  const analysisStatus = normalizePhotoStatus(photo.analysisStatus || (analysis ? "done" : "idle"));
  const shareImage = String(photo.shareImage || "").trim();
  const imageOmitted = Boolean(photo.imageOmitted);
  const shareOmitted = Boolean(photo.shareOmitted);
  if (!image && !imageOmitted && !analysis && !shareImage && !shareOmitted) return null;
  return {
    id: photo.id || `photo-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    image,
    imageOmitted,
    targetKeys,
    createdAt: photo.createdAt || new Date().toISOString(),
    analysis,
    analysisStatus,
    analysisError: String(photo.analysisError || "").trim(),
    analysisStartedAt: photo.analysisStartedAt || null,
    shareImage,
    shareOmitted,
    shareStatus: normalizePhotoStatus(photo.shareStatus || (shareImage ? "done" : "idle")),
    shareError: String(photo.shareError || "").trim(),
    shareStartedAt: photo.shareStartedAt || null,
    shareCreatedAt: photo.shareCreatedAt || null
  };
}

function normalizePhotoStatus(value) {
  return photoStatusValues.includes(value) ? value : "idle";
}

function isStalePhotoProcessing(photo, statusKey, startedAtKey) {
  if (!photo || photo[statusKey] !== "loading") return false;
  const startedAt = Date.parse(photo[startedAtKey] || photo.createdAt || "");
  return Number.isFinite(startedAt) && Date.now() - startedAt > PHOTO_PROCESSING_STALE_MS;
}

function schedulePhotoProcessingFallback(dateKey, photoId, statusKey, startedAtKey, startedAtValue) {
  const startedAt = Date.parse(startedAtValue || "");
  if (!Number.isFinite(startedAt)) return;
  const delay = Math.max(0, PHOTO_PROCESSING_STALE_MS - (Date.now() - startedAt) + 250);
  window.setTimeout(() => {
    const plan = state.plans[dateKey] ? normalizePlan(state.plans[dateKey]) : null;
    const photo = planPhotos(plan).find((item) => item.id === photoId);
    if (isStalePhotoProcessing(photo, statusKey, startedAtKey)) render();
  }, delay);
}

function normalizeMealAnalysis(value) {
  if (!value || typeof value !== "object") return null;
  const items = Array.isArray(value.items)
    ? value.items.map(normalizeCalorieItem).filter((item) => item.bbox.width > 0.02 && item.bbox.height > 0.02)
    : [];
  const total = items.reduce((sum, item) => sum + item.calories, 0);
  return {
    totalCalories: clampNumber(Number(value.totalCalories) || total, 0, 6000),
    confidence: normalizeConfidence(value.confidence),
    notes: String(value.notes || "根据照片做粗略估算，实际热量会受份量和做法影响。").trim().slice(0, 140),
    items
  };
}

function normalizeCalorieItem(item = {}) {
  return {
    label: String(item.label || "食物").trim().slice(0, 24),
    portion: String(item.portion || "可见份量").trim().slice(0, 24),
    calorieReason: String(item.calorieReason || "按照片估算").trim().slice(0, 32),
    calories: clampNumber(Number(item.calories) || 0, 0, 2500),
    confidence: normalizeConfidence(item.confidence),
    bbox: normalizeBox(item.bbox)
  };
}

function normalizeBox(box = {}) {
  const x = clampNumber(Number(box.x) || 0, 0, 1);
  const y = clampNumber(Number(box.y) || 0, 0, 1);
  const width = clampNumber(Number(box.width) || 0, 0, 1 - x);
  const height = clampNumber(Number(box.height) || 0, 0, 1 - y);
  return { x, y, width, height };
}

function normalizeConfidence(value) {
  return ["low", "medium", "high"].includes(value) ? value : "medium";
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function normalizeWish(wish = {}) {
  const name = String(wish.name || "").trim();
  if (!name) return null;
  const meal = mealOrder.includes(wish.meal) ? wish.meal : "dinner";
  const status = wishStatuses[wish.status] ? wish.status : "searching";
  const createdAt = wish.createdAt || new Date().toISOString();
  const searchStartedAt = wish.searchStartedAt || (status === "searching" ? createdAt : "");
  const searchIsStale =
    status === "searching" &&
    searchStartedAt &&
    Number.isFinite(Date.parse(searchStartedAt)) &&
    Date.now() - Date.parse(searchStartedAt) > WISH_SEARCH_STALE_MS;
  return {
    id: wish.id || `wish-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    meal,
    name,
    note: String(wish.note || "").trim(),
    status: searchIsStale ? "failed" : status,
    createdAt,
    searchStartedAt: searchIsStale ? "" : searchStartedAt,
    recipe: wish.recipe && typeof wish.recipe === "object" ? wish.recipe : null,
    dishId: wish.dishId || "",
    error: searchIsStale ? "找菜超时了，可以点重新找，或者直接让老公挑战。" : String(wish.error || "").trim()
  };
}

function createDefaultState() {
  return {
    dishes: starterDishes,
    plans: {
      [todayKey()]: emptyPlan()
    },
    feedback: {},
    checkedItems: {},
    shoppingGroupCollapsed: {}
  };
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || !Array.isArray(saved.dishes)) return createDefaultState();
    return normalizeAppState(saved);
  } catch {
    return createDefaultState();
  }
}

function saveState() {
  persistLocalState(state);
  scheduleRemoteSave();
}

function persistLocalState(nextState, options = {}) {
  const notify = options.notify !== false;
  const candidates = [
    { state: compactLocalState(nextState, { stripMealPhotoImages: true }), notice: "" },
    {
      state: compactLocalState(nextState, { stripMealPhotoImages: true, stripStepDataImages: true, removeDataImages: true }),
      notice: "本地空间不足，已清理本地图片缓存并保存菜单"
    },
    {
      state: compactLocalState(nextState, {
        stripMealPhotoImages: true,
        stripStepDataImages: true,
        keepOnlyCurrentPhotos: true,
        mealPhotoLimit: 4
      }),
      notice: "本地空间不足，已只保留最近的饭后照片"
    },
    {
      state: compactLocalState(nextState, {
        stripMealPhotoImages: true,
        stripStepDataImages: true,
        keepOnlyCurrentPhotos: true,
        mealPhotoLimit: 1
      }),
      notice: "本地空间不足，已只保留最近 1 张饭后照片"
    },
    {
      state: compactLocalState(nextState, { removeMealPhotos: true, stripStepDataImages: true }),
      notice: "本地空间不足，已清理饭后照片缓存并保存菜单"
    },
    {
      state: compactLocalState(nextState, { removeMealPhotos: true, stripStepDataImages: true, removeDataImages: true }),
      notice: "本地空间不足，已清理本地图片缓存并保存菜单"
    }
  ];

  let lastError = null;
  for (const candidate of candidates) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(candidate.state));
      if (candidate.notice && notify) showStorageQuotaNotice(candidate.notice);
      return nextState;
    } catch (error) {
      lastError = error;
      if (!isQuotaExceededError(error)) break;
    }
  }

  console.warn("本地保存失败", lastError);
  if (notify) showStorageQuotaNotice("本地空间仍然不足，请删除旧照片或清理站点数据");
  return nextState;
}

function compactLocalState(value, options = {}) {
  const compacted = clonePlain(value);
  const keepPhotoKeys = localPhotoKeepKeys();

  for (const [dateKey, rawPlan] of Object.entries(compacted.plans || {})) {
    const plan = rawPlan && typeof rawPlan === "object" ? rawPlan : emptyPlan();
    let photos = Array.isArray(plan.afterPhotos) ? plan.afterPhotos : [];

    if (options.keepOnlyCurrentPhotos && !keepPhotoKeys.has(dateKey)) {
      photos = [];
    }
    if (options.removeMealPhotos) {
      photos = [];
    }
    if (options.removeShareImages) {
      photos = photos.map((photo) => ({
        ...photo,
        shareImage: "",
        shareOmitted: Boolean(photo.shareImage || photo.shareOmitted),
        shareStatus: photo.shareStatus === "done" ? "idle" : photo.shareStatus,
        shareCreatedAt: null
      }));
    }
    if (options.stripMealPhotoImages) {
      photos = photos.map(stripMealPhotoImages);
    }
    if (Number.isFinite(options.mealPhotoLimit)) {
      photos = photos
        .map((photo, index) => ({ photo, index }))
        .sort((a, b) => {
          const dateA = Date.parse(a.photo.createdAt || "");
          const dateB = Date.parse(b.photo.createdAt || "");
          return (Number.isFinite(dateB) ? dateB : 0) - (Number.isFinite(dateA) ? dateA : 0) || a.index - b.index;
        })
        .slice(0, options.mealPhotoLimit)
        .map(({ photo }) => photo);
    }

    compacted.plans[dateKey] = { ...plan, afterPhotos: photos };
  }

  const withoutStepDataImages = options.stripStepDataImages ? stripRemoteHeavyMedia(compacted) : compacted;
  if (options.removeDataImages) return stripDataImages(withoutStepDataImages);
  return withoutStepDataImages;
}

function stripMealPhotoImages(photo = {}) {
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

function mergeRemoteStateWithLocalMedia(remoteState, localState) {
  const merged = clonePlain(remoteState);
  const localPlans = localState?.plans || {};

  for (const [dateKey, plan] of Object.entries(merged.plans || {})) {
    const localPhotos = new Map(
      (localPlans[dateKey]?.afterPhotos || []).filter((photo) => photo?.id).map((photo) => [photo.id, photo])
    );
    if (!Array.isArray(plan?.afterPhotos)) continue;
    plan.afterPhotos = plan.afterPhotos.map((photo) => {
      const localPhoto = localPhotos.get(photo.id);
      if (!localPhoto) return photo;
      return {
        ...photo,
        image: photo.image || localPhoto.image || "",
        imageOmitted: Boolean(photo.imageOmitted && !localPhoto.image),
        shareImage: photo.shareImage || localPhoto.shareImage || "",
        shareOmitted: Boolean(photo.shareOmitted && !localPhoto.shareImage),
        shareStatus: photo.shareImage || localPhoto.shareImage ? localPhoto.shareStatus || photo.shareStatus : photo.shareStatus,
        shareCreatedAt: photo.shareImage || localPhoto.shareImage ? localPhoto.shareCreatedAt || photo.shareCreatedAt : photo.shareCreatedAt
      };
    });
  }

  return merged;
}

function clonePlain(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return createDefaultState();
  }
}

function localPhotoKeepKeys() {
  const keys = new Set([todayKey()]);
  if (ui?.dateKey) keys.add(ui.dateKey);
  return keys;
}

function stripDataImages(value) {
  if (Array.isArray(value)) return value.map(stripDataImages);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => {
      if (["image", "imageUrl", "shareImage"].includes(key) && isDataImage(item)) return [key, ""];
      return [key, stripDataImages(item)];
    })
  );
}

function compactRemoteState(value, options = {}) {
  return stripRemoteHeavyMedia(compactLocalState(value, { stripMealPhotoImages: true }), {
    stripAllDataImages: true,
    ...options
  });
}

function stripRemoteHeavyMedia(value, options = {}, key = "") {
  if (Array.isArray(value)) {
    if (key === "steps" || key === "stepDetails") return value.map((item) => stripStepMedia(item));
    return value.map((item) => stripRemoteHeavyMedia(item, options));
  }
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value).map(([itemKey, item]) => {
      if (itemKey === "steps" || itemKey === "stepDetails") {
        return [itemKey, Array.isArray(item) ? item.map((step) => stripStepMedia(step)) : item];
      }
      if (itemKey === "shareImage" && isDataImage(item)) return [itemKey, ""];
      if (itemKey === "imageUrl" && isDataImage(item)) return [itemKey, ""];
      if (itemKey === "image" && isDataImage(item)) {
        if (options.stripAllDataImages || String(item).length > 750_000) {
          return [itemKey, value.imageUrl && !isDataImage(value.imageUrl) ? value.imageUrl : ""];
        }
      }
      return [itemKey, stripRemoteHeavyMedia(item, options, itemKey)];
    })
  );
}

function stripStepMedia(step) {
  if (!step || typeof step !== "object") return step;
  return {
    ...step,
    image: isDataImage(step.image) ? "" : step.image || "",
    imageUrl: isDataImage(step.imageUrl) ? "" : step.imageUrl || ""
  };
}

function isDataImage(value) {
  return typeof value === "string" && value.startsWith("data:image/");
}

function isQuotaExceededError(error) {
  return (
    error?.name === "QuotaExceededError" ||
    error?.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    error?.code === 22 ||
    error?.code === 1014 ||
    /quota|exceeded/i.test(error?.message || "")
  );
}

function showStorageQuotaNotice(message) {
  if (storageQuotaNoticeShown) return;
  storageQuotaNoticeShown = true;
  toast(message);
}

function normalizeAppState(value = {}) {
  const base = createDefaultState();
  const normalized = {
    ...base,
    ...value,
    dishes: Array.isArray(value.dishes) ? value.dishes : base.dishes,
    feedback: value.feedback && typeof value.feedback === "object" ? value.feedback : {},
    checkedItems: value.checkedItems && typeof value.checkedItems === "object" ? value.checkedItems : {},
    shoppingGroupCollapsed:
      value.shoppingGroupCollapsed && typeof value.shoppingGroupCollapsed === "object"
        ? value.shoppingGroupCollapsed
        : {},
    plans: {
      ...base.plans,
      ...(value.plans || {})
    }
  };

  for (const key of Object.keys(normalized.plans)) {
    normalized.plans[key] = normalizePlan(normalized.plans[key]);
  }

  return normalized;
}

function loadHouseholdSession() {
  try {
    const session = JSON.parse(localStorage.getItem(HOUSEHOLD_SESSION_KEY));
    if (!session) return;
    online.householdId = session.householdId || null;
    online.householdCode = session.householdCode || "";
    if (online.enabled && online.householdId) online.status = `在线同步：${online.householdCode}`;
  } catch {
    localStorage.removeItem(HOUSEHOLD_SESSION_KEY);
  }
}

function saveHouseholdSession() {
  if (!online.householdId) {
    localStorage.removeItem(HOUSEHOLD_SESSION_KEY);
    return;
  }
  localStorage.setItem(
    HOUSEHOLD_SESSION_KEY,
    JSON.stringify({
      householdId: online.householdId,
      householdCode: online.householdCode
    })
  );
}

async function requestDomesticApi(path, body) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `请求失败：${response.status}`);
  return payload;
}

async function joinHousehold(householdCode) {
  const code = householdCode.trim().toLowerCase();
  if (!code) {
    toast("请输入家庭码");
    return;
  }

  online.loading = true;
  online.error = "";
  online.status = "正在连接国内服务...";
  render();

  try {
    const result = await requestDomesticApi("/api/miniprogram-state", { code });
    online.householdId = result.householdId;
    online.householdCode = code;
    online.status = `在线同步：${code}`;
    saveHouseholdSession();
    await applyRemoteResult(result, { seedIfEmpty: true });
    startRemotePolling();
    toast("已进入家庭菜单");
  } catch (error) {
    online.error = error.message || "连接失败";
    online.status = "在线连接失败";
  } finally {
    online.loading = false;
    render();
  }
}

async function loadRemoteState({ seedIfEmpty = false } = {}) {
  if (!online.enabled || !online.householdId) return;
  const result = await requestDomesticApi("/api/miniprogram-state", { code: online.householdCode });
  await applyRemoteResult(result, { seedIfEmpty });
}

async function applyRemoteResult(result, { seedIfEmpty = false } = {}) {
  if (result.payload && Object.keys(result.payload).length) {
    if (result.updatedAt && result.updatedAt === online.updatedAt) return;
    online.applyingRemote = true;
    state = normalizeAppState(mergeRemoteStateWithLocalMedia(result.payload, state));
    persistLocalState(state);
    online.applyingRemote = false;
    online.updatedAt = result.updatedAt || online.updatedAt;
    return;
  }

  if (seedIfEmpty) {
    online.applyingRemote = true;
    state = createDefaultState();
    persistLocalState(state);
    online.applyingRemote = false;
    await saveRemoteStateNow();
  }
}

function scheduleRemoteSave() {
  if (!online.enabled || !online.householdId || online.applyingRemote) return;
  clearTimeout(online.saveTimer);
  online.saveTimer = setTimeout(() => {
    saveRemoteStateNow().catch((error) => {
      online.error = error.message || "同步失败";
      online.status = "同步失败";
      render();
    });
  }, 450);
}

async function saveRemoteStateNow() {
  if (!online.enabled || !online.householdId || online.applyingRemote) return;
  const result = await requestDomesticApi("/api/miniprogram-state", {
    code: online.householdCode,
    payload: compactRemoteState(state)
  });
  online.updatedAt = result.updatedAt || online.updatedAt;
  online.status = `在线同步：${online.householdCode}`;
}

function startRemotePolling() {
  if (!online.enabled || !online.householdId || online.pollTimer) return;
  online.pollTimer = setInterval(() => {
    if (document.hidden || online.loading || online.applyingRemote) return;
    loadRemoteState().then(render).catch((error) => {
      online.error = error.message || "同步失败";
      online.status = "同步失败";
      render();
    });
  }, REMOTE_POLL_INTERVAL_MS);
}

async function leaveHousehold() {
  online.householdId = null;
  online.householdCode = "";
  online.status = online.enabled ? "未加入家庭" : "本地模式";
  online.error = "";
  online.updatedAt = null;
  clearInterval(online.pollTimer);
  online.pollTimer = null;
  saveHouseholdSession();
  render();
}

function ensureTodayPlan() {
  const key = selectedDateKey();
  if (!state.plans[key]) {
    state.plans[key] = emptyPlan();
  }
  state.plans[key] = normalizePlan(state.plans[key]);
  if (!state.checkedItems[key]) state.checkedItems[key] = {};
  return state.plans[key];
}

function getDish(id) {
  return state.dishes.find((dish) => dish.id === id);
}

function activeDishes() {
  return state.dishes.filter((dish) => !dish.archived);
}

function allSelectedIds(plan = ensureTodayPlan()) {
  return mealOrder.flatMap((meal) => plan[meal]);
}

function wishesForMeal(plan = ensureTodayPlan(), meal = ui.meal) {
  return (plan.wishes || []).filter((wish) => wish.meal === meal);
}

function wishCount(plan = ensureTodayPlan()) {
  return (plan.wishes || []).length;
}

function wishStatusText(wish) {
  return wishStatuses[wish?.status] || "待处理";
}

function wishStatusClass(wish) {
  return wishStatuses[wish?.status] ? wish.status : "unknown";
}

function mealItemCount(plan, meal) {
  return (plan[meal]?.length || 0) + wishesForMeal(plan, meal).length;
}

function dishMatchesUi(dish) {
  const search = ui.search.trim().toLowerCase();
  const mealOk = dish.meals.includes(ui.meal);
  const categoryOk = ui.category === "全部" || dish.category === ui.category;
  const searchOk =
    !search ||
    [dish.name, dish.category, dish.note, dish.ingredients.map((item) => item.name).join(" ")]
      .join(" ")
      .toLowerCase()
      .includes(search);
  return mealOk && categoryOk && searchOk;
}

function filteredDishes() {
  return activeDishes().filter(dishMatchesUi).sort((a, b) => {
    const feedbackScore = { love: 2, ok: 0, skip: -3 };
    const scoreA = (a.rating || 0) + (feedbackScore[state.feedback[a.id]] || 0);
    const scoreB = (b.rating || 0) + (feedbackScore[state.feedback[b.id]] || 0);
    return scoreB - scoreA || a.time - b.time;
  });
}

function formatIngredient(item) {
  if (item.amountText) return `${item.amountText}${item.name}`;
  if (item.amount === null || item.amount === undefined || item.amount === "") return item.name;
  return `${item.name} ${item.amount}${item.unit || ""}`;
}

function selectedDishCount(plan = ensureTodayPlan()) {
  return allSelectedIds(plan).length;
}

function totalCookMinutes(plan = ensureTodayPlan()) {
  return allSelectedIds(plan).reduce((sum, id) => sum + (getDish(id)?.time || 0), 0);
}

function aggregateShoppingList(plan = ensureTodayPlan()) {
  const map = new Map();
  for (const id of allSelectedIds(plan)) {
    const dish = getDish(id);
    if (!dish) continue;
    for (const item of dish.ingredients) {
      const normalized = normalizeShoppingIngredient(item);
      const key = `${normalized.group}|${normalized.keyName}`;
      const current = map.get(key) || {
        key,
        name: normalized.name,
        group: normalized.group,
        amounts: {},
        looseAmounts: [],
        dishes: []
      };
      if (typeof normalized.amount === "number" && Number.isFinite(normalized.amount)) {
        current.amounts[normalized.unit] = (current.amounts[normalized.unit] || 0) + normalized.amount;
      } else {
        current.looseAmounts.push(normalized.amountText || "按需");
      }
      current.dishes.push(dish.name);
      map.set(key, current);
    }
  }
  return Array.from(map.values()).sort((a, b) => {
    const groupDiff = shoppingGroupSortValue(a.group) - shoppingGroupSortValue(b.group);
    return groupDiff || a.name.localeCompare(b.name, "zh-CN");
  });
}

function groupedShoppingList(shopping = aggregateShoppingList()) {
  const groups = shopping.reduce((result, item) => {
    if (!result[item.group]) result[item.group] = [];
    result[item.group].push(item);
    return result;
  }, {});
  return Object.entries(groups).sort(
    ([groupA], [groupB]) => shoppingGroupSortValue(groupA) - shoppingGroupSortValue(groupB)
  );
}

function normalizeShoppingIngredient(item = {}) {
  const loose = parseLooseIngredient(String(item.name || "").trim());
  const sourceName = loose.name || String(item.name || "").trim();
  const name = canonicalIngredientName(sourceName);
  const amount = typeof item.amount === "number" && Number.isFinite(item.amount) ? item.amount : loose.amount;
  const unit = normalizeShoppingUnit(item.unit || loose.unit || "");
  const guessedGroup = guessGroup(name || sourceName || item.group || "其他");
  const group = item.group && item.group !== "其他" ? item.group : guessedGroup;
  return {
    name: name || sourceName || "食材",
    keyName: normalizeIngredientKey(name || sourceName || "食材"),
    amount,
    amountText: item.amountText || loose.amountText,
    unit,
    group
  };
}

function parseLooseIngredient(value = "") {
  const text = value
    .replace(/[，,。；;：:].*$/, "")
    .replace(/[（(].*?[）)]/g, "")
    .trim();
  if (!text) return { name: "", amount: null, unit: "", amountText: "" };

  const prefixWord = text.match(/^(少许|适量|适当|若干|一?点点|一?小撮|一?小勺|一?大勺|一?勺|半勺|半个|半罐|按需)\s*(.+)$/);
  if (prefixWord) {
    return {
      name: prefixWord[2].trim(),
      amount: null,
      unit: "",
      amountText: normalizeAmountText(prefixWord[1])
    };
  }

  const unitPattern = "(千克|公斤|克|g|G|毫升|ml|ML|mL|升|大勺|小勺|勺|个|颗|瓣|片|根|罐|份|撮|把|碗|袋|包)?";
  const prefixNumber = text.match(new RegExp(`^(\\d+(?:\\.\\d+)?|半)\\s*${unitPattern}\\s*(.+)$`));
  if (prefixNumber && prefixNumber[3]) {
    const amount = prefixNumber[1] === "半" ? 0.5 : Number(prefixNumber[1]);
    return {
      name: prefixNumber[3].trim(),
      amount,
      unit: normalizeShoppingUnit(prefixNumber[2]),
      amountText: ""
    };
  }

  const suffixNumber = text.match(
    /^(.*?)\s*(\d+(?:\.\d+)?)\s*(千克|公斤|克|g|G|毫升|ml|ML|mL|升|大勺|小勺|勺|个|颗|瓣|片|根|罐|份|撮|把|碗|袋|包)$/
  );
  if (suffixNumber) {
    return {
      name: suffixNumber[1].trim(),
      amount: Number(suffixNumber[2]),
      unit: normalizeShoppingUnit(suffixNumber[3]),
      amountText: ""
    };
  }

  return { name: text, amount: null, unit: "", amountText: "" };
}

function canonicalIngredientName(value = "") {
  const compact = String(value)
    .replace(/\s+/g, "")
    .replace(/^[·•\-—]+/, "")
    .trim();
  if (!compact) return "";
  for (const [canonical, aliases] of ingredientAliases) {
    if (aliases.some((alias) => compact.includes(alias))) return canonical;
  }
  return compact.replace(/^(一点|少许|适量|适当|若干)/, "");
}

function normalizeIngredientKey(value = "") {
  return canonicalIngredientName(value).toLowerCase();
}

function normalizeShoppingUnit(value = "") {
  const unit = String(value || "").trim();
  return unitAliases[unit] || unit;
}

function normalizeAmountText(value = "") {
  if (!value || value === "按需") return "按需";
  if (value.includes("适")) return "适量";
  if (value.includes("少") || value.includes("点") || value.includes("撮")) return "少许";
  return value;
}

function shoppingGroupSortValue(group) {
  const index = shoppingGroupOrder.indexOf(group);
  return index === -1 ? shoppingGroupOrder.length : index;
}

function mealResolved(plan, meal) {
  return plan.skipped[meal] || plan[meal].length > 0 || wishesForMeal(plan, meal).length > 0;
}

function unresolvedMeals(plan) {
  return mealOrder.filter((meal) => !mealResolved(plan, meal));
}

function orderStatusText(plan) {
  if (isPastDate()) {
    return hasPlanActivity(plan) ? "历史点餐记录" : "这天没有点餐记录";
  }
  if (plan.submitted) return `已下单 ${formatTime(plan.submittedAt)}`;
  const pending = unresolvedMeals(plan).length;
  return pending ? `还有 ${pending} 餐未决定` : "可以下单了";
}

function hasPlanActivity(plan) {
  return selectedDishCount(plan) > 0 || wishCount(plan) > 0 || mealOrder.some((meal) => plan.skipped[meal]);
}

function canViewOrder(plan) {
  return plan.submitted || (isPastDate() && hasPlanActivity(plan));
}

function formatTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function dishSourceUrl(dish) {
  return dish.sourceUrl || `https://www.xiachufang.com/search/?keyword=${encodeURIComponent(dish.name)}`;
}

function planFoodTargets(plan) {
  const targets = [];
  for (const meal of mealOrder) {
    for (const id of plan[meal] || []) {
      const dish = getDish(id);
      if (!dish) continue;
      targets.push({
        key: `dish:${id}`,
        id,
        type: "dish",
        meal,
        name: dish.name,
        image: dishImageSrc(dish)
      });
    }
    for (const wish of wishesForMeal(plan, meal)) {
      targets.push({
        key: `wish:${wish.id}`,
        id: wish.id,
        type: "wish",
        meal,
        name: wish.name,
        image: wish.recipe?.image || wish.recipe?.imageUrl || fallbackDishImage({ name: wish.name, category: "许愿菜" })
      });
    }
  }
  return targets;
}

function planPhotos(plan) {
  return Array.isArray(plan?.afterPhotos) ? plan.afterPhotos.map(normalizeMealPhoto).filter(Boolean) : [];
}

function afterMealPanelVisible(plan) {
  return planPhotos(plan).length > 0 || canUploadMealPhotos(plan);
}

function canUploadMealPhotos(plan) {
  return ui.view === "wife" && selectedDateKey() === todayKey() && canViewOrder(plan) && planFoodTargets(plan).length > 0;
}

function photoTargetName(targetKey, targets) {
  return targets.find((target) => target.key === targetKey)?.name || "已移除菜品";
}

function photoTargetLabel(photo, targets) {
  const targetKeys = photo.targetKeys || [];
  if (!targetKeys.length) return "整桌合照";
  if (targetKeys.length === targets.length && targets.length > 1) return "整桌合照";
  const names = targetKeys.map((key) => photoTargetName(key, targets)).filter(Boolean);
  if (names.length <= 2) return names.join("、") || "饭后照片";
  return `${names.slice(0, 2).join("、")} 等 ${names.length} 道`;
}

function normalizeStepItem(step) {
  if (typeof step === "string") {
    return { text: step.trim(), image: "", imageUrl: "" };
  }
  if (step && typeof step === "object") {
    return {
      text: String(step.text || step.name || "").trim(),
      image: String(step.image || "").trim(),
      imageUrl: String(step.imageUrl || "").trim()
    };
  }
  return { text: "", image: "", imageUrl: "" };
}

function dishStepItems(dish, includeFallback = true) {
  const rawSteps =
    Array.isArray(dish?.stepDetails) && dish.stepDetails.length
      ? dish.stepDetails
      : Array.isArray(dish?.steps)
        ? dish.steps
        : [];
  const steps = rawSteps.map(normalizeStepItem).filter((step) => step.text || step.image || step.imageUrl);
  if (steps.length || !includeFallback) return steps;
  return [{ text: dish?.note || "按家里习惯处理食材，先把主料做熟，再按口味调味。", image: "", imageUrl: "" }];
}

function dishSteps(dish) {
  return dishStepItems(dish).map((step) => step.text).filter(Boolean);
}

function stepImageSrc(step) {
  return displayImageSrc(step.image || step.imageUrl || "");
}

function stepImageCount(steps) {
  return steps.filter((step) => stepImageSrc(step)).length;
}

function renderStepTextList(steps, limit = 5, emptyText = "打开下厨房查看完整步骤。") {
  const lines = steps.map((step) => step.text).filter(Boolean).slice(0, limit);
  return `<ol>${lines.length ? lines.map((step) => `<li>${escapeHtml(step)}</li>`).join("") : `<li>${escapeHtml(emptyText)}</li>`}</ol>`;
}

function renderStepPreviewList(steps, limit = 5, emptyText = "打开下厨房查看完整步骤。") {
  const items = steps.filter((step) => step.text || stepImageSrc(step)).slice(0, limit);
  return `
    <ol class="step-text-list">
      ${
        items.length
          ? items
              .map((step) => {
                const image = stepImageSrc(step);
                return `
                  <li>
                    ${image ? `<img class="step-inline-image" src="${escapeAttr(image)}" alt="" loading="lazy" />` : ""}
                    ${step.text ? `<span>${escapeHtml(step.text)}</span>` : ""}
                  </li>
                `;
              })
              .join("")
          : `<li><span>${escapeHtml(emptyText)}</span></li>`
      }
    </ol>
  `;
}

function renderStepTimeline(steps) {
  const items = steps.length ? steps : [{ text: "打开下厨房查看完整步骤。", image: "", imageUrl: "" }];
  return `
    <ol class="step-note-list">
      ${items
        .map((step, index) => {
          const image = stepImageSrc(step);
          return `
            <li class="step-note-item">
              <span class="step-note-index">${index + 1}</span>
              <div class="step-note-body">
                ${image ? `<img class="step-note-image" src="${escapeAttr(image)}" alt="步骤 ${index + 1}" loading="lazy" />` : ""}
                ${step.text ? `<p>${escapeHtml(step.text)}</p>` : ""}
              </div>
            </li>
          `;
        })
        .join("")}
    </ol>
  `;
}

function serializeStepDetails(steps) {
  return JSON.stringify(steps.map(normalizeStepItem).filter((step) => step.text || step.image || step.imageUrl));
}

function parseStepDetails(value) {
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed.map(normalizeStepItem).filter((step) => step.text || step.image || step.imageUrl) : [];
  } catch {
    return [];
  }
}

function mergeStepTextsWithDetails(texts, details) {
  return texts.map((text, index) => {
    const detail = normalizeStepItem(details[index]);
    const step = { text, image: detail.image, imageUrl: detail.imageUrl };
    return step.image || step.imageUrl ? step : step.text;
  });
}

function dishImageSrc(dish) {
  if (dish?.id === "tomato-eggs" && String(dish.image || "").includes("photo-1589927986089")) {
    return fallbackDishImage(dish);
  }
  return displayImageSrc(dish?.image || "") || fallbackDishImage(dish);
}

function displayImageSrc(value) {
  const src = String(value || "").trim();
  if (!src || src.startsWith("data:image/") || src.startsWith("blob:")) return src;
  return shouldProxyImage(src) ? `/api/proxy-image?url=${encodeURIComponent(src)}` : src;
}

function shouldProxyImage(value) {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return ["chuimg.com", "xiachufang.com", "sinaimg.cn", "sina.com.cn"].some(
      (host) => hostname === host || hostname.endsWith(`.${host}`)
    );
  } catch {
    return false;
  }
}

function fallbackDishImage(dish = {}) {
  const name = dish.name || "家常菜";
  const category = dish.category || "菜单";
  const foodColors = /番茄|番茄炒蛋|西红柿/.test(name)
    ? ["#e95f43", "#f4ce55", "#76a96f", "#f7e2a1"]
    : category === "肉菜"
      ? ["#b85e43", "#e2a36c", "#6f8b63", "#f2d8b1"]
      : category === "蔬菜"
        ? ["#7fbe72", "#bfdc85", "#5d9d70", "#e7f1d0"]
        : category === "汤粥"
          ? ["#e5c672", "#f1dfaa", "#b98b56", "#fff4d2"]
          : ["#e9a0ad", "#b9cfe9", "#d9c184", "#f5eddb"];
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 560">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stop-color="#f5efe1"/>
          <stop offset="0.55" stop-color="#dfeade"/>
          <stop offset="1" stop-color="#efd4d5"/>
        </linearGradient>
        <radialGradient id="plate" cx="50%" cy="42%" r="58%">
          <stop offset="0" stop-color="#ffffff"/>
          <stop offset="0.68" stop-color="#f4f0e8"/>
          <stop offset="1" stop-color="#cfc8bc"/>
        </radialGradient>
      </defs>
      <rect width="900" height="560" fill="url(#bg)"/>
      <circle cx="450" cy="280" r="214" fill="#0c0d0c" opacity="0.92"/>
      <circle cx="450" cy="280" r="182" fill="url(#plate)" opacity="0.98"/>
      <ellipse cx="398" cy="235" rx="86" ry="58" fill="${foodColors[0]}" opacity="0.86"/>
      <ellipse cx="500" cy="238" rx="92" ry="62" fill="${foodColors[1]}" opacity="0.9"/>
      <ellipse cx="450" cy="326" rx="102" ry="70" fill="${foodColors[2]}" opacity="0.86"/>
      <circle cx="388" cy="300" r="38" fill="${foodColors[3]}" opacity="0.9"/>
      <circle cx="544" cy="304" r="34" fill="${foodColors[0]}" opacity="0.72"/>
      <path d="M360 214 C436 174 526 184 586 238" fill="none" stroke="#ffffff" stroke-opacity="0.34" stroke-width="18"/>
      <text x="450" y="508" text-anchor="middle" font-family="Avenir Next, Hiragino Sans GB, PingFang SC, sans-serif" font-size="28" font-weight="780" fill="#6f756c">${escapeSvg(category)}</text>
    </svg>
  `;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function dishBadgeText(dish) {
  const feedback = state.feedback[dish.id];
  if (feedback === "love") return "常点";
  if (feedback === "skip") return "少做";
  if ((dish.rating || 0) >= 5) return "拿手菜";
  if ((dish.rating || 0) >= 4) return "熟练菜";
  return "家常菜";
}

function markPlanDraft(plan) {
  plan.submitted = false;
  plan.submittedAt = null;
  plan.notificationUnread = false;
}

function render() {
  const requiresHousehold = online.enabled && !online.householdId;
  const plan = requiresHousehold ? normalizePlan(emptyPlan()) : ensureTodayPlan();
  const isWife = ui.view === "wife";
  document.title = "老婆点菜单";
  app.innerHTML = `
    <div class="app-shell">
      ${renderHeader(plan)}
      ${requiresHousehold ? "" : renderDateStrip(plan)}
      ${renderOnlineBar()}
      ${requiresHousehold ? renderHouseholdGate() : isWife ? renderWifeView(plan) : renderHusbandView(plan)}
      ${renderMenuDrawer()}
      ${renderDetailModal()}
    </div>
  `;
}

function renderHeader(plan) {
  const isWife = ui.view === "wife";
  return `
    <header class="topbar">
      <div class="brand">
        <div class="brand-mark">${isWife ? "点" : "厨"}</div>
        <div>
          <span class="brand-eyebrow">${isWife ? "Private Kitchen Brief" : "Chef Console"}</span>
          <h1>老婆点菜单</h1>
          <p class="subtle">${dayLabel()} · ${dateModeText()}，${isWife ? wifeDateHint() : orderStatusText(plan)}</p>
        </div>
      </div>
      <div class="top-actions">
        <div class="role-switch" aria-label="切换界面">
          <button class="role-tab ${ui.view === "wife" ? "active" : ""}" data-action="set-view" data-view="wife">老婆点菜</button>
          <button class="role-tab ${ui.view === "husband" ? "active" : ""}" data-action="set-view" data-view="husband">
            老公厨房${plan.notificationUnread ? `<span class="badge-dot"></span>` : ""}
          </button>
        </div>
      </div>
    </header>
  `;
}

function renderDateStrip(plan) {
  const pending = unresolvedMeals(plan).length;
  const total = selectedDishCount(plan) + wishCount(plan);
  return `
    <section class="date-strip">
      <div>
        <span class="stage-eyebrow">${ui.view === "wife" ? "Pick Session" : "Kitchen Brief"}</span>
        <strong>${dayLabel()}</strong>
        <span>${dateModeText()} · ${total} 项已选 · ${pending ? `${pending} 餐待定` : "三餐已决定"}</span>
      </div>
      ${renderDateControls()}
    </section>
  `;
}

function wifeDateHint() {
  if (isPastDate()) return "看看这天点过什么、吃过什么。";
  if (dateMode() === "future") return "提前预约这天想吃什么。";
  return "选好要吃的，跳过不需要的。";
}

function renderDateControls() {
  return `
    <div class="date-controls" aria-label="选择日期">
      <button class="date-button" data-action="shift-date" data-days="-1" aria-label="前一天">‹</button>
      <input class="date-input" type="date" value="${selectedDateKey()}" data-role="date-picker" aria-label="选择点餐日期" />
      <button class="date-button" data-action="shift-date" data-days="1" aria-label="后一天">›</button>
      <button class="date-button today-button" data-action="go-today">今天</button>
    </div>
  `;
}

function renderOnlineBar() {
  if (!online.enabled) return "";
  const mode = online.enabled ? (online.householdId ? "online" : "setup") : "local";
  return `
    <section class="sync-strip ${mode}">
      <div>
        <strong>${online.enabled ? (online.householdId ? "在线家庭菜单" : "等待家庭码") : "本地预览模式"}</strong>
        <span>${online.enabled ? online.status : "部署国内服务后可以跨设备同步。"}</span>
        ${online.error ? `<span class="sync-error">${escapeHtml(online.error)}</span>` : ""}
      </div>
      ${online.householdId ? `<button class="button" data-action="leave-household">切换家庭</button>` : ""}
    </section>
  `;
}

function renderHouseholdGate() {
  return `
    <main class="auth-gate">
      <section class="panel auth-panel">
        <div class="panel-header">
          <div>
            <h2>输入家庭码</h2>
            <p>同一个家庭码会进入同一份菜单和点餐记录。</p>
          </div>
        </div>
        <div class="panel-body">
          <form class="form-grid" data-role="household-form">
            <div class="form-field">
              <label for="household-code">家庭码</label>
              <input id="household-code" name="householdCode" required autocomplete="off" placeholder="比如：home-kitchen-2026" />
            </div>
            <button class="button primary" type="submit" ${online.loading ? "disabled" : ""}>
              ${online.loading ? "连接中..." : "进入家庭菜单"}
            </button>
          </form>
        </div>
      </section>
    </main>
  `;
}

function renderWifeView(plan) {
  const skipped = plan.skipped[ui.meal];
  const filtered = filteredDishes();
  const readOnly = isPastDate();
  const activeMealCount = mealItemCount(plan, ui.meal);
  return `
    <main class="workspace wife-workspace">
      <section class="main-column">
        <div class="control-strip pick-bar">
          <div class="meal-picker-row">
            <div class="meal-tabs" aria-label="选择餐次">
              ${mealOrder.map((meal) => renderMealTab(plan, meal)).join("")}
            </div>
            ${
              readOnly
                ? `<span class="date-status">只读历史</span>`
                : `<button class="skip-meal-button ${skipped ? "active" : ""}" data-action="toggle-skip" data-meal="${ui.meal}" aria-pressed="${skipped ? "true" : "false"}">
                    ${skipped ? "恢复点餐" : `跳过${mealLabels[ui.meal]}`}
                  </button>`
            }
          </div>
          <div class="decision-row meal-status-row">
            <div>
              <strong>${mealLabels[ui.meal]}</strong>
              <span>${readOnly ? "历史查看模式" : skipped ? "这餐不需要做饭" : activeMealCount ? `已安排 ${activeMealCount} 项` : "还没决定吃什么"}</span>
            </div>
          </div>
        </div>

        <div class="dish-grid">
          ${
            readOnly
              ? renderHistoryMeal(plan, ui.meal)
              : skipped
                ? `<div class="empty-state">已跳过${mealLabels[ui.meal]}，这餐不会出现在采购清单里。</div>`
                : filtered.length
                  ? renderDishCarousel(filtered, plan)
                  : renderNoDish()
          }
        </div>

        ${
          readOnly || skipped
            ? ""
            : `
              <div class="control-strip filter-drawer">
                <div class="search-row">
                  <input class="search" type="search" value="${escapeAttr(ui.search)}" placeholder="搜菜名、食材或口味" aria-label="搜索菜单" data-role="search" />
                  <button class="button primary" data-action="random">随便安排一道</button>
                </div>
                <div class="category-tabs" aria-label="选择分类">
                  ${categories
                    .map(
                      (category) => `
                        <button class="chip ${ui.category === category ? "active" : ""}" data-action="set-category" data-category="${category}">
                          ${category}
                        </button>
                      `
                    )
                    .join("")}
                </div>
                ${renderWishForm()}
              </div>
            `
        }
      </section>

      <aside class="side-column">
        ${renderWifeOrderPanel(plan)}
        ${renderAfterMealPhotoPanel(plan)}
      </aside>
    </main>
  `;
}

function renderMealTab(plan, meal) {
  const isActive = ui.meal === meal;
  const isSkipped = plan.skipped[meal];
  const count = mealItemCount(plan, meal);
  const stateText = isSkipped ? "跳过" : count ? `${count}` : "";
  return `
    <button class="tab ${isActive ? "active" : ""} ${mealResolved(plan, meal) ? "resolved" : ""}" data-action="set-meal" data-meal="${meal}">
      ${mealLabels[meal]} ${stateText ? `<span>${stateText}</span>` : ""}
    </button>
  `;
}

function renderWishForm() {
  return `
    <form class="wish-form" data-role="wish-form">
      <div class="wish-copy">
        <strong>菜单外想吃的菜</strong>
        <span>输入菜名，自动给厨房找参考。</span>
      </div>
      <div class="wish-input-row">
        <input name="wishName" required maxlength="24" autocomplete="off" placeholder="比如：糖醋里脊" />
        <button class="button primary" type="submit">许愿</button>
      </div>
      <textarea name="wishNote" maxlength="80" placeholder="口味备注，可不填，比如少油、酸甜口"></textarea>
    </form>
  `;
}

function renderDishCarousel(dishes, plan) {
  const activeIndex = normalizeFeaturedDishIndex(dishes.length);
  const dish = dishes[activeIndex];
  const isOrdered = plan[ui.meal].includes(dish.id);
  const ingredients = dish.ingredients.map((item) => item.name).slice(0, 8).join("、");
  return `
    <section class="dish-carousel" data-role="dish-carousel" ${dishCarouselStyle(dish)}>
      <div class="carousel-glass">
        <div class="dish-copy">
          <span class="carousel-eyebrow">${escapeHtml(dish.category)} · ${escapeHtml(dish.difficulty)}</span>
          <h2>${escapeHtml(dish.name)}</h2>
          <p>${escapeHtml(dish.note || `${ingredients}，${dish.time} 分钟左右。`)}</p>
          <div class="meta-row">
            <span class="meta">${dish.time} 分钟</span>
            <span class="meta">${dishBadgeText(dish)}</span>
            <span class="meta">${escapeHtml(ingredients)}</span>
          </div>
          <div class="carousel-actions">
            ${
              isOrdered
                ? `<button class="button green" disabled>已加入${mealLabels[ui.meal]}</button>`
                : `<button class="button primary" data-action="add-dish" data-dish="${dish.id}">加入${mealLabels[ui.meal]}</button>`
            }
            <button class="button ghost" data-action="view-detail" data-dish="${dish.id}">查看菜谱</button>
          </div>
        </div>

        <div class="dish-showpiece" aria-hidden="true">
          <div class="plate-orbit">
            <img src="${escapeAttr(dishImageSrc(dish))}" alt="" />
          </div>
        </div>

        <div class="carousel-rail" aria-label="切换菜品">
          <button class="carousel-arrow prev" data-action="shift-featured-dish" data-shift="-1" aria-label="上一道菜">‹</button>
          <div class="dish-thumbs">
            ${dishes.map((item, index) => renderDishThumb(item, index, activeIndex)).join("")}
          </div>
          <button class="carousel-arrow next" data-action="shift-featured-dish" data-shift="1" aria-label="下一道菜">›</button>
        </div>
      </div>
    </section>
  `;
}

function renderDishThumb(dish, index, activeIndex) {
  const offset = index - activeIndex;
  const arc = Math.max(-2, Math.min(2, offset));
  const arcY = index === activeIndex ? -22 : Math.abs(arc) === 1 ? -10 : 2;
  return `
    <button
      class="dish-thumb ${index === activeIndex ? "active" : ""}"
      style="--arc:${arc};--arc-y:${arcY}px"
      data-action="set-featured-dish"
      data-index="${index}"
      aria-label="切换到 ${escapeAttr(dish.name)}"
    >
      <img src="${escapeAttr(dishImageSrc(dish))}" alt="" loading="lazy" />
      <span>${escapeHtml(dish.name)}</span>
    </button>
  `;
}

function normalizeFeaturedDishIndex(length) {
  if (!length) return 0;
  ui.featuredDishIndex = ((ui.featuredDishIndex % length) + length) % length;
  return ui.featuredDishIndex;
}

function dishCarouselStyle(dish) {
  const palette = dishPalette(dish.category);
  return `style="--dish-image:url('${escapeAttr(dishImageSrc(dish))}');--dish-accent:${palette.accent};--dish-wash:${palette.wash};--dish-ink:${palette.ink};"`;
}

function dishPalette(category = "") {
  if (category === "肉菜") return { accent: "#e9a36d", wash: "rgba(239, 181, 126, 0.52)", ink: "#1f120c" };
  if (category === "蔬菜") return { accent: "#acd89a", wash: "rgba(181, 222, 167, 0.52)", ink: "#102012" };
  if (category === "汤粥") return { accent: "#e2c982", wash: "rgba(232, 212, 147, 0.52)", ink: "#211b0c" };
  if (category === "早餐") return { accent: "#f0b8c4", wash: "rgba(243, 190, 202, 0.52)", ink: "#261118" };
  if (category === "主食") return { accent: "#b9cce9", wash: "rgba(188, 205, 231, 0.52)", ink: "#101923" };
  return { accent: "#d9c6a5", wash: "rgba(224, 207, 176, 0.52)", ink: "#1b1710" };
}

function renderWifeDishCard(dish, plan) {
  const isOrdered = plan[ui.meal].includes(dish.id);
  const ingredients = dish.ingredients.map((item) => item.name).join("、");
  return `
    <article class="dish-card">
      <div class="dish-image">
        <img src="${escapeAttr(dishImageSrc(dish))}" alt="${escapeAttr(dish.name)}" loading="lazy" />
        <div class="dish-rating">${dishBadgeText(dish)}</div>
      </div>
      <div class="dish-body">
        <div class="dish-title-row">
          <h2>${escapeHtml(dish.name)}</h2>
          <span class="pill">${escapeHtml(dish.category)}</span>
        </div>
        <div class="meta-row">
          <span class="meta">${dish.time} 分钟</span>
          <span class="meta">${escapeHtml(dish.difficulty)}</span>
        </div>
        <p class="ingredients-line">${escapeHtml(ingredients)}</p>
        <div class="dish-actions">
          <button class="button" data-action="view-detail" data-dish="${dish.id}">菜谱</button>
          ${
            isOrdered
              ? `<button class="button green" disabled>已选</button>`
              : `<button class="button green" data-action="add-dish" data-dish="${dish.id}">加入</button>`
          }
        </div>
      </div>
    </article>
  `;
}

function renderNoDish() {
  return `
    <div class="empty-state">
      这个筛选下还没有菜。换个餐次或去老公厨房录入菜谱。
    </div>
  `;
}

function renderHistoryMeal(plan, meal) {
  const wishes = wishesForMeal(plan, meal);
  if (plan.skipped[meal]) {
    return `<div class="empty-state history-state">${mealLabels[meal]}当时跳过了。</div>`;
  }
  if (!plan[meal].length && !wishes.length) {
    return `<div class="empty-state history-state">这天没有记录${mealLabels[meal]}吃什么。</div>`;
  }
  return [
    ...plan[meal]
    .map((id) => {
      const dish = getDish(id);
      if (!dish) return "";
      return `
        <article class="history-dish-card">
          <img src="${escapeAttr(dishImageSrc(dish))}" alt="${escapeAttr(dish.name)}" loading="lazy" />
          <div>
            <div class="dish-title-row">
              <h2>${escapeHtml(dish.name)}</h2>
              <span class="pill">${mealLabels[meal]}</span>
            </div>
            <p class="ingredients-line">${dish.ingredients.map((item) => escapeHtml(item.name)).join("、")}</p>
            <button class="button" data-action="view-detail" data-dish="${dish.id}">查看当时菜谱</button>
          </div>
        </article>
      `;
    }),
    ...wishes.map((wish) => renderHistoryWishCard(wish))
  ].join("");
}

function renderHistoryWishCard(wish) {
  const recipe = wish.recipe || {};
  const image = recipe.image || fallbackDishImage({ name: wish.name, category: "许愿菜" });
  return `
    <article class="history-dish-card wish-history-card">
      <img src="${escapeAttr(image)}" alt="${escapeAttr(wish.name)}" loading="lazy" />
      <div>
        <div class="dish-title-row">
          <h2>${escapeHtml(wish.name)}</h2>
          <span class="pill">${escapeHtml(wishStatusText(wish))}</span>
        </div>
        <p class="ingredients-line">${escapeHtml(recipe.name ? `参考菜谱：${recipe.name}` : wish.note || "当时点了一道菜单外的菜。")}</p>
        ${recipe.sourceUrl ? `<a class="button" href="${escapeAttr(recipe.sourceUrl)}" target="_blank" rel="noreferrer">查看参考</a>` : ""}
      </div>
    </article>
  `;
}

function renderWifeOrderPanel(plan) {
  const pending = unresolvedMeals(plan);
  const readOnly = isPastDate();
  return `
    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>${isPastDate() ? "历史选择" : "这天选择"}</h2>
          <p>${orderStatusText(plan)}</p>
        </div>
      </div>
      <div class="panel-body">
        <div class="day-summary">
          <div class="stat"><strong>${selectedDishCount(plan)}</strong><span>菜单菜</span></div>
          <div class="stat"><strong>${wishCount(plan)}</strong><span>许愿菜</span></div>
          <div class="stat"><strong>${pending.length}</strong><span>待决定</span></div>
        </div>
        ${mealOrder.map((meal) => renderWifeMealBlock(plan, meal)).join("")}
        ${
          readOnly
            ? `<div class="empty-state compact">历史日期只用于回看，不支持修改或重新下单。</div>`
            : `
              <button class="button primary wide" ${pending.length ? "disabled" : ""} data-action="submit-order">
                ${pending.length ? `还有 ${pending.length} 餐未决定` : plan.submitted ? "重新确认下单" : "确认下单"}
              </button>
              <button class="button blue wide" data-action="clear-today">重新选择这一天</button>
            `
        }
      </div>
    </section>
  `;
}

function renderAfterMealPhotoPanel(plan) {
  if (!afterMealPanelVisible(plan)) return "";
  const photos = planPhotos(plan);
  const targets = planFoodTargets(plan);
  const canUpload = canUploadMealPhotos(plan);
  const analyzedCount = photos.filter((photo) => photo.analysisStatus === "done" && photo.analysis).length;
  return `
    <section class="panel after-meal-panel" data-role="after-meal-panel">
      <div class="panel-header">
        <div>
          <h2>AI 热量分享</h2>
          <p>${photos.length ? `${photos.length} 张照片，${analyzedCount} 张已完成` : canUpload ? "拍一张整桌照，自动估算热量并生成分享图。" : "还没有上传照片。"}</p>
        </div>
        <span class="photo-count">${photos.length}</span>
      </div>
      <div class="panel-body">
        ${
          canUpload
            ? `
              <div class="photo-uploader">
                <label class="photo-target-field">
                  <span>照片归属</span>
                  <select data-role="photo-target">
                    <option value="all">整桌合照</option>
                    ${targets
                      .map(
                        (target) => `
                          <option value="${escapeAttr(target.key)}">${escapeHtml(mealLabels[target.meal])} · ${escapeHtml(target.name)}</option>
                        `
                      )
                      .join("")}
                  </select>
                </label>
                <label class="photo-upload-card">
                  <input type="file" accept="image/*" capture="environment" data-role="meal-photo-upload" />
                  <strong>上传整桌照</strong>
                  <span>自动估算 kcal 并生成分享图</span>
                </label>
              </div>
            `
            : photos.length
              ? ""
              : `<div class="empty-state compact">这天还没有饭后照片。</div>`
        }
        ${
          photos.length
            ? `<div class="meal-photo-grid">${photos.map((photo) => renderMealPhotoCard(photo, targets, canUpload)).join("")}</div>`
            : ""
        }
      </div>
    </section>
  `;
}

function renderMealPhotoCard(photo, targets, canRemove = false) {
  const targetKeys = photo.targetKeys || [];
  const shownTargets = targetKeys.length ? targetKeys : targets.map((target) => target.key);
  const hasDisplayImage = Boolean(photo.shareImage || photo.image);
  const displayImage = photo.shareImage || photo.image || fallbackMealPhotoImage(photo);
  const isSharePreview = Boolean(photo.shareImage);
  const showAnalysisOverlay = !photo.shareImage && photo.shareStatus !== "loading";
  return `
    <article class="meal-photo-card calorie-thread-card">
      <div class="meal-photo-frame ${isSharePreview ? "share-preview-frame" : ""} ${hasDisplayImage ? "" : "photo-placeholder-frame"}">
        <img src="${escapeAttr(displayImage)}" alt="${escapeAttr(photoTargetLabel(photo, targets))}" loading="lazy" />
        ${showAnalysisOverlay ? renderCalorieOverlay(photo) : ""}
      </div>
      <div class="meal-photo-meta">
        <div>
          <strong>${escapeHtml(photoTargetLabel(photo, targets))}</strong>
          <small>${formatTime(photo.createdAt)}</small>
        </div>
        ${
          canRemove
            ? `<button class="icon-button danger" title="删除照片" aria-label="删除饭后照片" data-action="remove-meal-photo" data-photo="${escapeAttr(photo.id)}">×</button>`
            : ""
        }
      </div>
      <div class="meal-photo-tags">
        ${shownTargets
          .slice(0, 4)
          .map((key) => `<span>${escapeHtml(photoTargetName(key, targets))}</span>`)
          .join("")}
      </div>
      ${hasDisplayImage ? "" : `<div class="photo-cache-note">原图没有写入本地存储，重新上传可再次生成分享图。</div>`}
      ${renderPhotoAnalysis(photo)}
    </article>
  `;
}

function fallbackMealPhotoImage(photo = {}) {
  const label = photo.analysis?.title || "整桌合照";
  return fallbackDishImage({ name: label, category: "热量分享" });
}

function renderCalorieOverlay(photo) {
  const items = photo.analysis?.items || [];
  if (photo.analysisStatus !== "done" || !items.length) return "";
  return `
    <div class="calorie-overlay" aria-hidden="true">
      ${items
        .slice(0, 8)
        .map((item, index) => {
          const box = item.bbox;
          const x = box.x * 100;
          const y = box.y * 100;
          const width = box.width * 100;
          const height = box.height * 100;
          const labelLeft = clampNumber((box.x + box.width / 2) * 100, 10, 90);
          const labelTop = clampNumber((box.y + Math.min(box.height * 0.18, 0.06)) * 100, 8, 88);
          return `
            <span class="calorie-ring ring-${index % 3}" style="left:${x.toFixed(2)}%;top:${y.toFixed(2)}%;width:${width.toFixed(2)}%;height:${height.toFixed(2)}%"></span>
            <span class="calorie-bubble bubble-${index % 3}" style="left:${labelLeft.toFixed(2)}%;top:${labelTop.toFixed(2)}%">
              <b>${escapeHtml(item.label)}</b>
              <em>${Math.round(item.calories)} kcal</em>
            </span>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderPhotoAnalysis(photo) {
  if (!photo.image && !photo.analysis) {
    return `
      <div class="photo-analysis failed">
        <strong>照片缓存已释放</strong>
        <p>为了避免占满浏览器存储，原图没有保存在本地。请重新上传整桌照后再估算。</p>
      </div>
    `;
  }

  if (photo.analysisStatus === "loading") {
    if (isStalePhotoProcessing(photo, "analysisStatus", "analysisStartedAt")) {
      return `
        <div class="photo-analysis failed">
          <strong>识别没有返回结果</strong>
          <p>这次请求可能超时了，可以重新发起。会自动完成热量估算和分享图，不需要再点第二次。</p>
          <button class="button wide" data-action="generate-meal-share" data-photo="${escapeAttr(photo.id)}">重新估算并生成</button>
        </div>
      `;
    }
    return `
      <div class="photo-analysis loading">
        <div class="calorie-status-line"><span class="spinner"></span><strong>${photo.shareStatus === "loading" ? "正在估算热量并生成分享图" : "正在识别菜品和热量"}</strong></div>
        <p>${photo.shareStatus === "loading" ? "会一次性完成热量标注和手绘分享图，不需要再点第二次。" : "会按每盘可见份量粗估，完成后自动显示圈线和 kcal。"}</p>
      </div>
    `;
  }

  if (photo.analysisStatus === "failed") {
    return `
      <div class="photo-analysis failed">
        <strong>热量估算失败</strong>
        <p>${escapeHtml(photo.analysisError || "暂时没有识别成功，可以重新试一次。")}</p>
        <button class="button wide" data-action="generate-meal-share" data-photo="${escapeAttr(photo.id)}">重新估算并生成</button>
      </div>
    `;
  }

  if (!photo.analysis) {
    return `
      <div class="photo-analysis idle">
        <p>还没有热量结果。</p>
        <button class="button wide" data-action="analyze-meal-photo" data-photo="${escapeAttr(photo.id)}">估算热量</button>
      </div>
    `;
  }

  const analysis = photo.analysis;
  return `
    <div class="photo-analysis done">
      <div class="calorie-summary">
        <div>
          <strong>${Math.round(analysis.totalCalories)}</strong>
          <span>kcal 粗估</span>
        </div>
        <span class="confidence ${analysis.confidence}">${confidenceText(analysis.confidence)}</span>
      </div>
      <ul class="calorie-list">
        ${analysis.items
          .slice(0, 6)
          .map(
            (item) => `
              <li>
                <span>
                  <b>${escapeHtml(item.label)}</b>
                  <small>${escapeHtml(item.portion)} · ${escapeHtml(item.calorieReason)}</small>
                </span>
                <strong>${Math.round(item.calories)} kcal</strong>
              </li>
            `
          )
          .join("")}
      </ul>
      <p class="calorie-note">${escapeHtml(analysis.notes)}</p>
      ${renderShareImageBlock(photo)}
    </div>
  `;
}

function renderShareImageBlock(photo) {
  if (!photo.image && !photo.shareImage) {
    return `
      <div class="share-image-block failed">
        <span>原图没有保存在本地，重新上传后可生成分享图。</span>
      </div>
    `;
  }

  if (photo.shareStatus === "loading") {
    if (isStalePhotoProcessing(photo, "shareStatus", "shareStartedAt")) {
      return `
        <div class="share-image-block failed">
          <span>分享图生成没有返回结果，可以重新发起。</span>
          <button class="button wide" data-action="generate-meal-share" data-photo="${escapeAttr(photo.id)}">重新估算并生成</button>
        </div>
      `;
    }
    return `
      <div class="share-image-block loading">
        <div class="calorie-status-line"><span class="spinner"></span><strong>正在生成手绘分享图</strong></div>
      </div>
    `;
  }
  if (photo.shareStatus === "failed") {
    return `
      <div class="share-image-block failed">
        <span>${escapeHtml(photo.shareError || "分享图生成失败")}</span>
        <button class="button wide" data-action="generate-meal-share" data-photo="${escapeAttr(photo.id)}">重新估算并生成</button>
      </div>
    `;
  }
  if (!photo.shareImage) return "";
  return `
    <div class="share-image-block">
      <a class="button wide" href="${escapeAttr(photo.shareImage)}" download="meal-calorie-note.jpg">下载分享图</a>
    </div>
  `;
}

function confidenceText(value) {
  if (value === "high") return "较可信";
  if (value === "low") return "仅参考";
  return "中等可信";
}

function renderWifeMealBlock(plan, meal) {
  const ids = plan[meal];
  const wishes = wishesForMeal(plan, meal);
  const skipped = plan.skipped[meal];
  const readOnly = isPastDate();
  const total = ids.length + wishes.length;
  return `
    <div class="meal-block">
      <button class="meal-heading meal-heading-button" data-action="focus-meal" data-meal="${meal}">
        <span>${mealLabels[meal]}</span>
        <span>${skipped ? "已跳过" : total ? `${total} 项` : "待定"}</span>
      </button>
      ${
        skipped
          ? `<button class="empty-state compact meal-empty-button" data-action="focus-meal" data-meal="${meal}">${readOnly ? "这餐当时跳过了" : "这餐不做饭，点击恢复点餐"}</button>`
          : total
            ? `<ul class="order-list">${ids.map((id) => renderWifeOrderItem(meal, id)).join("")}${wishes.map((wish) => renderWifeWishItem(wish)).join("")}</ul>`
            : `<button class="empty-state compact meal-empty-button" data-action="focus-meal" data-meal="${meal}">${readOnly ? `这天没有记录${mealLabels[meal]}` : `还没有安排${mealLabels[meal]}，点击去选菜`}</button>`
      }
    </div>
  `;
}

function renderWifeOrderItem(meal, id) {
  const dish = getDish(id);
  if (!dish) return "";
  const readOnly = isPastDate();
  return `
    <li class="order-item">
      <div class="order-main">
        <div>
          <strong>${escapeHtml(dish.name)}</strong>
          <small>${dish.time} 分钟 · ${escapeHtml(dish.note || dish.difficulty)}</small>
        </div>
        <div class="item-actions">
          <button class="icon-button" title="查看详情" aria-label="查看 ${escapeAttr(dish.name)}" data-action="view-detail" data-dish="${dish.id}">看</button>
          ${readOnly ? "" : `<button class="icon-button" title="移除" aria-label="移除 ${escapeAttr(dish.name)}" data-action="remove-dish" data-meal="${meal}" data-dish="${id}">×</button>`}
        </div>
      </div>
    </li>
  `;
}

function renderWifeWishItem(wish) {
  const readOnly = isPastDate();
  return `
    <li class="order-item wish-order-item">
      <div class="order-main">
        <div>
          <strong>${escapeHtml(wish.name)}</strong>
          <small>许愿菜 · ${escapeHtml(wishStatusText(wish))}${wish.note ? ` · ${escapeHtml(wish.note)}` : ""}</small>
        </div>
        <div class="item-actions">
          ${
            wish.recipe?.sourceUrl
              ? `<a class="icon-button" title="查看参考" aria-label="查看 ${escapeAttr(wish.name)} 的参考菜谱" href="${escapeAttr(wish.recipe.sourceUrl)}" target="_blank" rel="noreferrer">?</a>`
              : ""
          }
          ${readOnly ? "" : `<button class="icon-button" title="移除" aria-label="移除 ${escapeAttr(wish.name)}" data-action="remove-wish" data-wish="${wish.id}">×</button>`}
        </div>
      </div>
    </li>
  `;
}

function renderHusbandView(plan) {
  const viewable = canViewOrder(plan);
  const shopping = viewable ? aggregateShoppingList(plan) : [];
  return `
    <main class="workspace husband-workspace">
      <section class="main-column">
        ${renderHusbandOrderPanel(plan)}
        ${renderAfterMealPhotoPanel(plan)}
      </section>
      <aside class="side-column">
        ${renderNotificationPanel(plan)}
        ${renderShoppingPanel(shopping, !viewable)}
        ${renderMenuPanel()}
      </aside>
    </main>
  `;
}

function renderNotificationPanel(plan) {
  const shoppingCount = plan.submitted
    ? aggregateShoppingList(plan).filter((item) => !isShoppingGroupCollapsed(item.group)).length
    : 0;
  return `
    <section class="panel notice-panel ${plan.notificationUnread ? "unread" : ""}">
      <div class="panel-header">
        <div>
          <h2>${plan.notificationUnread ? "新订单" : "厨房状态"}</h2>
          <p>${isPastDate() ? `${dayLabel()}的历史记录。` : plan.submitted ? `老婆 ${formatTime(plan.submittedAt)} 确认了这天的安排。` : "等待老婆确认下单。"}</p>
        </div>
        ${plan.notificationUnread ? `<button class="button" data-action="mark-notification-read">已读</button>` : ""}
      </div>
      <div class="panel-body">
        <div class="day-summary">
          <div class="stat"><strong>${selectedDishCount(plan) + wishCount(plan)}</strong><span>点单项</span></div>
          <div class="stat"><strong>${mealOrder.filter((meal) => plan.skipped[meal]).length}</strong><span>跳过</span></div>
          <div class="stat"><strong>${shoppingCount}</strong><span>采购项</span></div>
        </div>
      </div>
    </section>
  `;
}

function renderHusbandOrderPanel(plan) {
  const viewable = canViewOrder(plan);
  return `
    <section class="panel order-detail-panel">
      <div class="panel-header">
        <div>
          <h2>${isPastDate() ? "历史菜单" : "这天菜单"}</h2>
          <p>${viewable ? "按餐次看菜、原料和简单做法。" : "老婆确认后，这里会显示完整订单。"}</p>
        </div>
      </div>
      <div class="panel-body">
        ${
          viewable
            ? mealOrder.map((meal) => renderHusbandMealBlock(plan, meal)).join("")
            : `<div class="empty-state">${isPastDate() ? "这天没有点餐记录。" : "还没收到下单确认。可以先去“老婆点菜”界面选择或跳过每一餐。"}</div>`
        }
      </div>
    </section>
  `;
}

function renderHusbandMealBlock(plan, meal) {
  const ids = plan[meal];
  const wishes = wishesForMeal(plan, meal);
  const total = ids.length + wishes.length;
  return `
    <div class="meal-block cook-meal-block">
      <div class="meal-heading">
        <span>${mealLabels[meal]}</span>
        <span>${plan.skipped[meal] ? "老婆跳过" : total ? `${total} 项` : "未安排"}</span>
      </div>
      ${
        plan.skipped[meal]
          ? `<div class="skip-card">这餐不用准备，采购清单已自动排除。</div>`
          : total
            ? `<div class="cook-card-list">${ids.map((id) => renderCookDishCard(meal, id)).join("")}${wishes.map((wish) => renderWishCookCard(wish)).join("")}</div>`
            : `<div class="empty-state compact">这餐没有菜。</div>`
      }
    </div>
  `;
}

function renderCookDishCard(meal, id) {
  const dish = getDish(id);
  if (!dish) return "";
  const steps = dishStepItems(dish);
  const imageSteps = stepImageCount(steps);
  return `
    <article class="cook-card">
      <img src="${escapeAttr(dishImageSrc(dish))}" alt="${escapeAttr(dish.name)}" loading="lazy" />
      <div class="cook-card-body">
        <div class="dish-title-row">
          <h3>${escapeHtml(dish.name)}</h3>
          <span class="pill">${mealLabels[meal]}</span>
        </div>
        <div class="meta-row">
          <span class="meta">${dish.time} 分钟</span>
          <span class="meta">${escapeHtml(dish.difficulty)}</span>
          <span class="meta">${escapeHtml(dish.category)}</span>
          ${imageSteps ? `<span class="meta">步骤图 ${imageSteps}</span>` : ""}
        </div>
        <p class="cook-note">${escapeHtml(dish.note || "简单处理食材，按家里口味调味。")}</p>
        <div class="mini-section">
          <strong>原料</strong>
          <p>${dish.ingredients.map((item) => escapeHtml(formatIngredient(item))).join("、")}</p>
        </div>
        <div class="mini-section">
          <strong>简单做法</strong>
          ${renderStepTextList(steps, 5, "打开下厨房查看完整步骤。")}
        </div>
        <div class="dish-actions">
          <a class="button" href="${escapeAttr(dishSourceUrl(dish))}" target="_blank" rel="noreferrer">下厨房</a>
          <button class="button green" data-action="view-detail" data-dish="${dish.id}">查看详情</button>
        </div>
      </div>
    </article>
  `;
}

function renderWishCookCard(wish) {
  const recipe = wish.recipe || {};
  const previewDish = {
    name: recipe.name || wish.name,
    category: "许愿菜",
    image: recipe.image || recipe.imageUrl || ""
  };
  const sourceUrl = recipe.sourceUrl || "";
  const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
  const steps = dishStepItems(recipe, false);
  const imageSteps = stepImageCount(steps);
  const isBusy = wish.status === "searching";
  const hasRecipe = Boolean(recipe.name || sourceUrl);
  return `
    <article class="cook-card wish-cook-card">
      <img src="${escapeAttr(dishImageSrc(previewDish))}" alt="${escapeAttr(wish.name)}" loading="lazy" />
      <div class="cook-card-body">
        <div class="dish-title-row">
          <h3>${escapeHtml(wish.name)}</h3>
          <span class="pill wish-status ${wishStatusClass(wish)}">${escapeHtml(wishStatusText(wish))}</span>
        </div>
        <div class="meta-row">
          <span class="meta">${mealLabels[wish.meal]}</span>
          <span class="meta">老婆许愿</span>
          ${recipe.searchRating ? `<span class="meta">评分 ${recipe.searchRating}</span>` : ""}
          ${recipe.searchCookedCount ? `<span class="meta">${recipe.searchCookedCount} 人做过</span>` : ""}
          ${imageSteps ? `<span class="meta">步骤图 ${imageSteps}</span>` : ""}
        </div>
        <p class="cook-note">${escapeHtml(wish.note || "菜单外想吃的菜，先给老公一份参考做法。")}</p>
        ${
          isBusy
            ? `<div class="empty-state compact">正在自动找下厨房参考菜谱。</div>`
            : hasRecipe
              ? `
                <div class="mini-section">
                  <strong>参考菜谱</strong>
                  <p>${escapeHtml(recipe.name || wish.name)}</p>
                </div>
                <div class="mini-section">
                  <strong>原料参考</strong>
                  <p>${ingredients.length ? ingredients.slice(0, 12).map(escapeHtml).join("、") : "菜谱暂未读到原料，建议打开下厨房确认。"}</p>
                </div>
                <div class="mini-section">
                  <strong>做法参考</strong>
                  ${renderStepTextList(steps, 5, "打开下厨房查看完整步骤。")}
                </div>
              `
              : `<div class="empty-state compact">${escapeHtml(wish.error || "暂时没找到参考菜谱。")}</div>`
        }
        <div class="dish-actions wish-actions">
          ${sourceUrl ? `<a class="button" href="${escapeAttr(sourceUrl)}" target="_blank" rel="noreferrer">下厨房</a>` : ""}
          <button class="button green" data-action="accept-wish" data-wish="${wish.id}" ${hasRecipe ? "" : "disabled"}>我来挑战</button>
          <button class="button" data-action="refresh-wish" data-wish="${wish.id}" ${isBusy ? "disabled" : ""}>重新找</button>
          <button class="button ghost" data-action="decline-wish" data-wish="${wish.id}">这次做不了</button>
        </div>
      </div>
    </article>
  `;
}

function renderShoppingPanel(shopping, locked = false) {
  const groups = groupedShoppingList(shopping);
  return `
    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>采购清单</h2>
          <p>${locked ? "下单后自动生成。" : "自动合并同名食材，买完可勾掉。"}</p>
        </div>
        <button class="button" data-action="copy-list" ${locked || !shopping.length ? "disabled" : ""}>复制</button>
      </div>
      <div class="panel-body">
        ${
          locked
            ? `<div class="empty-state">等待老婆确认下单。</div>`
            : shopping.length
              ? groups
                  .map(
                    ([group, items]) => `
                      <div class="shopping-group ${isShoppingGroupCollapsed(group) ? "collapsed" : ""}">
                        ${renderShoppingGroupHeader(group, items)}
                        ${
                          isShoppingGroupCollapsed(group)
                            ? `<div class="shopping-group-empty">已收起，复制清单时不会包含这组。</div>`
                            : `<ul class="shopping-list">
                                ${items.map(renderShoppingItem).join("")}
                              </ul>`
                        }
                      </div>
                    `
                  )
                  .join("")
              : `<div class="empty-state">今天没有需要采购的食材。</div>`
        }
      </div>
    </section>
  `;
}

function renderShoppingGroupHeader(group, items) {
  const collapsed = isShoppingGroupCollapsed(group);
  const total = items.length;
  return `
    <div class="shopping-group-title">
      <div>
        <h3>${escapeHtml(group)}</h3>
        ${group === "调味" ? `<small>家里常备的话可以收起，不参与复制。</small>` : ""}
      </div>
      <button class="group-toggle" data-action="toggle-shopping-group" data-group="${escapeAttr(group)}" aria-expanded="${collapsed ? "false" : "true"}">
        <span>${collapsed ? `展开 ${total}` : "收起"}</span>
        <b>${collapsed ? "▾" : "▴"}</b>
      </button>
    </div>
  `;
}

function renderShoppingItem(item) {
  const checked = state.checkedItems[selectedDateKey()]?.[item.key];
  const amount = formatShoppingAmount(item);
  const sources = Array.from(new Set(item.dishes)).join("、");
  return `
    <li class="shopping-item ${checked ? "done" : ""}">
      <input type="checkbox" ${checked ? "checked" : ""} aria-label="勾选 ${escapeAttr(item.name)}" data-action="toggle-bought" data-key="${escapeAttr(item.key)}" />
      <div class="shopping-main">
        <div>
          <strong>${escapeHtml(item.name)} ${escapeHtml(amount)}</strong>
          <small>用于：${escapeHtml(sources)}</small>
        </div>
      </div>
    </li>
  `;
}

function formatShoppingAmount(item) {
  const numericParts = Object.entries(item.amounts || {})
    .filter(([, amount]) => Number.isFinite(amount) && amount > 0)
    .map(([unit, amount]) => `${niceNumber(amount)}${unit}`);
  const looseParts = Array.from(new Set(item.looseAmounts || [])).filter((value) => value && value !== "按需");
  const parts = [...numericParts, ...looseParts].slice(0, 3);
  if (parts.length) return parts.join(" + ");
  return "按需";
}

function renderMenuPanel() {
  const dishes = activeDishes();
  const categoryCounts = menuCategoryCounts(dishes).filter((item) => item.count > 0);
  const preview = dishes.slice(0, 3);
  return `
    <section class="panel menu-summary-panel">
      <div class="panel-header">
        <div>
          <h2>我的菜单</h2>
          <p>${dishes.length} 道家常菜，${categoryCounts.length} 个分类。</p>
        </div>
        <button class="button" data-action="open-menu-drawer">管理</button>
      </div>
      <div class="panel-body">
        <div class="menu-summary-grid">
          <div class="stat"><strong>${dishes.length}</strong><span>菜谱</span></div>
          <div class="stat"><strong>${categoryCounts.length}</strong><span>分类</span></div>
          <div class="stat"><strong>${dishes.filter((dish) => dish.sourceUrl).length}</strong><span>链接</span></div>
        </div>
        ${
          categoryCounts.length
            ? `<div class="menu-category-preview">${categoryCounts
                .slice(0, 4)
                .map((item) => `<span>${escapeHtml(item.category)} ${item.count}</span>`)
                .join("")}</div>`
            : ""
        }
        ${
          preview.length
            ? `<div class="menu-preview-line">${preview.map((dish) => escapeHtml(dish.name)).join("、")}</div>`
            : `<div class="empty-state compact">菜单还是空的。</div>`
        }
      </div>
    </section>
  `;
}

function menuCategoryCounts(dishes = activeDishes()) {
  return categories
    .filter((category) => category !== "全部")
    .map((category) => ({
      category,
      count: dishes.filter((dish) => dish.category === category).length
    }));
}

function filteredMenuDishes() {
  const search = ui.menuSearch.trim().toLowerCase();
  return activeDishes()
    .filter((dish) => {
      const categoryOk = ui.menuCategory === "全部" || dish.category === ui.menuCategory;
      const searchOk =
        !search ||
        [dish.name, dish.category, dish.note, dish.ingredients.map((item) => item.name).join(" ")]
          .join(" ")
          .toLowerCase()
          .includes(search);
      return categoryOk && searchOk;
    })
    .sort((a, b) => a.category.localeCompare(b.category, "zh-CN") || a.time - b.time);
}

function renderMenuDrawer() {
  if (!ui.menuDrawerOpen) return "";
  const dishes = activeDishes();
  const filtered = filteredMenuDishes();
  const editingDish = ui.editingDishId ? getDish(ui.editingDishId) : null;
  return `
    <div class="menu-drawer-backdrop" data-role="menu-drawer-backdrop">
      <aside class="menu-drawer" role="dialog" aria-modal="true" aria-label="我的菜单管理">
        <header class="drawer-header">
          <div>
            <h2>我的菜单</h2>
            <p>${ui.menuMode === "browse" ? `${filtered.length}/${dishes.length} 道` : editingDish ? `编辑：${escapeHtml(editingDish.name)}` : "录入一道会做的菜"}</p>
          </div>
          <button class="icon-button" data-action="close-menu-drawer" aria-label="关闭菜单">×</button>
        </header>
        <div class="drawer-tabs" role="tablist" aria-label="菜单管理模式">
          <button class="${ui.menuMode === "browse" ? "active" : ""}" data-action="set-menu-mode" data-mode="browse">浏览</button>
          <button class="${ui.menuMode === "form" ? "active" : ""}" data-action="set-menu-mode" data-mode="form">录入</button>
        </div>
        <div class="drawer-body">
          ${ui.menuMode === "form" ? renderRecipeForm(editingDish) : renderMenuBrowser(filtered, dishes)}
        </div>
      </aside>
    </div>
  `;
}

function renderMenuBrowser(filtered, allDishes) {
  return `
    <div class="menu-browser">
      <input class="search compact-search" type="search" value="${escapeAttr(ui.menuSearch)}" placeholder="搜菜名、食材或备注" aria-label="搜索我的菜单" data-role="menu-search" />
      <div class="category-tabs compact-tabs" aria-label="筛选我的菜单">
        ${["全部", ...categories.filter((category) => category !== "全部")]
          .map((category) => {
            const count = category === "全部" ? allDishes.length : allDishes.filter((dish) => dish.category === category).length;
            return `
              <button class="chip ${ui.menuCategory === category ? "active" : ""}" data-action="set-menu-category" data-category="${category}" ${count ? "" : "disabled"}>
                ${category}<span>${count}</span>
              </button>
            `;
          })
          .join("")}
      </div>
      ${renderMenuList(filtered)}
    </div>
  `;
}

function renderMenuList(dishes = activeDishes()) {
  if (!dishes.length) {
    return `<div class="empty-state compact">没有匹配的菜。</div>`;
  }
  return `
    <ul class="menu-list">
      ${dishes.map(renderMenuListItem).join("")}
    </ul>
  `;
}

function renderMenuListItem(dish) {
  return `
    <li class="menu-list-item">
      <img class="menu-thumb" src="${escapeAttr(dishImageSrc(dish))}" alt="${escapeAttr(dish.name)}" loading="lazy" />
      <div>
        <strong>${escapeHtml(dish.name)}</strong>
        <small>${escapeHtml(dish.category)} · ${dish.time} 分钟 · ${dish.meals.map((meal) => mealLabels[meal]).join("/")}</small>
      </div>
      <div class="item-actions menu-item-actions">
        <button class="button mini-button" title="查看详情" aria-label="查看 ${escapeAttr(dish.name)}" data-action="view-detail" data-dish="${dish.id}">查看</button>
        <button class="button mini-button" title="编辑菜谱" aria-label="编辑 ${escapeAttr(dish.name)}" data-action="edit-dish" data-dish="${dish.id}">编辑</button>
        <button class="icon-button danger" title="从我的菜单移除" aria-label="移除 ${escapeAttr(dish.name)}" data-action="remove-menu-dish" data-dish="${dish.id}">×</button>
      </div>
    </li>
  `;
}

function renderRecipeForm(editingDish = null) {
  const isEditing = Boolean(editingDish);
  const ingredientValue = isEditing ? editingDish.ingredients.map(formatIngredient).join("\n") : "";
  const existingSteps = isEditing ? dishStepItems(editingDish, false) : [];
  const stepValue = existingSteps.map((step) => step.text).filter(Boolean).join("\n");
  const selectedMeals = isEditing ? editingDish.meals : [ui.meal];
  return `
    <form class="form-grid" data-role="dish-form" ${isEditing ? `data-edit-dish="${escapeAttr(editingDish.id)}"` : ""}>
      <div class="form-field">
        <label for="dish-name">菜名</label>
        <input id="dish-name" name="name" required placeholder="比如：青椒肉丝" value="${escapeAttr(editingDish?.name || "")}" />
      </div>
      <div class="form-field">
        <label for="dish-category">分类</label>
        <select id="dish-category" name="category">
          ${categories
            .filter((category) => category !== "全部")
            .map((category) => `<option ${editingDish?.category === category ? "selected" : ""}>${category}</option>`)
            .join("")}
        </select>
      </div>
      <div class="form-field">
        <label>适合餐次</label>
        <div class="checkbox-grid">
          ${mealOrder
            .map(
              (meal) => `
                <label class="checkbox-pill">
                  <input type="checkbox" name="meals" value="${meal}" ${selectedMeals.includes(meal) ? "checked" : ""} />
                  ${mealLabels[meal]}
                </label>
              `
            )
            .join("")}
        </div>
      </div>
      <div class="form-field">
        <label for="dish-time">预计时间</label>
        <input id="dish-time" name="time" type="number" min="5" value="${editingDish?.time || 20}" />
      </div>
      <div class="form-field">
        <label for="dish-ingredients">食材</label>
        <textarea id="dish-ingredients" name="ingredients" required placeholder="鸡蛋 3 个&#10;番茄 2 个&#10;小葱 1 根">${escapeHtml(ingredientValue)}</textarea>
      </div>
      <div class="form-field">
        <label for="dish-steps">简单做法</label>
        <textarea id="dish-steps" name="steps" placeholder="每行一步：切配食材&#10;先炒主料&#10;调味出锅">${escapeHtml(stepValue)}</textarea>
      </div>
      <div class="form-field">
        <label for="dish-source">下厨房链接</label>
        <div class="source-import-row">
          <input id="dish-source" name="sourceUrl" type="url" placeholder="https://www.xiachufang.com/recipe/..." value="${escapeAttr(editingDish?.sourceUrl || "")}" />
          <button class="button" type="button" data-action="import-recipe-link">链接导入</button>
        </div>
        <input name="imageUrl" type="hidden" data-role="imported-image" value="${escapeAttr(editingDish?.image || "")}" />
        <textarea name="stepDetails" data-role="imported-steps" hidden>${escapeHtml(serializeStepDetails(existingSteps))}</textarea>
        <div class="import-cover-preview" data-role="import-cover-preview" ${editingDish?.image ? "" : "hidden"}>
          ${
            editingDish?.image
              ? `<img src="${escapeAttr(dishImageSrc(editingDish))}" alt="当前封面" />
                 <div>
                   <strong>当前封面</strong>
                   <span>导入链接或上传图片后会替换。</span>
                 </div>`
              : ""
          }
        </div>
        <div class="import-step-preview" data-role="import-step-preview" ${existingSteps.some((step) => stepImageSrc(step)) ? "" : "hidden"}>
          ${renderImportStepPreview(existingSteps)}
        </div>
      </div>
      <div class="form-field">
        <label for="dish-image">封面图</label>
        <input id="dish-image" name="imageFile" type="file" accept="image/*" />
      </div>
      <div class="form-field">
        <label for="dish-note">备注</label>
        <textarea id="dish-note" name="note" placeholder="关键火候、老婆偏好、下次改进">${escapeHtml(editingDish?.note || "")}</textarea>
      </div>
      <button class="button primary" type="submit">${isEditing ? "保存修改" : "保存到菜单"}</button>
    </form>
  `;
}

function renderDetailModal() {
  const dish = ui.detailDishId ? getDish(ui.detailDishId) : null;
  if (!dish) return "";
  const steps = dishStepItems(dish);
  return `
    <div class="detail-backdrop" data-role="detail-backdrop">
      <section class="detail-sheet" role="dialog" aria-modal="true" aria-label="${escapeAttr(dish.name)}详情">
        <div class="detail-media">
          <img src="${escapeAttr(dishImageSrc(dish))}" alt="${escapeAttr(dish.name)}" />
          <button class="icon-button detail-close" data-action="close-detail" aria-label="关闭详情">×</button>
        </div>
        <div class="detail-content">
          <div class="dish-title-row">
            <h2>${escapeHtml(dish.name)}</h2>
            <span class="pill">${escapeHtml(dish.category)}</span>
          </div>
          <div class="meta-row">
            <span class="meta">${dish.time} 分钟</span>
            <span class="meta">${escapeHtml(dish.difficulty)}</span>
            <span class="meta">${dish.meals.map((meal) => mealLabels[meal]).join("/")}</span>
          </div>
          <p class="cook-note">${escapeHtml(dish.note || "家常做法，按口味灵活调整。")}</p>
          <div class="mini-section">
            <strong>原料</strong>
            <ul class="ingredient-list">${dish.ingredients.map((item) => `<li>${escapeHtml(formatIngredient(item))}</li>`).join("")}</ul>
          </div>
          <div class="mini-section">
            <strong>简单做法</strong>
            ${renderStepTimeline(steps)}
          </div>
          <a class="button primary wide" href="${escapeAttr(dishSourceUrl(dish))}" target="_blank" rel="noreferrer">打开下厨房参考</a>
          ${
            ui.view === "husband"
              ? `<button class="button wide" data-action="edit-dish" data-dish="${dish.id}">编辑菜谱</button>
                <label class="button wide file-button">
                  更换封面
                  <input type="file" accept="image/*" data-role="cover-upload" data-dish="${dish.id}" />
                </label>`
              : ""
          }
        </div>
      </section>
    </div>
  `;
}

function niceNumber(value) {
  if (!Number.isFinite(value)) return "";
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(1)));
}

function addDishToMeal(dishId, meal = ui.meal) {
  if (!isEditableDate()) {
    toast("历史日期只能查看，不能点菜");
    return;
  }
  const plan = ensureTodayPlan();
  if (!plan[meal].includes(dishId)) {
    plan.skipped[meal] = false;
    plan[meal].push(dishId);
    markPlanDraft(plan);
    saveState();
    render();
  } else {
    toast("这道菜已经在今日菜单里了");
  }
}

function removeDishFromMeal(dishId, meal) {
  if (!isEditableDate()) {
    toast("历史日期只能查看，不能修改");
    return;
  }
  const plan = ensureTodayPlan();
  plan[meal] = plan[meal].filter((id) => id !== dishId);
  markPlanDraft(plan);
  saveState();
  render();
}

async function submitWish(event) {
  event.preventDefault();
  if (!isEditableDate()) {
    toast("历史日期只能查看，不能点菜");
    return;
  }

  const plan = ensureTodayPlan();
  if (plan.skipped[ui.meal]) {
    toast(`已跳过${mealLabels[ui.meal]}，先恢复点餐`);
    return;
  }

  const form = event.target;
  const data = new FormData(form);
  const name = String(data.get("wishName") || "").trim();
  const note = String(data.get("wishNote") || "").trim();
  if (!name) {
    toast("先输入想吃的菜名");
    return;
  }

  const existed = wishesForMeal(plan, ui.meal).some((wish) => wish.name === name);
  if (existed) {
    toast("这道许愿菜已经点过了");
    return;
  }

  const wish = normalizeWish({
    id: `wish-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    meal: ui.meal,
    name,
    note,
    status: "searching",
    createdAt: new Date().toISOString()
  });
  plan.wishes = [wish, ...(plan.wishes || [])];
  plan.skipped[ui.meal] = false;
  markPlanDraft(plan);
  saveState();
  form.reset();
  render();
  toast(`已许愿：${name}`);
  searchWishRecipe(selectedDateKey(), wish.id);
}

async function searchWishRecipe(dateKey, wishId) {
  const current = findWishLocation(wishId, dateKey);
  if (!current) return;
  current.wish.status = "searching";
  current.wish.error = "";
  current.wish.searchStartedAt = new Date().toISOString();
  saveState();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), WISH_SEARCH_TIMEOUT_MS);

  try {
    const response = await fetch("/api/search-recipe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: current.wish.name }),
      signal: controller.signal
    });
    const payload = await response.json().catch(() => ({}));
    const latest = findWishLocation(wishId, dateKey);
    if (!latest) return;
    if (!response.ok) throw new Error(payload.error || "没找到参考菜谱");

    latest.wish.status = "found";
    latest.wish.recipe = payload.recipe || null;
    latest.wish.error = "";
    latest.wish.searchStartedAt = "";
    saveState();
    render();
  } catch (error) {
    const latest = findWishLocation(wishId, dateKey);
    if (!latest) return;
    latest.wish.status = "failed";
    latest.wish.error =
      error.name === "AbortError" ? "找菜超时了，可以点重新找，或者直接让老公挑战。" : error.message || "没找到参考菜谱";
    latest.wish.searchStartedAt = "";
    saveState();
    render();
  } finally {
    clearTimeout(timeoutId);
  }
}

function removeWish(wishId) {
  if (!isEditableDate()) {
    toast("历史日期只能查看，不能修改");
    return;
  }
  const found = findWishLocation(wishId);
  if (!found) return;
  found.plan.wishes = found.plan.wishes.filter((wish) => wish.id !== wishId);
  markPlanDraft(found.plan);
  saveState();
  render();
}

function refreshWish(wishId) {
  const found = findWishLocation(wishId);
  if (!found) return;
  found.wish.status = "searching";
  found.wish.recipe = null;
  found.wish.error = "";
  found.wish.searchStartedAt = new Date().toISOString();
  saveState();
  render();
  searchWishRecipe(found.dateKey, wishId);
}

function declineWish(wishId) {
  const found = findWishLocation(wishId);
  if (!found) return;
  found.wish.status = "declined";
  found.wish.error = "";
  saveState();
  render();
  toast(`已标记这次不做：${found.wish.name}`);
}

function acceptWish(wishId) {
  const found = findWishLocation(wishId);
  if (!found || !found.wish.recipe) {
    toast("还没有可用的参考菜谱");
    return;
  }

  const dish = createDishFromWish(found.wish);
  const existing = activeDishes().find(
    (item) => item.name === dish.name || (item.sourceUrl && item.sourceUrl === dish.sourceUrl)
  );
  const dishId = existing?.id || dish.id;
  if (!existing) state.dishes = [dish, ...state.dishes];
  if (!found.plan[found.wish.meal].includes(dishId)) {
    found.plan[found.wish.meal].push(dishId);
  }
  found.plan.skipped[found.wish.meal] = false;
  found.plan.wishes = found.plan.wishes.filter((wish) => wish.id !== wishId);
  saveState();
  render();
  toast(`已接招：${dish.name}`);
}

function createDishFromWish(wish) {
  const recipe = wish.recipe || {};
  const ingredientLines = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
  const steps = dishStepItems(recipe, false);
  const name = recipe.name || wish.name;
  return {
    id: `dish-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name,
    category: guessDishCategory(name, ingredientLines),
    meals: [wish.meal],
    time: Math.max(5, Number(recipe.time) || 30),
    difficulty: "挑战菜",
    rating: 4,
    image: recipe.image || recipe.imageUrl || "",
    ingredients: parseIngredients(ingredientLines.join("\n")),
    steps,
    sourceUrl: recipe.sourceUrl || "",
    note: wish.note ? `老婆许愿：${wish.note}` : "老婆许愿菜，按参考菜谱尝试。"
  };
}

function findWishLocation(wishId, preferredDateKey = selectedDateKey()) {
  const keys = [preferredDateKey, ...Object.keys(state.plans).filter((key) => key !== preferredDateKey)];
  for (const key of keys) {
    if (!state.plans[key]) continue;
    const plan = normalizePlan(state.plans[key]);
    state.plans[key] = plan;
    const wish = plan.wishes.find((item) => item.id === wishId);
    if (wish) return { dateKey: key, plan, wish };
  }
  return null;
}

function editDish(dishId) {
  const dish = getDish(dishId);
  if (!dish) return;
  ui.menuDrawerOpen = true;
  ui.menuMode = "form";
  ui.editingDishId = dishId;
  ui.detailDishId = null;
  render();
}

function removeDishFromMenu(dishId) {
  const dish = getDish(dishId);
  if (!dish) return;
  if (typeof window.confirm === "function" && !window.confirm(`从我的菜单移除「${dish.name}」？`)) return;

  state.dishes = state.dishes.map((item) => (item.id === dishId ? { ...item, archived: true } : item));
  delete state.feedback[dishId];

  for (const [key, rawPlan] of Object.entries(state.plans)) {
    const plan = normalizePlan(rawPlan);
    let removedFromPlan = false;
    if (key >= todayKey()) {
      for (const meal of mealOrder) {
        const nextIds = plan[meal].filter((id) => id !== dishId);
        if (nextIds.length !== plan[meal].length) removedFromPlan = true;
        plan[meal] = nextIds;
      }
    }
    if (removedFromPlan && key >= todayKey()) markPlanDraft(plan);
    state.plans[key] = plan;
  }

  if (ui.detailDishId === dishId) ui.detailDishId = null;
  saveState();
  render();
  toast(`已移除：${dish.name}`);
}

function randomDish() {
  if (!isEditableDate()) {
    toast("历史日期只能查看，不能随机安排");
    return;
  }
  const plan = ensureTodayPlan();
  if (plan.skipped[ui.meal]) {
    toast(`已跳过${mealLabels[ui.meal]}，先恢复点餐`);
    return;
  }
  const selected = new Set(plan[ui.meal]);
  const options = filteredDishes().filter((dish) => !selected.has(dish.id) && state.feedback[dish.id] !== "skip");
  if (!options.length) {
    toast("这个餐次暂时没有可随机的菜");
    return;
  }
  const pick = options[Math.floor(Math.random() * options.length)];
  addDishToMeal(pick.id, ui.meal);
  toast(`已安排：${pick.name}`);
}

function clearToday() {
  if (!isEditableDate()) {
    toast("历史日期只能查看，不能清空");
    return;
  }
  state.plans[selectedDateKey()] = emptyPlan();
  state.checkedItems[selectedDateKey()] = {};
  if (state.shoppingGroupCollapsed?.[selectedDateKey()]) state.shoppingGroupCollapsed[selectedDateKey()] = {};
  saveState();
  render();
  toast("这一天的菜单已清空");
}

function toggleMealSkip(meal) {
  if (!isEditableDate()) {
    toast("历史日期只能查看，不能修改");
    return;
  }
  const plan = ensureTodayPlan();
  plan.skipped[meal] = !plan.skipped[meal];
  if (plan.skipped[meal]) {
    plan[meal] = [];
    plan.wishes = plan.wishes.filter((wish) => wish.meal !== meal);
  }
  markPlanDraft(plan);
  saveState();
  render();
}

function submitOrder() {
  if (!isEditableDate()) {
    toast("历史日期只能查看，不能下单");
    return;
  }
  const plan = ensureTodayPlan();
  const pending = unresolvedMeals(plan);
  if (pending.length) {
    toast(`还有 ${pending.map((meal) => mealLabels[meal]).join("、")} 未决定`);
    return;
  }
  plan.submitted = true;
  plan.submittedAt = new Date().toISOString();
  plan.notificationUnread = true;
  saveState();
  render();
  toast("已下单，老公厨房会收到提醒");
}

async function handleMealPhotoUpload(event) {
  const input = event.target;
  const files = Array.from(input.files || []);
  if (!files.length) return;

  const dateKey = selectedDateKey();
  const plan = ensureTodayPlan();
  if (!canUploadMealPhotos(plan)) {
    toast("今天确认下单后才能上传成品照");
    input.value = "";
    return;
  }

  const existingPhotos = planPhotos(plan);
  const remaining = MEAL_PHOTO_LIMIT - existingPhotos.length;
  if (remaining <= 0) {
    toast(`这天最多保留 ${MEAL_PHOTO_LIMIT} 张照片`);
    input.value = "";
    return;
  }

  const panel = input.closest("[data-role='after-meal-panel']");
  const targetValue = panel?.querySelector("[data-role='photo-target']")?.value || "all";
  const targets = planFoodTargets(plan);
  const targetKeys = targetValue === "all" ? targets.map((target) => target.key) : [targetValue];
  const selectedFiles = files.slice(0, remaining);

  try {
    const photos = [];
    for (const file of selectedFiles) {
      const image = await compressImageFile(file, MEAL_PHOTO_IMAGE_OPTIONS);
      photos.push(
        normalizeMealPhoto({
          id: `photo-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          image,
          targetKeys,
          createdAt: new Date().toISOString()
        })
      );
    }
    plan.afterPhotos = [...photos.filter(Boolean), ...existingPhotos].slice(0, MEAL_PHOTO_LIMIT);
    saveState();
    render();
    toast("照片已上传，开始估算热量并生成分享图");
    for (const photo of photos.filter(Boolean)) {
      await analyzeMealPhoto(photo.id, { dateKey, autoShare: true, quiet: true });
    }
  } catch (error) {
    toast(error.message || "照片处理失败");
  } finally {
    input.value = "";
  }
}

async function analyzeMealPhoto(photoId, options = {}) {
  const dateKey = options.dateKey || selectedDateKey();
  const includeShareImage = Boolean(options.includeShareImage);
  const autoShare = Boolean(options.autoShare);
  const plan = state.plans[dateKey] ? normalizePlan(state.plans[dateKey]) : null;
  const photo = planPhotos(plan).find((item) => item.id === photoId);
  if (!plan || !photo) {
    toast("没有找到这张照片");
    return;
  }
  if (!photo.image) {
    updateMealPhoto(dateKey, photoId, (item) => ({
      ...item,
      ...(includeShareImage || item.analysis
        ? { shareStatus: "failed", shareError: "原图没有保存在本地，请重新上传后生成分享图", shareStartedAt: null }
        : { analysisStatus: "failed", analysisError: "原图没有保存在本地，请重新上传后估算", analysisStartedAt: null })
    }));
    toast(includeShareImage || photo.analysis ? "原图没有保存在本地，请重新上传后生成分享图" : "原图没有保存在本地，请重新上传后估算");
    return;
  }

  const processingStartedAt = new Date().toISOString();
  const loadingPatch = includeShareImage
    ? {
        analysisStatus: photo.analysis ? photo.analysisStatus : "loading",
        analysisError: "",
        analysisStartedAt: photo.analysis ? photo.analysisStartedAt : processingStartedAt,
        shareStatus: "loading",
        shareError: "",
        shareStartedAt: processingStartedAt
      }
    : { analysisStatus: "loading", analysisError: "", analysisStartedAt: processingStartedAt };
  updateMealPhoto(dateKey, photoId, (item) => ({ ...item, ...loadingPatch }));
  if (!includeShareImage || !photo.analysis) {
    schedulePhotoProcessingFallback(dateKey, photoId, "analysisStatus", "analysisStartedAt", processingStartedAt);
  }
  if (includeShareImage) {
    schedulePhotoProcessingFallback(dateKey, photoId, "shareStatus", "shareStartedAt", processingStartedAt);
  }

  try {
    const targets = planFoodTargets(plan);
    const targetKeys = photo.targetKeys?.length ? photo.targetKeys : targets.map((target) => target.key);
    const targetNames = targetKeys.map((key) => photoTargetName(key, targets)).filter(Boolean);
    const response = await fetch("/api/analyze-meal-photo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image: photo.image,
        targetNames,
        includeShareImage,
        analysis: includeShareImage ? photo.analysis : null
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "热量估算失败");
    const shareImage = payload.shareImage ? await compressImageDataUrl(payload.shareImage, SHARE_IMAGE_OPTIONS) : "";

    updateMealPhoto(dateKey, photoId, (item) => ({
      ...item,
      analysis: payload.analysis,
      analysisStatus: "done",
      analysisError: "",
      analysisStartedAt: null,
      ...(includeShareImage
        ? {
            shareImage: shareImage || item.shareImage,
            shareStatus: shareImage ? "done" : "idle",
            shareError: "",
            shareStartedAt: null,
            shareCreatedAt: shareImage ? new Date().toISOString() : item.shareCreatedAt
          }
        : {})
    }));
    if (!options.quiet) toast(includeShareImage ? "手绘分享图已生成" : "热量估算完成");

    if (autoShare) {
      const latestPlan = state.plans[dateKey] ? normalizePlan(state.plans[dateKey]) : null;
      const latestPhoto = planPhotos(latestPlan).find((item) => item.id === photoId);
      if (latestPhoto?.analysis && latestPhoto.shareStatus !== "done") {
        await analyzeMealPhoto(photoId, { dateKey, includeShareImage: true, quiet: true });
      }
    }
  } catch (error) {
    updateMealPhoto(dateKey, photoId, (item) => ({
      ...item,
      ...(includeShareImage
        ? { shareStatus: "failed", shareError: error.message || "分享图生成失败", shareStartedAt: null }
        : { analysisStatus: "failed", analysisError: error.message || "热量估算失败", analysisStartedAt: null })
    }));
    toast(error.message || (includeShareImage ? "分享图生成失败" : "热量估算失败"));
  }
}

function generateMealShare(photoId) {
  const plan = state.plans[selectedDateKey()] ? normalizePlan(state.plans[selectedDateKey()]) : null;
  const photo = planPhotos(plan).find((item) => item.id === photoId);
  if (photo?.analysis) {
    analyzeMealPhoto(photoId, { includeShareImage: true });
  } else {
    analyzeMealPhoto(photoId, { autoShare: true });
  }
}

function updateMealPhoto(dateKey, photoId, updater) {
  const plan = state.plans[dateKey] ? normalizePlan(state.plans[dateKey]) : null;
  if (!plan) return;
  const photos = planPhotos(plan);
  let changed = false;
  plan.afterPhotos = photos.map((photo) => {
    if (photo.id !== photoId) return photo;
    changed = true;
    return normalizeMealPhoto(updater(photo)) || photo;
  });
  if (!changed) return;
  state.plans[dateKey] = plan;
  saveState();
  render();
}

function removeMealPhoto(photoId) {
  const plan = ensureTodayPlan();
  if (!canUploadMealPhotos(plan)) {
    toast("只有今天的老婆端可以删除照片");
    return;
  }
  const before = planPhotos(plan);
  plan.afterPhotos = before.filter((photo) => photo.id !== photoId);
  saveState();
  render();
  toast("照片已删除");
}

function markNotificationRead() {
  const plan = ensureTodayPlan();
  plan.notificationUnread = false;
  saveState();
  render();
}

function setView(view) {
  ui.view = view === "husband" ? "husband" : "wife";
  const nextHash = `#${ui.view}`;
  if (location.hash !== nextHash) location.hash = nextHash;
  render();
}

function setFeaturedDish(index) {
  ui.featuredDishIndex = Math.max(0, Number(index) || 0);
  render();
}

function shiftFeaturedDish(shift) {
  const dishes = filteredDishes();
  if (!dishes.length) return;
  const current = normalizeFeaturedDishIndex(dishes.length);
  ui.featuredDishIndex = ((current + shift) % dishes.length + dishes.length) % dishes.length;
  render();
}

function setSelectedDate(key) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return;
  ui.dateKey = key;
  ensureTodayPlan();
  render();
}

function shiftSelectedDate(days) {
  const date = dateFromKey(selectedDateKey());
  date.setDate(date.getDate() + days);
  setSelectedDate(dateKeyFromDate(date));
}

function focusMeal(meal) {
  const plan = ensureTodayPlan();
  ui.view = "wife";
  ui.meal = meal;
  ui.featuredDishIndex = 0;
  if (isEditableDate() && plan.skipped[meal]) {
    plan.skipped[meal] = false;
    markPlanDraft(plan);
    saveState();
  }
  render();
  requestAnimationFrame(() => {
    document.querySelector(".control-strip")?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  });
}

function setFeedback(dishId, value) {
  if (state.feedback[dishId] === value) {
    delete state.feedback[dishId];
  } else {
    state.feedback[dishId] = value;
  }
  saveState();
  render();
}

function toggleBought(key) {
  const day = selectedDateKey();
  if (!state.checkedItems[day]) state.checkedItems[day] = {};
  state.checkedItems[day][key] = !state.checkedItems[day][key];
  saveState();
  render();
}

function isShoppingGroupCollapsed(group, day = selectedDateKey()) {
  return Boolean(state.shoppingGroupCollapsed?.[day]?.[group]);
}

function toggleShoppingGroup(group) {
  const day = selectedDateKey();
  if (!state.shoppingGroupCollapsed) state.shoppingGroupCollapsed = {};
  if (!state.shoppingGroupCollapsed[day]) state.shoppingGroupCollapsed[day] = {};
  state.shoppingGroupCollapsed[day][group] = !state.shoppingGroupCollapsed[day][group];
  saveState();
  render();
}

async function copyShoppingList() {
  const plan = ensureTodayPlan();
  const shopping = canViewOrder(plan)
    ? aggregateShoppingList(plan).filter((item) => !isShoppingGroupCollapsed(item.group))
    : [];
  if (!shopping.length) {
    toast("采购清单还是空的");
    return;
  }
  const lines = shopping.map((item) => {
    const amount = formatShoppingAmount(item);
    return `${item.name} ${amount}`;
  });
  const text = [`${dayLabel()}采购清单`, ...lines].join("\n");
  try {
    await navigator.clipboard.writeText(text);
    toast("采购清单已复制");
  } catch {
    toast("浏览器不支持自动复制");
  }
}

async function handleFormSubmit(event) {
  event.preventDefault();
  const form = event.target;
  const data = new FormData(form);
  const editingDishId = form.dataset.editDish || "";
  const existingDish = editingDishId ? getDish(editingDishId) : null;
  const name = String(data.get("name") || "").trim();
  const selectedMeals = data.getAll("meals");
  const ingredients = parseIngredients(String(data.get("ingredients") || ""));
  const stepTexts = String(data.get("steps") || "")
    .split("\n")
    .map((step) => step.trim())
    .filter(Boolean);
  const storedStepDetails = parseStepDetails(data.get("stepDetails"));
  const previousStepDetails = storedStepDetails.length ? storedStepDetails : dishStepItems(existingDish, false);
  const steps = mergeStepTextsWithDetails(stepTexts, previousStepDetails);
  const sourceUrl = String(data.get("sourceUrl") || "").trim();
  const importedImageUrl = String(data.get("imageUrl") || "").trim();

  if (!name || !selectedMeals.length || !ingredients.length) {
    toast("菜名、餐次和食材都要填");
    return;
  }

  const imageFile = data.get("imageFile");
  const imageDataUrl =
    imageFile instanceof File && imageFile.size ? await compressImageFile(imageFile, DEFAULT_IMAGE_OPTIONS) : "";

  const dish = {
    id: existingDish?.id || `dish-${Date.now()}`,
    name,
    category: String(data.get("category") || "快手菜"),
    meals: selectedMeals,
    time: Math.max(5, Number(data.get("time")) || 20),
    difficulty: existingDish?.difficulty || "自家菜",
    rating: existingDish?.rating || 4,
    image: imageDataUrl || importedImageUrl || existingDish?.image || "",
    ingredients,
    steps,
    sourceUrl,
    note: String(data.get("note") || "").trim() || (existingDish ? "" : "新加入的家常菜。")
  };

  if (existingDish) {
    state.dishes = state.dishes.map((item) => (item.id === existingDish.id ? { ...existingDish, ...dish } : item));
  } else {
    state.dishes = [dish, ...state.dishes];
  }
  saveState();
  ui.category = "全部";
  ui.search = "";
  ui.menuMode = "browse";
  ui.editingDishId = null;
  ui.menuCategory = "全部";
  ui.menuSearch = "";
  form.reset();
  render();
  toast(existingDish ? `已更新：${name}` : `已加入：${name}`);
}

async function importRecipeFromLink(button) {
  const form = button.closest("form");
  if (!form) return;
  const sourceInput = form.elements.sourceUrl;
  const sourceUrl = String(sourceInput?.value || "").trim();
  if (!sourceUrl) {
    toast("先粘贴下厨房链接");
    sourceInput?.focus();
    return;
  }

  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "导入中";

  try {
    const response = await fetch("/api/import-recipe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: sourceUrl })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "导入失败");

    applyImportedRecipe(form, payload.recipe || {});
    toast("已填好，确认后保存");
  } catch (error) {
    toast(error.message || "导入失败");
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

function applyImportedRecipe(form, recipe) {
  const ingredientLines = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
  const stepItems = dishStepItems(recipe, false);
  const stepLines = stepItems.map((step) => step.text).filter(Boolean);

  if (recipe.name) form.elements.name.value = recipe.name;
  if (recipe.sourceUrl) form.elements.sourceUrl.value = recipe.sourceUrl;
  if (recipe.time) form.elements.time.value = Math.max(5, Number(recipe.time) || 20);
  if (ingredientLines.length) form.elements.ingredients.value = ingredientLines.join("\n");
  if (stepLines.length) form.elements.steps.value = stepLines.join("\n");
  const stepDetailsField = form.querySelector("[data-role='imported-steps']");
  if (stepDetailsField) stepDetailsField.value = serializeStepDetails(stepItems);
  renderImportStepPreviewIntoForm(form, stepItems);
  if (recipe.note) form.elements.note.value = recipe.note;
  if (recipe.image) {
    form.querySelector("[data-role='imported-image']").value = recipe.image;
    renderImportCoverPreview(form, recipe.image);
  }

  const category = guessDishCategory(recipe.name, ingredientLines);
  if ([...form.elements.category.options].some((option) => option.value === category)) {
    form.elements.category.value = category;
  }
}

function renderImportStepPreviewIntoForm(form, steps) {
  const preview = form.querySelector("[data-role='import-step-preview']");
  if (!preview) return;
  const html = renderImportStepPreview(steps);
  preview.hidden = !html;
  preview.innerHTML = html;
}

function renderImportStepPreview(steps = []) {
  const imageSteps = steps.filter((step) => stepImageSrc(step)).slice(0, 4);
  if (!imageSteps.length) return "";
  return `
    <div>
      <strong>步骤图预览</strong>
      <span>查看详情时会展示步骤图；外层菜单只显示文字。</span>
    </div>
    <div class="import-step-grid">
      ${imageSteps
        .map(
          (step, index) => `
            <figure>
              <img src="${escapeAttr(stepImageSrc(step))}" alt="步骤 ${index + 1}" loading="lazy" />
              ${step.text ? `<figcaption>${escapeHtml(step.text)}</figcaption>` : ""}
            </figure>
          `
        )
        .join("")}
    </div>
  `;
}

function renderImportCoverPreview(form, imageSrc) {
  const preview = form.querySelector("[data-role='import-cover-preview']");
  if (!preview || !imageSrc) return;
  preview.hidden = false;
  preview.innerHTML = `
    <img src="${escapeAttr(imageSrc)}" alt="自动导入的菜谱封面" />
    <div>
      <strong>已自动抓取封面</strong>
      <span>保存后会作为这道菜的图片。</span>
    </div>
  `;
}

function guessDishCategory(name = "", ingredientLines = []) {
  const text = [name, ...ingredientLines].join(" ");
  if (/粥|汤|羹|煲/.test(text)) return "汤粥";
  if (/面|饭|粉|饼|馄饨|饺|包子|馒头/.test(text)) return "主食";
  if (/鸡|鸭|牛|羊|猪|排骨|肉|虾|鱼|翅/.test(text)) return "肉菜";
  if (/蛋|奶|吐司|早餐/.test(text)) return "早餐";
  if (/菜|瓜|豆|茄|菇|笋|藕|花|萝卜|土豆|番茄/.test(text)) return "蔬菜";
  return "快手菜";
}

async function handleCoverUpload(event) {
  const input = event.target;
  const dishId = input.dataset.dish;
  const file = input.files?.[0];
  if (!dishId || !file) return;

  try {
    const image = await compressImageFile(file, DEFAULT_IMAGE_OPTIONS);
    state.dishes = state.dishes.map((dish) => (dish.id === dishId ? { ...dish, image } : dish));
    saveState();
    render();
    toast("封面已更新");
  } catch (error) {
    toast(error.message || "图片处理失败");
  }
}

function compressImageFile(file, options = {}) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("请选择图片文件"));
      return;
    }

    if (file.size > 12 * 1024 * 1024) {
      reject(new Error("图片不能超过 12MB"));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error("图片读取失败"));
    reader.onload = () => compressImageDataUrl(String(reader.result || ""), options).then(resolve, reject);
    reader.readAsDataURL(file);
  });
}

function compressImageDataUrl(dataUrl, options = {}) {
  return new Promise((resolve, reject) => {
    const source = String(dataUrl || "");
    if (!source.startsWith("data:image/")) {
      reject(new Error("图片格式不正确"));
      return;
    }

    const image = new Image();
    image.onerror = () => reject(new Error("图片解析失败"));
    image.onload = () => {
      const maxSide = options.maxSide || DEFAULT_IMAGE_OPTIONS.maxSide;
      const quality = options.quality || DEFAULT_IMAGE_OPTIONS.quality;
      const ratio = Math.min(1, maxSide / Math.max(image.width, image.height));
      const width = Math.max(1, Math.round(image.width * ratio));
      const height = Math.max(1, Math.round(image.height * ratio));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      context.fillStyle = "#fff";
      context.fillRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    image.src = source;
  });
}

function parseIngredients(text) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseIngredientLine);
}

function parseIngredientLine(line) {
  const match = line.match(/^(.+?)\s+(\d+(?:\.\d+)?)\s*([^\d\s]+)?$/);
  if (match) {
    const [, name, amount, unit = ""] = match;
    const normalizedName = canonicalIngredientName(name.trim());
    return {
      name: normalizedName,
      amount: Number(amount),
      unit: normalizeShoppingUnit(unit),
      group: guessGroup(normalizedName)
    };
  }

  const loose = parseLooseIngredient(line);
  const normalizedName = canonicalIngredientName(loose.name || line);
  return {
    name: normalizedName,
    amount: loose.amount,
    unit: loose.unit,
    amountText: loose.amountText,
    group: guessGroup(normalizedName || line)
  };
}

function guessGroup(name) {
  const rules = [
    ["肉蛋", ["鸡", "牛", "猪", "排骨", "肉", "蛋", "虾", "鱼"]],
    ["蔬菜", ["葱", "蒜", "姜", "菜", "番茄", "土豆", "萝卜", "青椒", "洋葱", "南瓜", "玉米"]],
    ["主食", ["米", "面", "粉", "粥", "饼"]],
    ["调味", ["盐", "酱", "醋", "油", "糖", "蚝油", "生抽", "料酒"]]
  ];
  const found = rules.find(([, keywords]) => keywords.some((keyword) => name.includes(keyword)));
  return found ? found[0] : "其他";
}

function escapeAttr(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeSvg(value) {
  return escapeHtml(value).replaceAll('"', "&quot;");
}

function toast(message) {
  const existing = document.querySelector(".toast");
  if (existing) existing.remove();
  const node = document.createElement("div");
  node.className = "toast";
  node.textContent = message;
  document.body.appendChild(node);
  setTimeout(() => node.remove(), 1800);
}

let carouselSwipeStart = null;

app.addEventListener("pointerdown", (event) => {
  if (!event.target.closest("[data-role='dish-carousel']")) return;
  carouselSwipeStart = { x: event.clientX, y: event.clientY };
});

app.addEventListener("pointerup", (event) => {
  if (!carouselSwipeStart) return;
  const dx = event.clientX - carouselSwipeStart.x;
  const dy = event.clientY - carouselSwipeStart.y;
  carouselSwipeStart = null;
  if (Math.abs(dx) < 54 || Math.abs(dx) < Math.abs(dy) * 1.25) return;
  shiftFeaturedDish(dx < 0 ? 1 : -1);
});

app.addEventListener("click", (event) => {
  if (event.target.matches("[data-role='detail-backdrop']")) {
    ui.detailDishId = null;
    render();
    return;
  }
  if (event.target.matches("[data-role='menu-drawer-backdrop']")) {
    ui.menuDrawerOpen = false;
    render();
    return;
  }

  const actionTarget = event.target.closest("[data-action]");
  if (!actionTarget) return;
  const action = actionTarget.dataset.action;

  if (action === "set-view") setView(actionTarget.dataset.view);
  if (action === "shift-date") shiftSelectedDate(Number(actionTarget.dataset.days) || 0);
  if (action === "go-today") setSelectedDate(todayKey());

  if (action === "set-meal") {
    ui.meal = actionTarget.dataset.meal;
    ui.featuredDishIndex = 0;
    render();
  }
  if (action === "focus-meal") focusMeal(actionTarget.dataset.meal);

  if (action === "set-category") {
    ui.category = actionTarget.dataset.category;
    ui.featuredDishIndex = 0;
    render();
  }

  if (action === "set-featured-dish") setFeaturedDish(actionTarget.dataset.index);
  if (action === "shift-featured-dish") shiftFeaturedDish(Number(actionTarget.dataset.shift) || 0);

  if (action === "add-dish") addDishToMeal(actionTarget.dataset.dish);
  if (action === "remove-dish") removeDishFromMeal(actionTarget.dataset.dish, actionTarget.dataset.meal);
  if (action === "remove-wish") removeWish(actionTarget.dataset.wish);
  if (action === "refresh-wish") refreshWish(actionTarget.dataset.wish);
  if (action === "decline-wish") declineWish(actionTarget.dataset.wish);
  if (action === "accept-wish") acceptWish(actionTarget.dataset.wish);
  if (action === "edit-dish") editDish(actionTarget.dataset.dish);
  if (action === "remove-menu-dish") removeDishFromMenu(actionTarget.dataset.dish);
  if (action === "random") randomDish();
  if (action === "clear-today") clearToday();
  if (action === "feedback") setFeedback(actionTarget.dataset.dish, actionTarget.dataset.value);
  if (action === "toggle-bought") toggleBought(actionTarget.dataset.key);
  if (action === "toggle-shopping-group") toggleShoppingGroup(actionTarget.dataset.group);
  if (action === "remove-meal-photo") removeMealPhoto(actionTarget.dataset.photo);
  if (action === "analyze-meal-photo") analyzeMealPhoto(actionTarget.dataset.photo);
  if (action === "generate-meal-share") generateMealShare(actionTarget.dataset.photo);
  if (action === "copy-list") copyShoppingList();
  if (action === "import-recipe-link") importRecipeFromLink(actionTarget);
  if (action === "toggle-skip") toggleMealSkip(actionTarget.dataset.meal);
  if (action === "submit-order") submitOrder();
  if (action === "mark-notification-read") markNotificationRead();
  if (action === "view-detail") {
    ui.detailDishId = actionTarget.dataset.dish;
    render();
  }
  if (action === "close-detail") {
    ui.detailDishId = null;
    render();
  }
  if (action === "open-menu-drawer") {
    ui.menuDrawerOpen = true;
    ui.menuMode = "browse";
    ui.editingDishId = null;
    render();
  }
  if (action === "close-menu-drawer") {
    ui.menuDrawerOpen = false;
    ui.editingDishId = null;
    render();
  }
  if (action === "set-menu-mode") {
    ui.menuMode = actionTarget.dataset.mode === "form" ? "form" : "browse";
    ui.editingDishId = null;
    render();
  }
  if (action === "set-menu-category") {
    ui.menuCategory = actionTarget.dataset.category || "全部";
    render();
  }
  if (action === "leave-household") leaveHousehold();
});

app.addEventListener("input", (event) => {
  if (event.target.matches("[data-role='search']")) {
    ui.search = event.target.value;
    ui.featuredDishIndex = 0;
    render();
  }
  if (event.target.matches("[data-role='date-picker']")) {
    setSelectedDate(event.target.value);
  }
  if (event.target.matches("[data-role='menu-search']")) {
    ui.menuSearch = event.target.value;
    render();
  }
});

app.addEventListener("submit", (event) => {
  if (event.target.matches("[data-role='wish-form']")) {
    submitWish(event).catch((error) => toast(error.message || "许愿失败"));
  }
  if (event.target.matches("[data-role='dish-form']")) {
    handleFormSubmit(event).catch((error) => toast(error.message || "保存失败"));
  }
  if (event.target.matches("[data-role='household-form']")) {
    event.preventDefault();
    const data = new FormData(event.target);
    joinHousehold(String(data.get("householdCode") || ""));
  }
});

app.addEventListener("change", (event) => {
  if (event.target.matches("[data-role='cover-upload']")) {
    handleCoverUpload(event);
  }
  if (event.target.matches("[data-role='meal-photo-upload']")) {
    handleMealPhotoUpload(event);
  }
});

window.addEventListener("hashchange", () => {
  ui.view = getInitialView();
  render();
});

window.addEventListener("storage", () => {
  state = loadState();
  render();
});

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("./service-worker.js");
}

render();
startOnlineSession();

async function startOnlineSession() {
  if (!online.enabled || !online.householdId) return;
  online.loading = true;
  online.status = `正在同步：${online.householdCode}`;
  render();
  try {
    await loadRemoteState({ seedIfEmpty: true });
    startRemotePolling();
    online.status = `在线同步：${online.householdCode}`;
  } catch (error) {
    online.error = error.message || "同步失败";
    online.status = "同步失败";
  } finally {
    online.loading = false;
    render();
  }
}

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && online.enabled && online.householdId) {
    loadRemoteState().then(render).catch(() => {});
  }
});
