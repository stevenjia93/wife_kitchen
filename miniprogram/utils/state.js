const STORAGE_KEY = "wife-kitchen-mini-state-v1";
const HOUSEHOLD_KEY = "wife-kitchen-mini-household-v1";

const mealOrder = ["breakfast", "lunch", "dinner"];
const mealLabels = {
  breakfast: "早餐",
  lunch: "午餐",
  dinner: "晚餐"
};
const categories = ["全部", "快手菜", "肉菜", "蔬菜", "汤粥", "早餐", "主食"];
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
  ["芝麻油", ["芝麻油", "香油"]],
  ["食用油", ["食用油", "植物油", "菜籽油", "花生油", "玉米油", "油"]],
  ["盐", ["食盐", "海盐", "盐"]],
  ["白糖", ["白糖", "砂糖", "细砂糖"]],
  ["醋", ["米醋", "陈醋", "香醋", "白醋", "醋"]],
  ["淀粉", ["玉米淀粉", "土豆淀粉", "淀粉"]],
  ["胡椒粉", ["白胡椒粉", "黑胡椒粉", "胡椒粉"]]
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

const starterDishById = starterDishes.reduce((map, dish) => {
  map[dish.id] = dish;
  return map;
}, {});

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

function dayLabel(key) {
  const date = dateFromKey(key);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
  return `${month}月${day}日星期${weekdays[date.getDay()]}`;
}

function dateMode(key) {
  const today = todayKey();
  if (key < today) return "past";
  if (key > today) return "future";
  return "today";
}

function dateModeText(key) {
  const mode = dateMode(key);
  if (mode === "past") return "历史记录";
  if (mode === "future") return "预约点餐";
  return "今天";
}

function isEditableDate(key) {
  return dateMode(key) !== "past";
}

function emptyPlan() {
  return {
    breakfast: [],
    lunch: [],
    dinner: [],
    skipped: { breakfast: false, lunch: false, dinner: false },
    wishes: [],
    afterPhotos: [],
    submitted: false,
    submittedAt: null,
    notificationUnread: false
  };
}

function createDefaultState() {
  return {
    dishes: starterDishes,
    plans: { [todayKey()]: emptyPlan() },
    feedback: {},
    checkedItems: {},
    shoppingGroupCollapsed: {}
  };
}

function normalizeAppState(value) {
  const base = createDefaultState();
  const normalized = {
    ...base,
    ...(value || {}),
    dishes: Array.isArray(value && value.dishes) ? value.dishes.map(normalizeDish).filter(Boolean) : base.dishes,
    feedback: value && typeof value.feedback === "object" ? value.feedback : {},
    checkedItems: value && typeof value.checkedItems === "object" ? value.checkedItems : {},
    shoppingGroupCollapsed: value && typeof value.shoppingGroupCollapsed === "object" ? value.shoppingGroupCollapsed : {},
    plans: {
      ...base.plans,
      ...((value && value.plans) || {})
    }
  };
  Object.keys(normalized.plans).forEach((key) => {
    normalized.plans[key] = normalizePlan(normalized.plans[key]);
  });
  return normalized;
}

function normalizeDish(dish) {
  if (!dish || typeof dish !== "object") return null;
  const id = String(dish.id || "").trim();
  if (!id) return null;
  const base = starterDishById[id] || {};
  const image = String(dish.image || dish.imageUrl || base.image || "").trim();
  return {
    ...dish,
    id,
    image,
    imageUrl: String(dish.imageUrl || image || "").trim()
  };
}

function normalizePlan(plan) {
  const normalized = {
    ...emptyPlan(),
    ...(plan || {}),
    skipped: {
      ...emptyPlan().skipped,
      ...((plan && plan.skipped) || {})
    }
  };
  mealOrder.forEach((meal) => {
    normalized[meal] = Array.isArray(normalized[meal]) ? normalized[meal].map(String) : [];
    normalized.skipped[meal] = Boolean(normalized.skipped[meal]);
  });
  normalized.wishes = Array.isArray(normalized.wishes) ? normalized.wishes.map(normalizeWish).filter(Boolean) : [];
  normalized.afterPhotos = Array.isArray(normalized.afterPhotos)
    ? normalized.afterPhotos.map(normalizeMealPhoto).filter(Boolean)
    : [];
  normalized.submitted = Boolean(normalized.submitted);
  normalized.submittedAt = normalized.submittedAt || null;
  normalized.notificationUnread = Boolean(normalized.notificationUnread);
  return normalized;
}

