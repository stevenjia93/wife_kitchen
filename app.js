const STORAGE_KEY = "wife-kitchen-prototype-v1";
const HOUSEHOLD_SESSION_KEY = "wife-kitchen-household-session-v1";
const SUPABASE_CDN = "https://esm.sh/@supabase/supabase-js@2";
const SUPABASE_CONFIG = window.WIFE_KITCHEN_CONFIG || {};

const online = {
  enabled: Boolean(SUPABASE_CONFIG.supabaseUrl && SUPABASE_CONFIG.supabaseAnonKey),
  client: null,
  user: null,
  householdId: null,
  householdCode: "",
  status: "本地模式",
  error: "",
  loading: false,
  applyingRemote: false,
  saveTimer: null,
  subscription: null
};

loadHouseholdSession();

const mealLabels = {
  breakfast: "早餐",
  lunch: "午餐",
  dinner: "晚餐"
};

const mealOrder = ["breakfast", "lunch", "dinner"];
const categories = ["全部", "快手菜", "肉菜", "蔬菜", "汤粥", "早餐", "主食"];

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
  detailDishId: null
};

const app = document.querySelector("#app");

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

  normalized.submitted = Boolean(normalized.submitted);
  normalized.submittedAt = normalized.submittedAt || null;
  normalized.notificationUnread = Boolean(normalized.notificationUnread);
  return normalized;
}

