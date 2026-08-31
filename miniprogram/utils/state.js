const STORAGE_KEY = "wife-kitchen-mini-state-v1";
const HOUSEHOLD_KEY = "wife-kitchen-mini-household-v1";
const MAX_HOUSEHOLD_COVER_CHARS = 1_200_000;

const mealOrder = ["breakfast", "lunch", "dinner"];
const mealLabels = {
  breakfast: "早餐",
  lunch: "午餐",
  dinner: "晚餐"
};
const mealCutoffMinutes = {
  breakfast: 10 * 60 + 30,
  lunch: 15 * 60,
  dinner: 22 * 60 + 30
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
    name: "西红柿炒鸡蛋",
    category: "快手菜",
    meals: ["lunch", "dinner"],
    time: 15,
    difficulty: "轻松",
    rating: 5,
    image: "https://i2.chuimg.com/cbf28b18d47a4c378ad7c702dc9da6f8_1280w_956h.jpg?imageView2/1/w/800/h/600/q/75/format/jpg",
    sourceUrl: "https://www.xiachufang.com/recipe/106488658/",
    guideSource: "source",
    ingredients: [
      { name: "西红柿", amount: 2, unit: "个", group: "蔬菜" },
      { name: "鸡蛋", amount: 3, unit: "个", group: "蛋奶" },
      { name: "小葱", amount: 1, unit: "根", group: "蔬菜" },
      { name: "蒜", amount: 1, unit: "瓣", group: "蔬菜" },
      { name: "盐", amount: null, unit: "", amountText: "适量", group: "调味" },
      { name: "糖", amount: null, unit: "", amountText: "适量", group: "调味" }
    ],
    stepDetails: [
      { text: "准备好所需材料。", imageUrl: "https://i2.chuimg.com/db7f32e056764ea9af7b1a0a94162b7f_1280w_959h.jpg?imageView2/2/w/800/interlace/1/q/75" },
      { text: "在西红柿顶部划两刀，放入开水中烫一分钟便可去皮。", imageUrl: "https://i2.chuimg.com/5f472a67c1c1476d8f044825af15625b_1280w_959h.jpg?imageView2/2/w/800/interlace/1/q/75" },
      { text: "切成滚刀块。", imageUrl: "https://i2.chuimg.com/4e844db392b04a3e98dc112be187a807_1280w_960h.jpg?imageView2/2/w/800/interlace/1/q/75" },
      { text: "准备好葱花和蒜末。", imageUrl: "https://i2.chuimg.com/66cc58570bc84c2fad626d919f005dfd_1280w_960h.jpg?imageView2/2/w/800/interlace/1/q/75" },
      { text: "鸡蛋磕入碗中，加少许盐，打散。", imageUrl: "https://i2.chuimg.com/e4668f47c0a240b499788ca3fed485a6_1280w_960h.jpg?imageView2/2/w/800/interlace/1/q/75" },
      { text: "锅烧热，倒油，油要适当多一些。", imageUrl: "https://i2.chuimg.com/96ca86bfeaa341988e3a6d4fffa10e9f_1280w_960h.jpg?imageView2/2/w/800/interlace/1/q/75" },
      { text: "油热后关小火，倒入蛋液；蛋液尚未完全凝固时关火，保持滑嫩。", imageUrl: "https://i2.chuimg.com/8f1ec0f2721d49c2bef4ad4b99b8495d_1280w_959h.jpg?imageView2/2/w/800/interlace/1/q/75" },
      { text: "用筷子把鸡蛋划散。", imageUrl: "https://i2.chuimg.com/dbe261c5c693497096d02dda681cb3d6_1280w_959h.jpg?imageView2/2/w/800/interlace/1/q/75" },
      { text: "鸡蛋炒好后盛出，避免继续受热变老。", imageUrl: "https://i2.chuimg.com/587bf4fc00bd474ca9f374cef9ec2a85_1280w_960h.jpg?imageView2/2/w/800/interlace/1/q/75" },
      { text: "倒入少许底油，关小火爆香蒜末。", imageUrl: "https://i2.chuimg.com/4ecea43399f4402cbdac6951c8216c03_1280w_960h.jpg?imageView2/2/w/800/interlace/1/q/75" },
      { text: "倒入西红柿块，用中火翻炒出汤汁。", imageUrl: "https://i2.chuimg.com/5ac7a28fe942453b901c5cb0c24258cb_1280w_960h.jpg?imageView2/2/w/800/interlace/1/q/75" },
      { text: "炒出汤汁后，加入适量盐和白糖调味。", imageUrl: "https://i2.chuimg.com/502aa41d7ceb4023880ce96c921727dd_1280w_960h.jpg?imageView2/2/w/800/interlace/1/q/75" },
      { text: "倒回鸡蛋，快速翻炒均匀。", imageUrl: "https://i2.chuimg.com/d025185f892240c5a7665640e5109506_1280w_960h.jpg?imageView2/2/w/800/interlace/1/q/75" },
      { text: "若汁水过多，可以勾少量芡汁。", imageUrl: "https://i2.chuimg.com/324f092359144825a4ea85505a4225d7_1280w_959h.jpg?imageView2/2/w/800/interlace/1/q/75" },
      { text: "出锅装盘，撒上葱花点缀。", imageUrl: "https://i2.chuimg.com/c791bdc1b6974f95a03484da8a953e5b_1280w_959h.jpg?imageView2/2/w/800/interlace/1/q/75" },
      { text: "趁热享用。", imageUrl: "https://i2.chuimg.com/374d32860b23458db9ec80deb910ffe6_1280w_959h.jpg?imageView2/2/w/800/interlace/1/q/75" }
    ],
    note: "嫩滑多汁的经典家常菜。"
  },
  {
    id: "kung-pao-chicken",
    name: "宫保鸡丁",
    category: "肉菜",
    meals: ["lunch", "dinner"],
    time: 30,
    difficulty: "稳妥",
    rating: 5,
    image: "https://i2.chuimg.com/83eec955461c462883bec1c1ecdd7f50_1080w_1920h.jpg?imageView2/1/w/800/h/600/q/75/format/jpg",
    sourceUrl: "https://www.xiachufang.com/recipe/103709416/",
    guideSource: "source",
    ingredients: [
      { name: "鸡腿肉", amount: 1, unit: "个", group: "肉蛋" },
      { name: "熟花生米", amount: 60, unit: "克", group: "干货" },
      { name: "姜", amount: 15, unit: "克", group: "蔬菜" },
      { name: "蒜", amount: 15, unit: "克", group: "蔬菜" },
      { name: "干辣椒", amount: 10, unit: "克", group: "调味" },
      { name: "花椒", amount: 3, unit: "克", group: "调味" },
      { name: "大葱", amount: 0.5, unit: "根", group: "蔬菜" },
      { name: "生抽", amount: 20, unit: "克", group: "调味" },
      { name: "料酒", amount: 15, unit: "克", group: "调味" },
      { name: "醋", amount: 30, unit: "克", group: "调味" },
      { name: "糖", amount: 21, unit: "克", group: "调味" },
      { name: "淀粉", amount: 10, unit: "克", group: "调味" }
    ],
    stepDetails: [
      { text: "鸡腿去骨切小块，加入盐、糖、生抽、料酒、清水和淀粉抓匀，再倒少量油抓匀，常温腌制20分钟。", imageUrl: "https://i2.chuimg.com/1a041d55d96249af8222a4104823418c_1920w_1920h.jpg?imageView2/2/w/800/interlace/1/q/75" },
      { text: "锅中倒油，中火烧至六成热，放入花生米，转小火煸香后捞出。", imageUrl: "https://i2.chuimg.com/02a14b53e0fd4fa3ada7215ff059375d_1920w_1920h.jpg?imageView2/2/w/800/interlace/1/q/75" },
      { text: "中火烧热油锅，放入腌好的鸡丁快速炒散；炒至表面变色后立即盛出。", imageUrl: "https://i2.chuimg.com/afd1c3286798419da9a1610b1e949bf2_1920w_1920h.jpg?imageView2/2/w/800/interlace/1/q/75" },
      { text: "将醋、糖、盐、料酒、生抽、老抽和淀粉搅拌均匀，调成宫保汁。", imageUrl: "https://i2.chuimg.com/f6562fe90dfd4678ae16d89ba2a141a3_1920w_1920h.jpg?imageView2/2/w/800/interlace/1/q/75" },
      { text: "锅留底油，放姜片、蒜片、葱段、花椒和干辣椒煸香；加入鸡丁炒匀，倒入宫保汁，大火快速翻炒。", imageUrl: "https://i2.chuimg.com/dc6adbcee3644504a391cb42c5381408_1920w_1920h.jpg?imageView2/2/w/800/interlace/1/q/75" },
      { text: "最后放入花生米，快速翻炒均匀后出锅。", imageUrl: "https://i2.chuimg.com/ee5ff08a48424c2aa6ff21a1f0f43ff4_1920w_1920h.jpg?imageView2/2/w/800/interlace/1/q/75" }
    ],
    note: "酸甜微辣，鸡肉嫩滑，适合配米饭。"
  },
  {
    id: "corn-ribs-soup",
    name: "玉米排骨汤",
    category: "汤粥",
    meals: ["lunch", "dinner"],
    time: 70,
    difficulty: "省心",
    rating: 5,
    image: "https://i2.chuimg.com/c32e6335ab904475a0c141e08586361a_3024w_4032h.jpg?imageView2/1/w/800/h/600/q/75/format/jpg",
    sourceUrl: "https://www.xiachufang.com/recipe/106405041/",
    guideSource: "source",
    ingredients: [
      { name: "排骨", amount: 500, unit: "克", group: "肉蛋" },
      { name: "甜玉米", amount: 1, unit: "根", group: "蔬菜" },
      { name: "胡萝卜", amount: 1, unit: "根", group: "蔬菜" },
      { name: "料酒", amount: 2, unit: "勺", group: "调味" },
      { name: "姜", amount: 6, unit: "片", group: "蔬菜" },
      { name: "盐", amount: 5, unit: "克", group: "调味" },
      { name: "白胡椒粉", amount: 1, unit: "克", group: "调味" },
      { name: "小葱", amount: 0.5, unit: "根", group: "蔬菜" }
    ],
    stepDetails: [
      { text: "排骨剁成寸段，在清水中浸泡半小时，期间换两三次水。", imageUrl: "https://i2.chuimg.com/2542959c4e324e3fac9f2b9d0ebcb4ac_3024w_4032h.jpg?imageView2/2/w/800/interlace/1/q/75" },
      { text: "将泡过水的排骨冲洗干净。", imageUrl: "https://i2.chuimg.com/6546a24fb5d14795accb806f61264a92_3024w_4032h.jpg?imageView2/2/w/800/interlace/1/q/75" },
      { text: "排骨凉水下锅，加入姜片、葱段和料酒，开火焯水。", imageUrl: "https://i2.chuimg.com/a28d9d365fa540aa96e2f062ce45044f_3024w_4032h.jpg?imageView2/2/w/800/interlace/1/q/75" },
      { text: "水开后撇去浮沫，将排骨捞出。", imageUrl: "https://i2.chuimg.com/adf2dfbe427744ae991225d67d970e03_3024w_4032h.jpg?imageView2/2/w/800/interlace/1/q/75" },
      { text: "浸泡和焯水后的排骨再次冲洗干净，避免汤中有腥味和杂质。", imageUrl: "https://i2.chuimg.com/8f4d7c209f5e4128adc1e2b6b1ec0018_3024w_4032h.jpg?imageView2/2/w/800/interlace/1/q/75" },
      { text: "锅里加清水，放入排骨和姜片；大火烧开后转小火炖40分钟左右。", imageUrl: "https://i2.chuimg.com/86add3399aa94b28804f93f652fff68c_3024w_4032h.jpg?imageView2/2/w/800/interlace/1/q/75" },
      { text: "炖排骨时，将玉米切小段、胡萝卜切小块备用。", imageUrl: "https://i2.chuimg.com/56d900d593204adc8248b15a76fca9fe_3024w_4032h.jpg?imageView2/2/w/800/interlace/1/q/75" },
      { text: "炖约40分钟，汤汁变白并有肉香。", imageUrl: "https://i2.chuimg.com/7e365ba6c11346e288a216d7a50f8831_3024w_4032h.jpg?imageView2/2/w/800/interlace/1/q/75" },
      { text: "放入玉米和胡萝卜，盖上锅盖继续炖30分钟左右。", imageUrl: "https://i2.chuimg.com/5f404f87277f41bc9ac8a818801ecc5b_3024w_4032h.jpg?imageView2/2/w/800/interlace/1/q/75" },
      { text: "玉米和胡萝卜成熟后，放盐和白胡椒粉调味。", imageUrl: "https://i2.chuimg.com/a16e1e5f86274f6fa85c81dbace12f24_2212w_1770h.jpg?imageView2/2/w/800/interlace/1/q/75" },
      { text: "撒上小葱即可盛出。", imageUrl: "https://i2.chuimg.com/7c68fa7af8404c92acd3bfe7a5c66bce_3024w_2419h.jpg?imageView2/2/w/800/interlace/1/q/75" },
      { text: "汤香肉烂，趁热享用。", imageUrl: "https://i2.chuimg.com/5984ce57c7b54e1a8706669217a76589_3024w_4032h.jpg?imageView2/2/w/800/interlace/1/q/75" },
      { text: "排骨肉香和玉米清香融合后即可上桌。", imageUrl: "https://i2.chuimg.com/352bc14ad8974c42a771c9e72baacbb9_3024w_4032h.jpg?imageView2/2/w/800/interlace/1/q/75" }
    ],
    note: "清甜不腻，汤香肉烂。"
  }
].map((dish) => ({
  ...dish,
  imageUrl: dish.image,
  steps: dish.stepDetails.map((step) => step.text)
}));

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
    reopened: { breakfast: false, lunch: false, dinner: false },
    wishes: [],
    afterPhotos: [],
    submitted: false,
    submittedAt: null,
    notificationUnread: false
  };
}