function normalizeWish(wish) {
  const name = String((wish && wish.name) || "").trim();
  if (!name) return null;
  const meal = mealOrder.includes(wish.meal) ? wish.meal : "dinner";
  return {
    id: wish.id || `wish-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    meal,
    name,
    note: String(wish.note || "").trim(),
    status: wish.status || "searching",
    createdAt: wish.createdAt || new Date().toISOString()
  };
}

function normalizeMealPhoto(photo) {
  const image = String((photo && photo.image) || "").trim();
  const analysis = normalizeMealAnalysis(photo.analysis);
  const shareImage = String(photo.shareImage || "").trim();
  const localImagePath = String(photo.localImagePath || "").trim();
  const imageOmitted = Boolean(photo && photo.imageOmitted);
  const shareOmitted = Boolean(photo && photo.shareOmitted);
  if (!image && !shareImage && !localImagePath && !analysis && !imageOmitted && !shareOmitted) return null;
  return {
    id: photo.id || `photo-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    image,
    localImagePath,
    imageOmitted,
    targetKeys: Array.isArray(photo.targetKeys) ? photo.targetKeys.map(String) : [],
    createdAt: photo.createdAt || new Date().toISOString(),
    analysis,
    analysisStatus: photo.analysisStatus || (analysis ? "done" : "idle"),
    analysisError: String(photo.analysisError || "").trim(),
    shareImage,
    shareOmitted,
    shareStatus: photo.shareStatus || (shareImage ? "done" : "idle"),
    shareError: String(photo.shareError || "").trim(),
    shareStartedAt: photo.shareStartedAt || null,
    shareCreatedAt: photo.shareCreatedAt || null
  };
}

function normalizeMealAnalysis(value) {
  if (!value || typeof value !== "object") return null;
  const items = Array.isArray(value.items)
    ? value.items.map((item) => ({
        label: String(item.label || "食物").slice(0, 24),
        portion: String(item.portion || "可见份量").slice(0, 24),
        calorieReason: String(item.calorieReason || "按照片估算").slice(0, 32),
        calories: Math.max(0, Math.round(Number(item.calories) || 0)),
        confidence: ["low", "medium", "high"].includes(item.confidence) ? item.confidence : "medium",
        bbox: item.bbox || { x: 0, y: 0, width: 0, height: 0 }
      }))
    : [];
  const total = items.reduce((sum, item) => sum + item.calories, 0);
  return {
    totalCalories: Math.max(0, Math.round(Number(value.totalCalories) || total)),
    confidence: ["low", "medium", "high"].includes(value.confidence) ? value.confidence : "medium",
    notes: String(value.notes || "根据照片做粗略估算，实际热量会受份量和做法影响。").slice(0, 120),
    items
  };
}

function ensurePlan(state, dateKey) {
  if (!state.plans[dateKey]) state.plans[dateKey] = emptyPlan();
  state.plans[dateKey] = normalizePlan(state.plans[dateKey]);
  if (!state.checkedItems[dateKey]) state.checkedItems[dateKey] = {};
  return state.plans[dateKey];
}

function activeDishes(state) {
  return (state.dishes || []).filter((dish) => !dish.archived);
}

function getDish(state, id) {
  return activeDishes(state).find((dish) => dish.id === id);
}

function allSelectedIds(plan) {
  return mealOrder.reduce((ids, meal) => ids.concat(plan[meal] || []), []);
}

function wishesForMeal(plan, meal) {
  return (plan.wishes || []).filter((wish) => wish.meal === meal);
}

function selectedDishCount(plan) {
  return allSelectedIds(plan).length;
}

function wishCount(plan) {
  return (plan.wishes || []).length;
}

function mealItemCount(plan, meal) {
  return (plan[meal] || []).length + wishesForMeal(plan, meal).length;
}

function mealResolved(plan, meal) {
  return plan.skipped[meal] || (plan[meal] || []).length > 0 || wishesForMeal(plan, meal).length > 0;
}

function unresolvedMeals(plan) {
  return mealOrder.filter((meal) => !mealResolved(plan, meal));
}

function hasPlanActivity(plan) {
  return selectedDishCount(plan) > 0 || wishCount(plan) > 0 || mealOrder.some((meal) => plan.skipped[meal]);
}

function canViewOrder(plan, key) {
  return plan.submitted || (dateMode(key) === "past" && hasPlanActivity(plan));
}

function canUploadMealPhotos(state, plan, key) {
  return key === todayKey() && canViewOrder(plan, key) && planFoodTargets(state, plan).length > 0;
}

function planFoodTargets(state, plan) {
  const targets = [];
  mealOrder.forEach((meal) => {
    (plan[meal] || []).forEach((id) => {
      const dish = getDish(state, id);
      if (dish) targets.push({ key: `dish:${dish.id}`, type: "dish", meal, id: dish.id, name: dish.name });
    });
    wishesForMeal(plan, meal).forEach((wish) => {
      targets.push({ key: `wish:${wish.id}`, type: "wish", meal, id: wish.id, name: wish.name });
    });
  });
  return targets;
}

function photoTargetName(key, targets) {
  if (!key) return "整桌合照";
  const target = targets.find((item) => item.key === key);
  return target ? target.name : "整桌合照";
}