function createDefaultState() {
  return {
    dishes: starterDishes,
    plans: {
      [todayKey()]: emptyPlan()
    },
    feedback: {},
    checkedItems: {}
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
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  scheduleRemoteSave();
}

function normalizeAppState(value = {}) {
  const base = createDefaultState();
  const normalized = {
    ...base,
    ...value,
    dishes: Array.isArray(value.dishes) ? value.dishes : base.dishes,
    feedback: value.feedback && typeof value.feedback === "object" ? value.feedback : {},
    checkedItems: value.checkedItems && typeof value.checkedItems === "object" ? value.checkedItems : {},
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

async function getSupabaseClient() {
  if (!online.enabled) throw new Error("Supabase 尚未配置");
  if (online.client) return online.client;
  const { createClient } = await import(SUPABASE_CDN);
  online.client = createClient(SUPABASE_CONFIG.supabaseUrl, SUPABASE_CONFIG.supabaseAnonKey);
  return online.client;
}

async function ensureOnlineUser() {
  const client = await getSupabaseClient();
  const { data: sessionData } = await client.auth.getSession();
  if (sessionData.session?.user) {
    online.user = sessionData.session.user;
    return online.user;
  }
  const { data, error } = await client.auth.signInAnonymously();
  if (error) throw error;
  online.user = data.user;
  return online.user;
}

async function joinHousehold(householdCode) {
  const code = householdCode.trim().toLowerCase();
  if (!code) {
    toast("请输入家庭码");
    return;
  }

  online.loading = true;
  online.error = "";
  online.status = "正在连接 Supabase...";
  render();

  try {
    await ensureOnlineUser();
    const client = await getSupabaseClient();
    const { data: householdId, error } = await client.rpc("join_household_by_code", {
      p_code: code
    });
    if (error) throw error;

    online.householdId = householdId;
    online.householdCode = code;
    online.status = `在线同步：${code}`;
    saveHouseholdSession();
    await loadRemoteState({ seedIfEmpty: true });
    subscribeRemoteState();
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
  const client = await getSupabaseClient();
  const { data, error } = await client
    .from("household_states")
    .select("payload")
    .eq("household_id", online.householdId)
    .maybeSingle();
  if (error) throw error;

  if (data?.payload && Object.keys(data.payload).length) {
    online.applyingRemote = true;
    state = normalizeAppState(data.payload);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    online.applyingRemote = false;
    return;
  }

  if (seedIfEmpty) await saveRemoteStateNow();
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
  const client = await getSupabaseClient();
  const { error } = await client.from("household_states").upsert({
    household_id: online.householdId,
    payload: state,
    updated_at: new Date().toISOString()
  });
  if (error) throw error;
  online.status = `在线同步：${online.householdCode}`;
}

function subscribeRemoteState() {
  if (!online.enabled || !online.householdId || online.subscription) return;
  getSupabaseClient()
    .then((client) => {
      online.subscription = client
        .channel(`household-state-${online.householdId}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "household_states",
            filter: `household_id=eq.${online.householdId}`
          },
          (payload) => {
            if (!payload.new?.payload) return;
            online.applyingRemote = true;
            state = normalizeAppState(payload.new.payload);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
            online.applyingRemote = false;
            render();
          }
        )
        .subscribe();
    })
    .catch((error) => {
      online.error = error.message || "实时同步失败";
    });
}

async function leaveHousehold() {
  online.householdId = null;
  online.householdCode = "";
  online.status = online.enabled ? "未加入家庭" : "本地模式";
  online.error = "";
  if (online.subscription) {
    const client = await getSupabaseClient();
    client.removeChannel(online.subscription);
  }
  online.subscription = null;
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
      const key = `${item.group || "其他"}|${item.name}|${item.unit || ""}`;
      const current = map.get(key) || {
        key,
        name: item.name,
        unit: item.unit || "",
        group: item.group || "其他",
        amount: 0,
        countable: true,
        dishes: []
      };
      if (typeof item.amount === "number" && Number.isFinite(item.amount)) {
        current.amount += item.amount;
      } else {
        current.countable = false;
      }
      current.dishes.push(dish.name);
      map.set(key, current);
    }
  }
  return Array.from(map.values()).sort((a, b) => a.group.localeCompare(b.group, "zh-CN"));
}

function groupedShoppingList(shopping = aggregateShoppingList()) {
  return shopping.reduce((groups, item) => {
    if (!groups[item.group]) groups[item.group] = [];
    groups[item.group].push(item);
    return groups;
  }, {});
}

function mealResolved(plan, meal) {
  return plan.skipped[meal] || plan[meal].length > 0;
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
  return selectedDishCount(plan) > 0 || mealOrder.some((meal) => plan.skipped[meal]);
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

function dishSteps(dish) {
  return Array.isArray(dish.steps) && dish.steps.length ? dish.steps : [dish.note || "按家里习惯处理食材，先把主料做熟，再按口味调味。"];
}

function dishImageSrc(dish) {
  if (dish?.id === "tomato-eggs" && String(dish.image || "").includes("photo-1589927986089")) {
    return fallbackDishImage(dish);
  }
  return dish?.image || fallbackDishImage(dish);
}

function fallbackDishImage(dish = {}) {
  const name = dish.name || "家常菜";
  const category = dish.category || "菜单";
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 560">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stop-color="#fff7ed"/>
          <stop offset="0.54" stop-color="#f0f6e8"/>
          <stop offset="1" stop-color="#dcebd2"/>
        </linearGradient>
      </defs>
      <rect width="900" height="560" fill="url(#bg)"/>
      <circle cx="735" cy="96" r="138" fill="#e14a2e" opacity="0.13"/>
      <circle cx="146" cy="458" r="118" fill="#287f64" opacity="0.12"/>
      <rect x="72" y="72" width="756" height="416" rx="36" fill="rgba(255,255,255,0.58)" stroke="#c8d8bd" stroke-width="4"/>
      <text x="450" y="258" text-anchor="middle" font-family="system-ui, -apple-system, BlinkMacSystemFont, sans-serif" font-size="62" font-weight="800" fill="#1f251f">${escapeSvg(name)}</text>
      <text x="450" y="332" text-anchor="middle" font-family="system-ui, -apple-system, BlinkMacSystemFont, sans-serif" font-size="30" font-weight="700" fill="#65705f">${escapeSvg(category)}</text>
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
  const plan = ensureTodayPlan();
  const isWife = ui.view === "wife";
  document.title = isWife ? "老婆点菜" : "老公厨房";
  app.innerHTML = `
    <div class="app-shell">
      ${renderHeader(plan)}
      ${renderDateStrip()}
      ${renderOnlineBar()}
      ${online.enabled && !online.householdId ? renderHouseholdGate() : isWife ? renderWifeView(plan) : renderHusbandView(plan)}
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
          <h1>${isWife ? "老婆点菜" : "老公厨房"}</h1>
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

function renderDateStrip() {
  return `
    <section class="date-strip">
      <div>
        <strong>${dayLabel()}</strong>
        <span>${dateModeText()}</span>
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
  const mode = online.enabled ? (online.householdId ? "online" : "setup") : "local";
  return `
    <section class="sync-strip ${mode}">
      <div>
        <strong>${online.enabled ? (online.householdId ? "在线家庭菜单" : "等待家庭码") : "本地预览模式"}</strong>
        <span>${online.enabled ? online.status : "配置 Supabase 后可以跨设备同步。"}</span>
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
  return `
    <main class="workspace">
      <section class="main-column">
        <div class="control-strip">
          <div class="meal-tabs" aria-label="选择餐次">
            ${mealOrder.map((meal) => renderMealTab(plan, meal)).join("")}
          </div>
          <div class="decision-row">
            <div>
              <strong>${mealLabels[ui.meal]}</strong>
              <span>${readOnly ? "历史查看模式" : skipped ? "这餐不需要做饭" : plan[ui.meal].length ? `已选 ${plan[ui.meal].length} 道` : "还没决定吃什么"}</span>
            </div>
            ${
              readOnly
                ? `<span class="date-status">只读历史</span>`
                : `<button class="button ${skipped ? "green" : "ghost"}" data-action="toggle-skip" data-meal="${ui.meal}">
                    ${skipped ? "恢复点餐" : `跳过${mealLabels[ui.meal]}`}
                  </button>`
            }
          </div>
          ${
            readOnly
              ? `<div class="empty-state">这是过去的点餐记录，只能查看，不能修改。</div>`
              : skipped
              ? `<div class="empty-state">已跳过${mealLabels[ui.meal]}，这餐不会出现在采购清单里。</div>`
              : `
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
              `
          }
        </div>

        <div class="dish-grid">
          ${
            readOnly
              ? renderHistoryMeal(plan, ui.meal)
              : skipped
                ? ""
                : filtered.length
                  ? filtered.map((dish) => renderWifeDishCard(dish, plan)).join("")
                  : renderNoDish()
          }
        </div>
      </section>

      <aside class="side-column">
        ${renderWifeOrderPanel(plan)}
      </aside>
    </main>
  `;
}

function renderMealTab(plan, meal) {
  const isActive = ui.meal === meal;
  const isSkipped = plan.skipped[meal];
  const count = plan[meal].length;
  const stateText = isSkipped ? "跳过" : count ? `${count}` : "";
  return `
    <button class="tab ${isActive ? "active" : ""} ${mealResolved(plan, meal) ? "resolved" : ""}" data-action="set-meal" data-meal="${meal}">
      ${mealLabels[meal]} ${stateText ? `<span>${stateText}</span>` : ""}
    </button>
  `;
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
          <span class="meta">${dish.meals.map((meal) => mealLabels[meal]).join("/")}</span>
        </div>
        <p class="ingredients-line">${escapeHtml(ingredients)}</p>
        <div class="dish-actions">
          <button class="button" data-action="view-detail" data-dish="${dish.id}">详情</button>
          ${
            isOrdered
              ? `<button class="button green" disabled>已选</button>`
              : `<button class="button green" data-action="add-dish" data-dish="${dish.id}">加入${mealLabels[ui.meal]}</button>`
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
  if (plan.skipped[meal]) {
    return `<div class="empty-state history-state">${mealLabels[meal]}当时跳过了。</div>`;
  }
  if (!plan[meal].length) {
    return `<div class="empty-state history-state">这天没有记录${mealLabels[meal]}吃什么。</div>`;
  }
  return plan[meal]
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
    })
    .join("");
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
          <div class="stat"><strong>${selectedDishCount(plan)}</strong><span>已选菜</span></div>
          <div class="stat"><strong>${mealOrder.filter((meal) => plan.skipped[meal]).length}</strong><span>跳过餐次</span></div>
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

function renderWifeMealBlock(plan, meal) {
  const ids = plan[meal];
  const skipped = plan.skipped[meal];
  const readOnly = isPastDate();
  return `
    <div class="meal-block">
      <button class="meal-heading meal-heading-button" data-action="focus-meal" data-meal="${meal}">
        <span>${mealLabels[meal]}</span>
        <span>${skipped ? "已跳过" : ids.length ? `${ids.length} 道` : "待定"}</span>
      </button>
      ${
        skipped
          ? `<button class="empty-state compact meal-empty-button" data-action="focus-meal" data-meal="${meal}">${readOnly ? "这餐当时跳过了" : "这餐不做饭，点击恢复点餐"}</button>`
          : ids.length
            ? `<ul class="order-list">${ids.map((id) => renderWifeOrderItem(meal, id)).join("")}</ul>`
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
          <button class="icon-button" title="查看详情" aria-label="查看 ${escapeAttr(dish.name)}" data-action="view-detail" data-dish="${dish.id}">?</button>
          ${readOnly ? "" : `<button class="icon-button" title="移除" aria-label="移除 ${escapeAttr(dish.name)}" data-action="remove-dish" data-meal="${meal}" data-dish="${id}">×</button>`}
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
          <div class="stat"><strong>${selectedDishCount(plan)}</strong><span>需要做</span></div>
          <div class="stat"><strong>${mealOrder.filter((meal) => plan.skipped[meal]).length}</strong><span>跳过</span></div>
          <div class="stat"><strong>${plan.submitted ? aggregateShoppingList(plan).length : 0}</strong><span>采购项</span></div>
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
  return `
    <div class="meal-block cook-meal-block">
      <div class="meal-heading">
        <span>${mealLabels[meal]}</span>
        <span>${plan.skipped[meal] ? "老婆跳过" : ids.length ? `${ids.length} 道菜` : "未安排"}</span>
      </div>
      ${
        plan.skipped[meal]
          ? `<div class="skip-card">这餐不用准备，采购清单已自动排除。</div>`
          : ids.length
            ? `<div class="cook-card-list">${ids.map((id) => renderCookDishCard(meal, id)).join("")}</div>`
            : `<div class="empty-state compact">这餐没有菜。</div>`
      }
    </div>
  `;
}

function renderCookDishCard(meal, id) {
  const dish = getDish(id);
  if (!dish) return "";
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
        </div>
        <p class="cook-note">${escapeHtml(dish.note || "简单处理食材，按家里口味调味。")}</p>
        <div class="mini-section">
          <strong>原料</strong>
          <p>${dish.ingredients.map((item) => escapeHtml(formatIngredient(item))).join("、")}</p>
        </div>
        <div class="mini-section">
          <strong>简单做法</strong>
          <ol>${dishSteps(dish).map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol>
        </div>
        <div class="dish-actions">
          <a class="button" href="${escapeAttr(dishSourceUrl(dish))}" target="_blank" rel="noreferrer">下厨房</a>
          <button class="button green" data-action="view-detail" data-dish="${dish.id}">查看详情</button>
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
              ? Object.entries(groups)
                  .map(
                    ([group, items]) => `
                      <div class="shopping-group">
                        <h3 class="shopping-group-title">${escapeHtml(group)}</h3>
                        <ul class="shopping-list">
                          ${items.map(renderShoppingItem).join("")}
                        </ul>
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

function renderShoppingItem(item) {
  const checked = state.checkedItems[selectedDateKey()]?.[item.key];
  const amount = item.countable ? `${niceNumber(item.amount)}${item.unit}` : "按需";
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
  return `
    <div class="menu-drawer-backdrop" data-role="menu-drawer-backdrop">
      <aside class="menu-drawer" role="dialog" aria-modal="true" aria-label="我的菜单管理">
        <header class="drawer-header">
          <div>
            <h2>我的菜单</h2>
            <p>${ui.menuMode === "browse" ? `${filtered.length}/${dishes.length} 道` : "录入一道会做的菜"}</p>
          </div>
          <button class="icon-button" data-action="close-menu-drawer" aria-label="关闭菜单">×</button>
        </header>
        <div class="drawer-tabs" role="tablist" aria-label="菜单管理模式">
          <button class="${ui.menuMode === "browse" ? "active" : ""}" data-action="set-menu-mode" data-mode="browse">浏览</button>
          <button class="${ui.menuMode === "form" ? "active" : ""}" data-action="set-menu-mode" data-mode="form">录入</button>
        </div>
        <div class="drawer-body">
          ${ui.menuMode === "form" ? renderRecipeForm() : renderMenuBrowser(filtered, dishes)}
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
      <div class="item-actions">
        <button class="icon-button" title="查看详情" aria-label="查看 ${escapeAttr(dish.name)}" data-action="view-detail" data-dish="${dish.id}">?</button>
        <button class="icon-button danger" title="从我的菜单移除" aria-label="移除 ${escapeAttr(dish.name)}" data-action="remove-menu-dish" data-dish="${dish.id}">×</button>
      </div>
    </li>
  `;
}

function renderRecipeForm() {
  return `
    <form class="form-grid" data-role="dish-form">
      <div class="form-field">
        <label for="dish-name">菜名</label>
        <input id="dish-name" name="name" required placeholder="比如：青椒肉丝" />
      </div>
      <div class="form-field">
        <label for="dish-category">分类</label>
        <select id="dish-category" name="category">
          ${categories
            .filter((category) => category !== "全部")
            .map((category) => `<option>${category}</option>`)
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
                  <input type="checkbox" name="meals" value="${meal}" ${meal === ui.meal ? "checked" : ""} />
                  ${mealLabels[meal]}
                </label>
              `
            )
            .join("")}
        </div>
      </div>
      <div class="form-field">
        <label for="dish-time">预计时间</label>
        <input id="dish-time" name="time" type="number" min="5" value="20" />
      </div>
      <div class="form-field">
        <label for="dish-ingredients">食材</label>
        <textarea id="dish-ingredients" name="ingredients" required placeholder="鸡蛋 3 个&#10;番茄 2 个&#10;小葱 1 根"></textarea>
      </div>
      <div class="form-field">
        <label for="dish-steps">简单做法</label>
        <textarea id="dish-steps" name="steps" placeholder="每行一步：切配食材&#10;先炒主料&#10;调味出锅"></textarea>
      </div>
      <div class="form-field">
        <label for="dish-source">下厨房链接</label>
        <div class="source-import-row">
          <input id="dish-source" name="sourceUrl" type="url" placeholder="https://www.xiachufang.com/recipe/..." />
          <button class="button" type="button" data-action="import-recipe-link">链接导入</button>
        </div>
        <input name="imageUrl" type="hidden" data-role="imported-image" />
        <div class="import-cover-preview" data-role="import-cover-preview" hidden></div>
      </div>
      <div class="form-field">
        <label for="dish-image">封面图</label>
        <input id="dish-image" name="imageFile" type="file" accept="image/*" />
      </div>
      <div class="form-field">
        <label for="dish-note">备注</label>
        <textarea id="dish-note" name="note" placeholder="关键火候、老婆偏好、下次改进"></textarea>
      </div>
      <button class="button primary" type="submit">保存到菜单</button>
    </form>
  `;
}

function renderDetailModal() {
  const dish = ui.detailDishId ? getDish(ui.detailDishId) : null;
  if (!dish) return "";
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
            <ol>${dishSteps(dish).map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol>
          </div>
          <a class="button primary wide" href="${escapeAttr(dishSourceUrl(dish))}" target="_blank" rel="noreferrer">打开下厨房参考</a>
          ${
            ui.view === "husband"
              ? `<label class="button wide file-button">
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
  if (plan.skipped[meal]) plan[meal] = [];
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

async function copyShoppingList() {
  const plan = ensureTodayPlan();
  const shopping = canViewOrder(plan) ? aggregateShoppingList(plan) : [];
  if (!shopping.length) {
    toast("采购清单还是空的");
    return;
  }
  const lines = shopping.map((item) => {
    const amount = item.countable ? `${niceNumber(item.amount)}${item.unit}` : "按需";
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
  const name = String(data.get("name") || "").trim();
  const selectedMeals = data.getAll("meals");
  const ingredients = parseIngredients(String(data.get("ingredients") || ""));
  const steps = String(data.get("steps") || "")
    .split("\n")
    .map((step) => step.trim())
    .filter(Boolean);
  const sourceUrl = String(data.get("sourceUrl") || "").trim();
  const importedImageUrl = String(data.get("imageUrl") || "").trim();

  if (!name || !selectedMeals.length || !ingredients.length) {
    toast("菜名、餐次和食材都要填");
    return;
  }

  const imageFile = data.get("imageFile");
  const imageDataUrl = imageFile instanceof File && imageFile.size ? await compressImageFile(imageFile) : "";

  const dish = {
    id: `dish-${Date.now()}`,
    name,
    category: String(data.get("category") || "快手菜"),
    meals: selectedMeals,
    time: Math.max(5, Number(data.get("time")) || 20),
    difficulty: "自家菜",
    rating: 4,
    image: imageDataUrl || importedImageUrl,
    ingredients,
    steps,
    sourceUrl,
    note: String(data.get("note") || "").trim() || "新加入的家常菜。"
  };

  state.dishes = [dish, ...state.dishes];
  saveState();
  ui.category = "全部";
  ui.search = "";
  ui.menuMode = "browse";
  ui.menuCategory = "全部";
  ui.menuSearch = "";
  form.reset();
  render();
  toast(`已加入：${name}`);
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
  const stepLines = Array.isArray(recipe.steps) ? recipe.steps : [];

  if (recipe.name) form.elements.name.value = recipe.name;
  if (recipe.sourceUrl) form.elements.sourceUrl.value = recipe.sourceUrl;
  if (recipe.time) form.elements.time.value = Math.max(5, Number(recipe.time) || 20);
  if (ingredientLines.length) form.elements.ingredients.value = ingredientLines.join("\n");
  if (stepLines.length) form.elements.steps.value = stepLines.join("\n");
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
    const image = await compressImageFile(file);
    state.dishes = state.dishes.map((dish) => (dish.id === dishId ? { ...dish, image } : dish));
    saveState();
    render();
    toast("封面已更新");
  } catch (error) {
    toast(error.message || "图片处理失败");
  }
}

function compressImageFile(file) {
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
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("图片解析失败"));
      image.onload = () => {
        const maxSide = 1200;
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
        resolve(canvas.toDataURL("image/jpeg", 0.78));
      };
      image.src = String(reader.result || "");
    };
    reader.readAsDataURL(file);
  });
}

function parseIngredients(text) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(.+?)\s+(\d+(?:\.\d+)?)\s*([^\d\s]+)?$/);
      if (!match) {
        return { name: line, amount: null, unit: "", group: guessGroup(line) };
      }
      const [, name, amount, unit = ""] = match;
      return {
        name: name.trim(),
        amount: Number(amount),
        unit: unit.trim(),
        group: guessGroup(name)
      };
    });
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
    render();
  }
  if (action === "focus-meal") focusMeal(actionTarget.dataset.meal);

  if (action === "set-category") {
    ui.category = actionTarget.dataset.category;
    render();
  }

  if (action === "add-dish") addDishToMeal(actionTarget.dataset.dish);
  if (action === "remove-dish") removeDishFromMeal(actionTarget.dataset.dish, actionTarget.dataset.meal);
  if (action === "remove-menu-dish") removeDishFromMenu(actionTarget.dataset.dish);
  if (action === "random") randomDish();
  if (action === "clear-today") clearToday();
  if (action === "feedback") setFeedback(actionTarget.dataset.dish, actionTarget.dataset.value);
  if (action === "toggle-bought") toggleBought(actionTarget.dataset.key);
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
    render();
  }
  if (action === "close-menu-drawer") {
    ui.menuDrawerOpen = false;
    render();
  }
  if (action === "set-menu-mode") {
    ui.menuMode = actionTarget.dataset.mode === "form" ? "form" : "browse";
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
    await ensureOnlineUser();
    await loadRemoteState({ seedIfEmpty: true });
    subscribeRemoteState();
    online.status = `在线同步：${online.householdCode}`;
  } catch (error) {
    online.error = error.message || "同步失败";
    online.status = "同步失败";
  } finally {
    online.loading = false;
    render();
  }
}