function createDefaultState() {
  return {
    householdCover: "",
    dishes: starterDishes.map((dish) => ({
      ...dish,
      ingredients: dish.ingredients.map((ingredient) => ({ ...ingredient })),
      steps: [...dish.steps],
      stepDetails: dish.stepDetails.map((step) => ({ ...step }))
    })),
    plans: { [todayKey()]: emptyPlan() },
    feedback: {},
    checkedItems: {},
    shoppingGroupCollapsed: {},
    preferredMeals: [...mealOrder],
    photoAnalysisUsage: { dateKey: todayKey(), count: 0 }
  };
}

function normalizeAppState(value) {
  const base = createDefaultState();
  const normalized = {
    ...base,
    ...(value || {}),
    householdCover: normalizeHouseholdCover(value && value.householdCover),
    dishes: Array.isArray(value && value.dishes) ? value.dishes.map(normalizeDish).filter(Boolean) : base.dishes,
    feedback: value && typeof value.feedback === "object" ? value.feedback : {},
    checkedItems: value && typeof value.checkedItems === "object" ? value.checkedItems : {},
    shoppingGroupCollapsed: value && typeof value.shoppingGroupCollapsed === "object" ? value.shoppingGroupCollapsed : {},
    preferredMeals: normalizeMealKeys(value && value.preferredMeals),
    photoAnalysisUsage: normalizeDailyPhotoAnalysisUsage(value && value.photoAnalysisUsage),
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

function normalizeHouseholdCover(value) {
  const cover = String(value || "").trim();
  if (!cover || cover.length > MAX_HOUSEHOLD_COVER_CHARS) return "";
  if (/^data:image\/(?:jpeg|jpg|png|webp);base64,/i.test(cover)) return cover;
  if (/^https:\/\//i.test(cover) && cover.length <= 2048) return cover;
  return "";
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
    meals: normalizeMealKeys(dish.meals, base.meals || mealOrder),
    image,
    imageUrl: String(dish.imageUrl || image || "").trim()
  };
}

function normalizeMealKeys(value, fallback = mealOrder) {
  const source = Array.isArray(value) ? value : fallback;
  const normalized = mealOrder.filter((meal) => source.includes(meal));
  if (normalized.length) return normalized;
  return mealOrder.filter((meal) => fallback.includes(meal));
}

function normalizePlan(plan) {
  const normalized = {
    ...emptyPlan(),
    ...(plan || {}),
    skipped: {
      ...emptyPlan().skipped,
      ...((plan && plan.skipped) || {})
    },
    reopened: {
      ...emptyPlan().reopened,
      ...((plan && plan.reopened) || {})
    }
  };
  mealOrder.forEach((meal) => {
    normalized[meal] = Array.isArray(normalized[meal]) ? normalized[meal].map(String) : [];
    normalized.skipped[meal] = Boolean(normalized.skipped[meal]);
    normalized.reopened[meal] = Boolean(normalized.reopened[meal]);
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
  const status = ["searching", "found", "accepted", "declined", "failed"].includes(wish.status)
    ? wish.status
    : "searching";
  const createdAt = wish.createdAt || new Date().toISOString();
  const searchStartedAt = wish.searchStartedAt || (status === "searching" ? createdAt : "");
  const searchIsStale =
    status === "searching" &&
    searchStartedAt &&
    Number.isFinite(Date.parse(searchStartedAt)) &&
    Date.now() - Date.parse(searchStartedAt) > 120000;
  return {
    id: wish.id || `wish-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    meal,
    name,
    note: String(wish.note || "").trim(),
    status: searchIsStale ? "failed" : status,
    createdAt,
    searchStartedAt: searchIsStale ? "" : searchStartedAt,
    recipe: wish.recipe && typeof wish.recipe === "object" ? wish.recipe : null,
    seenRecipeNames: Array.from(new Set(
      (Array.isArray(wish.seenRecipeNames) ? wish.seenRecipeNames : [])
        .map((name) => String(name || "").trim())
        .filter(Boolean)
    )).slice(-16),
    error: searchIsStale
      ? "找菜超时了，可以重新搜索。"
      : String(wish.error || "").trim()
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

function isMealTimeElapsed(meal, key, now = new Date()) {
  if (key !== dateKeyFromDate(now) || !mealOrder.includes(meal)) return false;
  return now.getHours() * 60 + now.getMinutes() >= mealCutoffMinutes[meal];
}

function elapsedMeals(plan, key, now = new Date()) {
  return mealOrder.filter(
    (meal) => !mealResolved(plan, meal) && !plan.reopened?.[meal] && isMealTimeElapsed(meal, key, now)
  );
}

function actionableUnresolvedMeals(plan, key, now = new Date(), preferredMeals = mealOrder) {
  const elapsed = new Set(elapsedMeals(plan, key, now));
  const preferred = new Set(normalizeMealKeys(preferredMeals));
  return unresolvedMeals(plan).filter((meal) => preferred.has(meal) && !elapsed.has(meal));
}

function applyPreferredMealSkips(plan, preferredMeals) {
  const preferred = new Set(normalizeMealKeys(preferredMeals));
  mealOrder.forEach((meal) => {
    if (!preferred.has(meal) && mealItemCount(plan, meal) === 0) {
      plan.skipped[meal] = true;
      plan.reopened[meal] = false;
    }
  });
  return plan;
}

function hasPlanActivity(plan) {
  return selectedDishCount(plan) > 0 || wishCount(plan) > 0 || mealOrder.some((meal) => plan.skipped[meal]);
}

function hasPlanRecord(plan) {
  if (!plan || typeof plan !== "object") return false;
  const normalized = normalizePlan(plan);
  return selectedDishCount(normalized) > 0 || wishCount(normalized) > 0 || normalized.afterPhotos.length > 0;
}

function calendarDaysForMonth(monthKey, plans = {}, selectedKey = "", currentKey = todayKey()) {
  const fallbackMonthKey = /^\d{4}-\d{2}$/.test(String(selectedKey).slice(0, 7))
    ? String(selectedKey).slice(0, 7)
    : String(currentKey).slice(0, 7);
  const normalizedMonthKey = /^\d{4}-(0[1-9]|1[0-2])$/.test(String(monthKey))
    ? String(monthKey)
    : fallbackMonthKey;
  const [year, month] = normalizedMonthKey.split("-").map(Number);
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const dayCount = new Date(year, month, 0).getDate();

  return Array.from({ length: 42 }, (_, index) => {
    const day = index - firstWeekday + 1;
    if (day < 1 || day > dayCount) {
      return { id: `${normalizedMonthKey}-blank-${index}`, key: "", label: "", enabled: false };
    }
    const key = `${normalizedMonthKey}-${String(day).padStart(2, "0")}`;
    return {
      id: key,
      key,
      label: String(day),
      enabled: true,
      hasRecord: hasPlanRecord(plans[key]),
      selected: key === selectedKey,
      today: key === currentKey
    };
  });
}

function canViewOrder(plan, key) {
  return plan.submitted || (dateMode(key) === "past" && hasPlanActivity(plan));
}

function canUploadMealPhotos(state, plan, key) {
  if (!Boolean(state && plan && key) || !isEditableDate(key)) return false;
  if (Number(state.photoAnalysisUsage?.count || 0) >= 3) return false;
  return !(plan.afterPhotos || []).some(
    (photo) => photo.analysisStatus === "loading" || photo.shareStatus === "loading"
  );
}

function normalizeDailyPhotoAnalysisUsage(value) {
  const key = todayKey();
  if (!value || value.dateKey !== key) return { dateKey: key, count: 0 };
  return { dateKey: key, count: Math.max(0, Math.floor(Number(value.count) || 0)) };
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
  mealCutoffMinutes,
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
  normalizeHouseholdCover,
  normalizeMealKeys,
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
  isMealTimeElapsed,
  elapsedMeals,
  actionableUnresolvedMeals,
  applyPreferredMealSkips,
  hasPlanActivity,
  hasPlanRecord,
  calendarDaysForMonth,
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