function aggregateShoppingList(state, plan) {
  const map = {};
  allSelectedIds(plan).forEach((id) => {
    const dish = getDish(state, id);
    if (!dish) return;
    (dish.ingredients || []).forEach((item) => {
      const normalized = normalizeShoppingIngredient(item);
      const key = `${normalized.group}|${normalized.keyName}`;
      const current =
        map[key] ||
        {
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
      map[key] = current;
    });
  });
  return Object.values(map).sort((a, b) => {
    const groupDiff = shoppingGroupSortValue(a.group) - shoppingGroupSortValue(b.group);
    return groupDiff || a.name.localeCompare(b.name, "zh-CN");
  });
}

function groupedShoppingList(shopping) {
  const groups = {};
  shopping.forEach((item) => {
    if (!groups[item.group]) groups[item.group] = [];
    groups[item.group].push(item);
  });
  return Object.keys(groups)
    .sort((a, b) => shoppingGroupSortValue(a) - shoppingGroupSortValue(b))
    .map((group) => ({ group, items: groups[group] }));
}

function normalizeShoppingIngredient(item) {
  const name = canonicalIngredientName(String(item.name || "").trim());
  const amount = typeof item.amount === "number" && Number.isFinite(item.amount) ? item.amount : null;
  const unit = normalizeShoppingUnit(item.unit || "");
  const group = item.group && item.group !== "其他" ? item.group : guessGroup(name || item.group || "其他");
  return {
    name: name || String(item.name || "食材"),
    keyName: canonicalIngredientName(name || item.name || "食材").toLowerCase(),
    amount,
    amountText: item.amountText || "",
    unit,
    group
  };
}

function canonicalIngredientName(value) {
  const compact = String(value || "").replace(/\s+/g, "").replace(/^[·•\-—]+/, "").trim();
  if (!compact) return "";
  for (const pair of ingredientAliases) {
    if (pair[1].some((alias) => compact.includes(alias))) return pair[0];
  }
  return compact.replace(/^(一点|少许|适量|适当|若干)/, "");
}

function normalizeShoppingUnit(value) {
  const unit = String(value || "").trim();
  return unitAliases[unit] || unit;
}

function guessGroup(name) {
  const rules = [
    ["肉蛋", ["鸡", "牛", "猪", "排骨", "肉", "蛋", "虾", "鱼"]],
    ["蔬菜", ["葱", "蒜", "姜", "菜", "番茄", "土豆", "萝卜", "青椒", "洋葱", "南瓜", "玉米"]],
    ["主食", ["米", "面", "粉", "粥", "饼"]],
    ["调味", ["盐", "酱", "醋", "油", "糖", "蚝油", "生抽", "料酒"]]
  ];
  const found = rules.find((pair) => pair[1].some((keyword) => String(name || "").includes(keyword)));
  return found ? found[0] : "其他";
}

function shoppingGroupSortValue(group) {
  const index = shoppingGroupOrder.indexOf(group);
  return index === -1 ? shoppingGroupOrder.length : index;
}

function formatShoppingAmount(item) {
  const numericParts = Object.keys(item.amounts || {})
    .filter((unit) => item.amounts[unit])
    .map((unit) => `${niceNumber(item.amounts[unit])}${unit}`);
  const looseParts = Array.from(new Set(item.looseAmounts || [])).filter(Boolean);
  return numericParts.concat(looseParts).slice(0, 3).join(" + ") || "按需";
}

function niceNumber(value) {
  if (!Number.isFinite(value)) return "";
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(1)));
}

function formatIngredient(item) {
  if (item.amountText) return `${item.amountText}${item.name}`;
  if (item.amount === null || item.amount === undefined || item.amount === "") return item.name;
  return `${item.name} ${item.amount}${item.unit || ""}`;
}

function formatTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function confidenceText(value) {
  if (value === "high") return "较可信";
  if (value === "low") return "仅参考";
  return "中等可信";
}

module.exports = {
  STORAGE_KEY,
  HOUSEHOLD_KEY,
  mealOrder,
  mealLabels,
  categories,
  todayKey,
  dateKeyFromDate,
  dateFromKey,
  dayLabel,
  dateMode,
  dateModeText,
  isEditableDate,
  emptyPlan,
  createDefaultState,
  normalizeAppState,
  normalizePlan,
  normalizeMealPhoto,
  normalizeMealAnalysis,
  ensurePlan,
  activeDishes,
  getDish,
  allSelectedIds,
  wishesForMeal,
  selectedDishCount,
  wishCount,
  mealItemCount,
  unresolvedMeals,
  hasPlanActivity,
  canViewOrder,
  canUploadMealPhotos,
  planFoodTargets,
  photoTargetName,
  aggregateShoppingList,
  groupedShoppingList,
  guessGroup,
  formatShoppingAmount,
  formatIngredient,
  formatTime,
  confidenceText
};
