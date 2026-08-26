const stateUtils = require("../../utils/state");
const { requestApi, showToast, requirePrivacyAuthorization } = require("../../utils/api");
const SHARE_TASK_POLL_INTERVAL_MS = 5000;
const SHARE_TASK_MAX_WAIT_MS = 5 * 60 * 1000;

const {
  STORAGE_KEY,
  HOUSEHOLD_KEY,
  mealOrder,
  mealLabels,
  categories,
  todayKey,
  dateFromKey,
  dateKeyFromDate,
  dayLabel,
  dateModeText,
  isEditableDate,
  createDefaultState,
  normalizeAppState,
  ensurePlan,
  activeDishes,
  getDish,
  wishesForMeal,
  selectedDishCount,
  wishCount,
  mealItemCount,
  unresolvedMeals,
  canViewOrder,
  canUploadMealPhotos,
  planFoodTargets,
  photoTargetName,
  aggregateShoppingList,
  groupedShoppingList,
  formatShoppingAmount,
  formatIngredient,
  formatTime,
  confidenceText,
  guessGroup
} = stateUtils;

Page({
  data: {
    role: "wife",
    activeTab: "wife",
    householdCode: "",
    householdInput: "",
    status: "等待家庭码",
    syncing: false,
    dateKey: todayKey(),
    meal: "dinner",
    category: "全部",
    wishName: "",
    featuredIndex: 0,
    menuOpen: false,
    recipeInput: "",
    recipeLoading: false,
    detailOpen: false,
    detailDish: null,
    categories,
    menuDishes: [],
    managedDishes: [],
    activeMealItems: [],
    mealTabs: [],
    wifeMeals: [],
    husbandMeals: [],
    shoppingGroups: [],
    photos: []
  },

  onLoad(options) {
    this.enableShareMenu();
    this.state = this.loadLocalState();
    this.photoImages = {};
    this.remoteSaveTimer = null;
    const savedHousehold = wx.getStorageSync(HOUSEHOLD_KEY) || {};
    const sharedCode = normalizeHouseholdCode(options.code || "");
    const savedCode = normalizeHouseholdCode(savedHousehold.code || "");
    const initialCode = sharedCode || savedCode;
    const role = options.role === "husband" ? "husband" : "wife";
    const activeTab = normalizeTab(options.tab) || role;
    this.setData({
      role,
      activeTab,
      householdCode: initialCode,
      householdInput: initialCode,
      status: initialCode ? `正在同步：${initialCode}` : "等待家庭码"
    });
    this.refreshView();
    if (initialCode) {
      this.joinHouseholdByCode(initialCode, { silent: !sharedCode });
    }
  },

  onShow() {
    this.enableShareMenu();
  },

  onPullDownRefresh() {
    if (!this.data.householdCode) {
      wx.stopPullDownRefresh();
      return;
    }
    this.joinHouseholdByCode(this.data.householdCode, { silent: true }).finally(() => wx.stopPullDownRefresh());
  },

  enableShareMenu() {
    if (!wx.showShareMenu) return;
    wx.showShareMenu({
      withShareTicket: true,
      menus: ["shareAppMessage", "shareTimeline"],
      fail: () => wx.showShareMenu({ withShareTicket: true })
    });
  },

  onShareAppMessage() {
    return {
      title: "一起安排今天吃什么",
      path: `/pages/home/index?${this.shareQuery()}`
    };
  },

  onShareTimeline() {
    return {
      title: "老婆点菜老公做",
      query: this.shareQuery({ includeHouseholdCode: false })
    };
  },

  shareQuery(options = {}) {
    const role = this.data.role === "husband" ? "husband" : "wife";
    const tab = normalizeTab(this.data.activeTab) || role;
    const params = [`role=${encodeURIComponent(role)}`, `tab=${encodeURIComponent(tab)}`];
    if (options.includeHouseholdCode !== false && this.data.householdCode) {
      params.push(`code=${encodeURIComponent(this.data.householdCode)}`);
    }
    return params.join("&");
  },

  loadLocalState() {
    try {
      const saved = wx.getStorageSync(STORAGE_KEY);
      return normalizeAppState(compactStateForStorage(saved || createDefaultState()));
    } catch {
      return createDefaultState();
    }
  },

  persistState(options = {}) {
    this.state = normalizeAppState(this.state);
    this.saveLocalState(this.state);
    this.refreshView();
    if (options.remote !== false) this.queueRemoteSave();
  },

  saveLocalState(state) {
    const compacted = compactStateForStorage(state);
    try {
      wx.setStorageSync(STORAGE_KEY, compacted);
    } catch {
      wx.removeStorageSync(STORAGE_KEY);
      wx.setStorageSync(STORAGE_KEY, compactStateForStorage(compacted, { stripAllImages: true }));
    }
  },

  queueRemoteSave() {
    if (!this.data.householdCode) return;
    clearTimeout(this.remoteSaveTimer);
    this.remoteSaveTimer = setTimeout(() => {
      this.saveRemoteState().catch((error) => {
        this.setData({ status: "同步失败" });
        showToast(error.message || "同步失败");
      });
    }, 500);
  },

  async saveRemoteState() {
    if (!this.data.householdCode) return;
    await requestApi("/api/miniprogram-state", {
      code: this.data.householdCode,
      payload: compactStateForStorage(this.state, { stripLocalPhotoPaths: true })
    });
    this.setData({ status: `在线同步：${this.data.householdCode}` });
  },

  refreshView() {
    const dateKey = this.data.dateKey;
    const plan = ensurePlan(this.state, dateKey);
    const pending = unresolvedMeals(plan);
    const dishes = this.filteredDishes();
    const featuredIndex = dishes.length ? Math.min(this.data.featuredIndex, dishes.length - 1) : 0;
    const activeDish = dishes[featuredIndex] || null;
    const targets = planFoodTargets(this.state, plan);
    const orderVisible = canViewOrder(plan, dateKey);
    const activeTab = this.data.activeTab || this.data.role || "wife";
    const hasMenuDraft = selectedDishCount(plan) + wishCount(plan) > 0 || mealOrder.some((meal) => plan.skipped[meal]);
    const shopping = orderVisible ? aggregateShoppingList(this.state, plan) : [];
    const photos = (plan.afterPhotos || []).map((photo) => this.buildPhotoView(photo, targets));
    const activeMealItems = this.buildMealItems(plan, this.data.meal);
    const managedDishes = activeDishes(this.state)
      .slice()
      .sort((a, b) => (b.rating || 0) - (a.rating || 0) || String(a.name).localeCompare(String(b.name), "zh-CN"))
      .map((dish) => this.buildManagedDish(dish));

    this.setData({
      brandMark: activeTab === "husband" ? "厨" : activeTab === "menu" ? "菜" : "点",
      navTitle: activeTab === "husband" ? "老公厨房" : activeTab === "menu" ? "管理菜单" : "老婆点菜",
      navSubtitle: this.data.householdCode ? this.data.status : "输入家庭码后进入专属菜单",
      showWife: activeTab === "wife",
      showHusband: activeTab === "husband",
      showMenu: activeTab === "menu",
      showPhotoPanel: activeTab === "wife" && (orderVisible || photos.length > 0),
      dateTitle: dayLabel(dateKey),
      dateMeta: `${dateModeText(dateKey)} · ${selectedDishCount(plan) + wishCount(plan)} 项已选 · ${
        pending.length ? `${pending.length} 餐待定` : "三餐已决定"
      }`,
      featuredIndex,
      editable: isEditableDate(dateKey),
      canSubmit: isEditableDate(dateKey) && !pending.length,
      pendingText: pending.map((meal) => mealLabels[meal]).join("、"),
      orderStatus: plan.submitted ? `已下单 ${formatTime(plan.submittedAt)}` : pending.length ? "还有餐次未决定" : "可以下单了",
      mealTabs: mealOrder.map((meal) => ({
        key: meal,
        label: mealLabels[meal],
        active: this.data.meal === meal,
        skipped: plan.skipped[meal],
        count: mealItemCount(plan, meal)
      })),
      activeMealLabel: mealLabels[this.data.meal],
      activeMealSkipped: plan.skipped[this.data.meal],
      activeMealCount: mealItemCount(plan, this.data.meal),
      activeMealItems,
      filteredDishes: dishes.map((dish, index) => this.buildDishThumb(dish, index, featuredIndex)),
      menuDishes: dishes.map((dish) => this.buildMenuDish(dish, plan)),
      managedDishes,
      activeDish: activeDish ? this.buildDishView(activeDish, plan) : null,
      selectedCurrent: Boolean(activeDish && plan[this.data.meal].includes(activeDish.id)),
      wifeMeals: this.buildWifeMeals(plan),
      husbandMeals: this.buildHusbandMeals(plan),
      canViewOrder: orderVisible,
      canViewMenu: orderVisible || hasMenuDraft,
      kitchenStatus: orderVisible ? "按餐次看菜、原料和做法。" : hasMenuDraft ? "这是当前草稿菜单，可以继续调整。" : "还没有设定菜单。",
      shoppingGroups: groupedShoppingList(shopping).map((group) => ({
        group: group.group,
        items: group.items.map((item) => ({
          ...item,
          amountText: formatShoppingAmount(item),
          sourcesText: Array.from(new Set(item.dishes)).join("、")
        }))
      })),
      photoCount: photos.length,
      analyzedCount: photos.filter((photo) => photo.analysisStatus === "done" && photo.analysis).length,
      canUploadPhotos: canUploadMealPhotos(this.state, plan, dateKey),
      photos
    });
  },

  filteredDishes() {
    const meal = this.data.meal;
    const category = this.data.category;
    return activeDishes(this.state)
      .filter((dish) => dish.meals.includes(meal))
      .filter((dish) => category === "全部" || dish.category === category)
      .sort((a, b) => (b.rating || 0) - (a.rating || 0) || (a.time || 0) - (b.time || 0));
  },

  buildDishView(dish, plan) {
    return {
      ...dish,
      imageSrc: dishImageSrc(dish),
      imageInitial: dish.name.slice(0, 1),
      ingredientText: (dish.ingredients || []).map(formatIngredient).slice(0, 8).join("、"),
      stepText: (dish.steps || []).slice(0, 3).join(" / "),
      palette: categoryClass(dish.category),
      selected: plan[this.data.meal].includes(dish.id)
    };
  },

  buildDishThumb(dish, index, activeIndex) {
    return {
      id: dish.id,
      index,
      name: dish.name,
      imageSrc: dishImageSrc(dish),
      active: index === activeIndex,
      palette: categoryClass(dish.category)
    };
  },

  buildMenuDish(dish, plan) {
    return {
      id: dish.id,
      name: dish.name,
      note: dish.note || "按家里口味调整。",
      meta: `${dish.category} · ${dish.time} 分钟 · ${dish.difficulty}`,
      imageSrc: dishImageSrc(dish),
      imageInitial: dish.name.slice(0, 1),
      ingredientText: (dish.ingredients || []).map(formatIngredient).slice(0, 6).join("、"),
      selected: (plan[this.data.meal] || []).includes(dish.id)
    };
  },

  buildMealItems(plan, meal) {
    const dishes = (plan[meal] || []).map((id) => {
      const dish = getDish(this.state, id);
      return dish
        ? {
            id,
            name: dish.name,
            meta: (dish.ingredients || []).map(formatIngredient).slice(0, 4).join("、") || dish.category,
            imageSrc: dishImageSrc(dish),
            imageInitial: dish.name.slice(0, 1),
            canRemove: true,
            meal
          }
        : null;
    }).filter(Boolean);
    const wishes = wishesForMeal(plan, meal).map((wish) => ({
      id: wish.id,
      name: wish.name,
      meta: wishStatusText(wish),
      imageInitial: "愿",
      canRemove: false,
      meal
    }));
    return [...dishes, ...wishes];
  },

  buildWifeMeals(plan) {
    return mealOrder.map((meal) => {
      const ids = plan[meal] || [];
      const wishes = wishesForMeal(plan, meal);
      return {
        meal,
        label: mealLabels[meal],
        skipped: plan.skipped[meal],
        empty: !ids.length && !wishes.length,
        items: ids.map((id) => {
          const dish = getDish(this.state, id);
          return dish
            ? {
                id,
                name: dish.name,
                imageSrc: dishImageSrc(dish),
                imageInitial: dish.name.slice(0, 1),
                ingredientText: (dish.ingredients || []).map(formatIngredient).slice(0, 5).join("、"),
                meal
              }
            : null;
        }).filter(Boolean),
        wishes: wishes.map((wish) => ({
          ...wish,
          mealLabel: mealLabels[wish.meal],
          statusText: wishStatusText(wish)
        }))
      };
    });
  },

  buildHusbandMeals(plan) {
    return mealOrder.map((meal) => {
      const ids = plan[meal] || [];
      const wishes = wishesForMeal(plan, meal);
      return {
        meal,
        label: mealLabels[meal],
        skipped: plan.skipped[meal],
        empty: !ids.length && !wishes.length,
        totalCount: ids.length + wishes.length,
        items: ids.map((id) => {
          const dish = getDish(this.state, id);
          if (!dish) return null;
          return {
            id,
            name: dish.name,
            category: dish.category,
            time: dish.time,
            imageSrc: dishImageSrc(dish),
            imageInitial: dish.name.slice(0, 1),
            sourceUrl: dish.sourceUrl || "",
            note: dish.note || "按家里口味调整。",
            detailMeta: `${dish.time || 20} 分钟 · ${(dish.ingredients || []).length} 样原料`,
            ingredients: (dish.ingredients || []).map(formatIngredient),
            ingredientsText: (dish.ingredients || []).map(formatIngredient).join("、"),
            steps: (dish.steps || []).slice(0, 5),
            stepsText: (dish.steps || []).slice(0, 5).join(" / ")
          };
        }).filter(Boolean),
        wishes: wishes.map((wish) => this.buildWishView(wish))
      };
    });
  },

  buildWishView(wish) {
    const recipe = wish.recipe && typeof wish.recipe === "object" ? wish.recipe : {};
    const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients.map(String).filter(Boolean) : [];
    const steps = Array.isArray(recipe.steps) ? recipe.steps.map(String).filter(Boolean) : [];
    return {
      id: wish.id,
      name: wish.name,
      meal: wish.meal,
      mealLabel: mealLabels[wish.meal],
      status: wish.status,
      statusText: wishStatusText(wish),
      searching: wish.status === "searching",
      hasRecipe: Boolean(recipe.name || recipe.sourceUrl),
      recipeName: recipe.name || wish.name,
      sourceUrl: recipe.sourceUrl || "",
      ratingText: recipe.searchRating ? `评分 ${recipe.searchRating}` : "",
      cookedText: recipe.searchCookedCount ? `${recipe.searchCookedCount} 人做过` : "",
      ingredientText: ingredients.slice(0, 10).join("、"),
      stepText: steps.slice(0, 5).join(" / "),
      error: wish.error || "暂时没找到参考菜谱。"
    };
  },

  buildManagedDish(dish) {
    return {
      id: dish.id,
      name: dish.name,
      meta: `${dish.category || "家常菜"} · ${dish.time || 20} 分钟`,
      imageSrc: dishImageSrc(dish),
      imageInitial: dish.name.slice(0, 1),
      ingredientText: (dish.ingredients || []).map(formatIngredient).slice(0, 6).join("、") || "还没有原料清单",
      sourceUrl: dish.sourceUrl || ""
    };
  },

  buildDishDetail(dish) {
    const steps = dishStepItems(dish);
    const visibleSteps = steps.length ? steps : [{ text: "复制下厨房链接，查看完整步骤。", image: "", imageUrl: "" }];
    return {
      id: dish.id,
      name: dish.name,
      category: dish.category || "家常菜",
      meta: `${dish.time || 20} 分钟 · ${dish.difficulty || "家常"} · ${(dish.meals || []).map((meal) => mealLabels[meal]).join("/")}`,
      note: dish.note || "按家里口味调整。",
      imageSrc: dishImageSrc(dish),
      imageInitial: dish.name.slice(0, 1),
      sourceUrl: dish.sourceUrl || "",
      ingredients: (dish.ingredients || []).map((item) => ({ text: formatIngredient(item) })),
      steps: visibleSteps.map((step, index) => ({
        index: index + 1,
        text: step.text || "打开下厨房查看完整步骤。",
        imageSrc: stepImageSrc(step)
      }))
    };
  },

  buildPhotoView(photo, targets) {
    const originalImage = photo.localImagePath || photo.image || (this.photoImages && this.photoImages[photo.id]) || "";
    const displayImage = photo.shareImage || originalImage || "";
    const analysis = photo.analysis || null;
    const shareStartedAt = Date.parse(photo.shareStartedAt || "");
    const shareStillRunning = photo.shareStatus === "loading" && shareStartedAt && Date.now() - shareStartedAt < 180000;
    const targetNames = (photo.targetKeys || []).length
      ? photo.targetKeys.map((key) => photoTargetName(key, targets)).filter(Boolean)
      : ["整桌合照"];
    return {
      ...photo,
      displayImage,
      isSharePreview: Boolean(photo.shareImage),
      targetLabel: targetNames.join("、") || "整桌合照",
      timeText: formatTime(photo.createdAt),
      totalCalories: analysis ? Math.round(analysis.totalCalories || 0) : 0,
      confidenceText: analysis ? confidenceText(analysis.confidence) : "",
      analysisItems: analysis ? (analysis.items || []).slice(0, 5) : [],
      canSaveShare: Boolean(photo.shareImage),
      canGenerateShare: Boolean(analysis && !photo.shareImage && originalImage && !shareStillRunning),
      generateShareText: photo.shareStatus === "failed" || photo.shareStatus === "loading" ? "重新生成分享图" : "生成分享图",
      statusText:
        shareStillRunning
          ? "正在生成小红书分享图，完成后会自动替换"
          : photo.analysisStatus === "loading"
            ? "正在识别热量"
            : ""
    };
  },

  onHouseholdInput(event) {
    this.setData({ householdInput: event.detail.value });
  },

  joinHousehold() {
    this.joinHouseholdByCode(this.data.householdInput);
  },

  async joinHouseholdByCode(rawCode, options = {}) {
    const code = String(rawCode || "").trim().toLowerCase();
    if (!code) {
      showToast("请输入家庭码");
      return;
    }
    this.setData({ syncing: true, status: "正在进入家庭菜单..." });
    try {
      const payload = await requestApi("/api/miniprogram-state", { code });
      const nextState = payload.payload ? normalizeAppState(payload.payload) : createDefaultState();
      this.state = normalizeAppState(compactStateForStorage(nextState));
      this.saveLocalState(this.state);
      wx.setStorageSync(HOUSEHOLD_KEY, { code, householdId: payload.householdId || "" });
      this.setData({
        householdCode: code,
        householdInput: code,
        status: `在线同步：${code}`,
        syncing: false
      });
      this.refreshView();
      if (!payload.payload) await this.saveRemoteState();
      else this.queueRemoteSave();
      if (!options.silent) showToast("已进入家庭菜单", "success");
    } catch (error) {
      this.setData({ syncing: false, status: "连接失败" });
      showToast(error.message || "连接失败");
    }
  },

  leaveHousehold() {
    wx.removeStorageSync(HOUSEHOLD_KEY);
    this.setData({ householdCode: "", householdInput: "", status: "等待家庭码" });
    this.refreshView();
  },

  switchRole(event) {
    const role = event.currentTarget.dataset.role || "wife";
    this.setData({ role, activeTab: role }, () => this.refreshView());
  },

  switchTab(event) {
    const tab = event.currentTarget.dataset.tab || "wife";
    const role = tab === "husband" ? "husband" : tab === "wife" ? "wife" : this.data.role;
    this.setData({ activeTab: tab, role, menuOpen: false, detailOpen: false }, () => this.refreshView());
  },

  shiftDate(event) {
    const days = Number(event.currentTarget.dataset.days || 0);
    const date = dateFromKey(this.data.dateKey);
    date.setDate(date.getDate() + days);
    this.setData({ dateKey: dateKeyFromDate(date), featuredIndex: 0, menuOpen: false }, () => this.refreshView());
  },

  goToday() {
    this.setData({ dateKey: todayKey(), featuredIndex: 0, menuOpen: false }, () => this.refreshView());
  },

  selectMeal(event) {
    this.setData({ meal: event.currentTarget.dataset.meal || "dinner", featuredIndex: 0 }, () => this.refreshView());
  },

  setCategory(event) {
    this.setData({ category: event.currentTarget.dataset.category || "全部", featuredIndex: 0 }, () => this.refreshView());
  },

  toggleSkip() {
    if (!isEditableDate(this.data.dateKey)) return showToast("历史日期只能查看");
    const plan = ensurePlan(this.state, this.data.dateKey);
    const meal = this.data.meal;
    plan.skipped[meal] = !plan.skipped[meal];
    if (plan.skipped[meal]) {
      plan[meal] = [];
      plan.wishes = (plan.wishes || []).filter((wish) => wish.meal !== meal);
    }
    markPlanDraft(plan);
    this.persistState();
  },

  prevDish() {
    const dishes = this.filteredDishes();
    if (!dishes.length) return;
    this.setData({ featuredIndex: (this.data.featuredIndex - 1 + dishes.length) % dishes.length }, () => this.refreshView());
  },

  nextDish() {
    const dishes = this.filteredDishes();
    if (!dishes.length) return;
    this.setData({ featuredIndex: (this.data.featuredIndex + 1) % dishes.length }, () => this.refreshView());
  },

  selectDish(event) {
    this.setData({ featuredIndex: Number(event.currentTarget.dataset.index || 0) }, () => this.refreshView());
  },

  openMenuSheet() {
    if (!isEditableDate(this.data.dateKey)) return showToast("历史日期只能查看");
    if (this.data.activeMealSkipped) return showToast("这餐已跳过，先恢复点餐");
    this.setData({ menuOpen: true }, () => this.refreshView());
  },

  closeMenuSheet() {
    this.setData({ menuOpen: false });
  },

  addDishFromMenu(event) {
    if (!isEditableDate(this.data.dateKey)) return showToast("历史日期只能查看");
    const dishId = event.currentTarget.dataset.id;
    const dish = getDish(this.state, dishId);
    if (!dish) return;
    const plan = ensurePlan(this.state, this.data.dateKey);
    if (plan.skipped[this.data.meal]) return showToast("这餐已跳过，先恢复点餐");
    if (!plan[this.data.meal].includes(dishId)) {
      plan[this.data.meal].push(dishId);
      markPlanDraft(plan);
      this.persistState();
      showToast(`已加入：${dish.name}`, "success");
      return;
    }
    showToast("这道菜已经加入了");
  },

  editMenuFromKitchen() {
    this.setData({ role: "wife", activeTab: "wife" }, () => this.refreshView());
  },

  goMenuManager() {
    this.setData({ activeTab: "menu", menuOpen: false, detailOpen: false }, () => this.refreshView());
  },

  openDishDetail(event) {
    const dishId = event.currentTarget.dataset.id;
    const dish = getDish(this.state, dishId);
    if (!dish) return;
    this.setData({
      detailOpen: true,
      detailDish: this.buildDishDetail(dish)
    });
  },

  closeDishDetail() {
    this.setData({ detailOpen: false, detailDish: null });
  },

  noop() {},

  addDish() {
    if (!isEditableDate(this.data.dateKey)) return showToast("历史日期只能查看");
    const dish = this.data.activeDish;
    if (!dish) return;
    const plan = ensurePlan(this.state, this.data.dateKey);
    if (plan.skipped[this.data.meal]) return showToast("这餐已跳过，先恢复点餐");
    if (!plan[this.data.meal].includes(dish.id)) {
      plan[this.data.meal].push(dish.id);
      markPlanDraft(plan);
      this.persistState();
      showToast(`已加入：${dish.name}`, "success");
    }
  },

  removeDish(event) {
    if (!isEditableDate(this.data.dateKey)) return showToast("历史日期只能查看");
    const dishId = event.currentTarget.dataset.id;
    const meal = event.currentTarget.dataset.meal || this.data.meal;
    const plan = ensurePlan(this.state, this.data.dateKey);
    plan[meal] = (plan[meal] || []).filter((id) => id !== dishId);
    markPlanDraft(plan);
    this.persistState();
  },

  randomDish() {
    if (!isEditableDate(this.data.dateKey)) return showToast("历史日期只能查看");
    const dishes = this.filteredDishes();
    if (!dishes.length) return showToast("这个餐次暂无可选菜");
    const index = Math.floor(Math.random() * dishes.length);
    const dish = dishes[index];
    const plan = ensurePlan(this.state, this.data.dateKey);
    if (plan.skipped[this.data.meal]) return showToast("这餐已跳过，先恢复点餐");
    if (!plan[this.data.meal].includes(dish.id)) {
      plan[this.data.meal].push(dish.id);
      markPlanDraft(plan);
      this.setData({ featuredIndex: index }, () => this.persistState());
      showToast(`已加入：${dish.name}`, "success");
      return;
    }
    this.setData({ featuredIndex: index }, () => this.refreshView());
    showToast("这道菜已经加入了");
  },

  onWishNameInput(event) {
    this.setData({ wishName: event.detail.value });
  },

  onRecipeInput(event) {
    this.setData({ recipeInput: event.detail.value });
  },

  async importRecipe() {
    const input = String(this.data.recipeInput || "").trim();
    if (!input) return showToast("输入下厨房链接或菜名");
    this.setData({ recipeLoading: true });
    try {
      const isUrl = /^https?:\/\//i.test(input);
      const payload = await requestApi(
        isUrl ? "/api/import-recipe" : "/api/search-recipe",
        isUrl
          ? { url: input, includeImages: false, includeStepImages: false }
          : { query: input, includeImages: false, includeStepImages: false }
      );
      const dish = dishFromRecipe(payload.recipe, input);
      const index = (this.state.dishes || []).findIndex((item) =>
        dish.sourceUrl ? item.sourceUrl === dish.sourceUrl : String(item.name || "") === dish.name
      );
      if (index >= 0) {
        this.state.dishes[index] = { ...this.state.dishes[index], ...dish, id: this.state.dishes[index].id, archived: false };
        showToast("已更新菜单", "success");
      } else {
        this.state.dishes = [dish, ...(this.state.dishes || [])];
        showToast("已添加新菜", "success");
      }
      this.setData({ recipeInput: "" });
      this.persistState();
    } catch (error) {
      showToast(error.message || "导入失败");
    } finally {
      this.setData({ recipeLoading: false });
    }
  },

  async copyRecipeSource(event) {
    const url = event.currentTarget.dataset.url;
    if (!url) return showToast("没有来源链接");
    try {
      await requirePrivacyAuthorization();
      wx.setClipboardData({ data: url, success: () => showToast("已复制下厨房链接", "success") });
    } catch (error) {
      showToast(error.message);
    }
  },

  removeManagedDish(event) {
    const dishId = event.currentTarget.dataset.id;
    const index = (this.state.dishes || []).findIndex((dish) => dish.id === dishId);
    if (index < 0) return;
    const dishName = this.state.dishes[index].name || "这道菜";
    wx.showModal({
      title: "删除这道菜？",
      content: `将从我的菜单移除「${dishName}」，并从已有点菜草稿里清掉。`,
      confirmText: "删除",
      confirmColor: "#d84a2b",
      cancelText: "取消",
      success: (result) => {
        if (!result.confirm) return;
        this.state.dishes[index] = { ...this.state.dishes[index], archived: true };
        Object.keys(this.state.plans || {}).forEach((dateKey) => {
          const plan = ensurePlan(this.state, dateKey);
          mealOrder.forEach((meal) => {
            plan[meal] = (plan[meal] || []).filter((id) => id !== dishId);
          });
        });
        this.persistState();
        showToast("已从菜单移除", "success");
      }
    });
  },

  addWish() {
    const name = this.data.wishName.trim();
    if (!name) return showToast("先输入想吃的菜名");
    const plan = ensurePlan(this.state, this.data.dateKey);
    if (plan.skipped[this.data.meal]) return showToast("这餐已跳过，先恢复点餐");
    if (wishesForMeal(plan, this.data.meal).some((wish) => wish.name === name)) {
      return showToast("这道许愿菜已经点过了");
    }
    const dateKey = this.data.dateKey;
    const wish = {
      id: `wish-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      meal: this.data.meal,
      name,
      note: "",
      status: "searching",
      createdAt: new Date().toISOString(),
      searchStartedAt: new Date().toISOString(),
      recipe: null,
      error: ""
    };
    plan.wishes = [
      wish,
      ...(plan.wishes || [])
    ];
    markPlanDraft(plan);
    this.setData({ wishName: "" });
    this.persistState();
    showToast(`正在找：${name}`);
    this.searchWishRecipe(dateKey, wish.id);
  },

  async searchWishRecipe(dateKey, wishId) {
    const current = this.findWishLocation(wishId, dateKey);
    if (!current) return;
    current.wish.status = "searching";
    current.wish.error = "";
    current.wish.searchStartedAt = new Date().toISOString();
    this.persistState();
    try {
      const payload = await requestApi("/api/search-recipe", {
        query: current.wish.name,
        includeImages: false,
        includeStepImages: false
      });
      const latest = this.findWishLocation(wishId, dateKey);
      if (!latest) return;
      latest.wish.status = "found";
      latest.wish.recipe = payload.recipe || null;
      latest.wish.error = "";
      latest.wish.searchStartedAt = "";
      this.persistState();
      showToast(`已找到：${latest.wish.recipe?.name || latest.wish.name}`, "success");
    } catch (error) {
      const latest = this.findWishLocation(wishId, dateKey);
      if (!latest) return;
      latest.wish.status = "failed";
      latest.wish.error = error.message || "没找到参考菜谱";
      latest.wish.searchStartedAt = "";
      this.persistState();
      showToast(latest.wish.error);
    }
  },

  findWishLocation(wishId, preferredDateKey = this.data.dateKey) {
    const keys = [preferredDateKey, ...Object.keys(this.state.plans || {}).filter((key) => key !== preferredDateKey)];
    for (const dateKey of keys) {
      const plan = ensurePlan(this.state, dateKey);
      const wish = (plan.wishes || []).find((item) => item.id === wishId);
      if (wish) return { dateKey, plan, wish };
    }
    return null;
  },

  retryWishSearch(event) {
    const wishId = event.currentTarget.dataset.id;
    const found = this.findWishLocation(wishId);
    if (!found) return;
    found.wish.recipe = null;
    this.searchWishRecipe(found.dateKey, wishId);
  },

  declineWish(event) {
    const found = this.findWishLocation(event.currentTarget.dataset.id);
    if (!found) return;
    found.wish.status = "declined";
    found.wish.error = "";
    found.wish.searchStartedAt = "";
    markPlanDraft(found.plan);
    this.persistState();
    showToast(`已标记这次不做：${found.wish.name}`);
  },

  acceptWish(event) {
    const found = this.findWishLocation(event.currentTarget.dataset.id);
    if (!found || !found.wish.recipe) return showToast("还没有可用的参考菜谱");
    const dish = dishFromRecipe(found.wish.recipe, found.wish.name);
    dish.meals = [found.wish.meal];
    dish.difficulty = "挑战菜";
    dish.note = found.wish.note ? `老婆许愿：${found.wish.note}` : "老婆许愿菜，按下厨房高分参考尝试。";
    const existing = activeDishes(this.state).find(
      (item) => item.name === dish.name || (item.sourceUrl && item.sourceUrl === dish.sourceUrl)
    );
    const dishId = existing ? existing.id : dish.id;
    if (existing && !existing.meals.includes(found.wish.meal)) existing.meals.push(found.wish.meal);
    if (!existing) this.state.dishes = [dish, ...(this.state.dishes || [])];
    if (!found.plan[found.wish.meal].includes(dishId)) found.plan[found.wish.meal].push(dishId);
    found.plan.wishes = found.plan.wishes.filter((wish) => wish.id !== found.wish.id);
    markPlanDraft(found.plan);
    this.persistState();
    showToast(`已接招：${dish.name}`, "success");
  },

  submitOrder() {
    if (!isEditableDate(this.data.dateKey)) return showToast("历史日期只能查看");
    const plan = ensurePlan(this.state, this.data.dateKey);
    const pending = unresolvedMeals(plan);
    if (pending.length) return showToast(`还有 ${pending.map((meal) => mealLabels[meal]).join("、")} 未决定`);
    plan.submitted = true;
    plan.submittedAt = new Date().toISOString();
    plan.notificationUnread = true;
    this.persistState();
    showToast("已下单", "success");
  },

  async copyShoppingList() {
    const plan = ensurePlan(this.state, this.data.dateKey);
    const shopping = aggregateShoppingList(this.state, plan);
    if (!shopping.length) return showToast("采购清单为空");
    const lines = shopping.map((item) => `${item.name} ${formatShoppingAmount(item)}`);
    try {
      await requirePrivacyAuthorization();
      wx.setClipboardData({ data: [`${dayLabel(this.data.dateKey)}采购清单`, ...lines].join("\n") });
    } catch (error) {
      showToast(error.message);
    }
  },

  async uploadMealPhoto() {
    const plan = ensurePlan(this.state, this.data.dateKey);
    if (!canUploadMealPhotos(this.state, plan, this.data.dateKey)) {
      showToast("今天确认下单后才能上传成品照");
      return;
    }
    try {
      await requirePrivacyAuthorization();
    } catch (error) {
      showToast(error.message);
      return;
    }
    const consented = await this.confirmAiPhotoProcessing("继续上传");
    if (!consented) return;
    wx.chooseMedia({
      count: 1,
      mediaType: ["image"],
      sourceType: ["album", "camera"],
      sizeType: ["compressed"],
      success: async (result) => {
        const filePath = result.tempFiles && result.tempFiles[0] && result.tempFiles[0].tempFilePath;
        if (!filePath) return;
        try {
          wx.showLoading({ title: "处理照片" });
          const image = await this.imageFileToDataUrl(filePath);
          const photoId = `photo-${Date.now()}-${Math.random().toString(16).slice(2)}`;
          const localImagePath = await this.dataUrlToLocalImageFile(image, photoId).catch(() => "");
          const targets = planFoodTargets(this.state, plan);
          const photo = {
            id: photoId,
            image: "",
            localImagePath,
            imageOmitted: true,
            targetKeys: targets.map((target) => target.key),
            createdAt: new Date().toISOString(),
            analysisStatus: "loading",
            shareStatus: "idle"
          };
          this.photoImages[photo.id] = image;
          plan.afterPhotos = [photo, ...(plan.afterPhotos || [])].slice(0, 12);
          this.persistState();
          wx.hideLoading();
          this.analyzeMealPhoto(photo.id, { autoShare: true });
        } catch (error) {
          wx.hideLoading();
          showToast(error.message || "照片处理失败");
        }
      }
    });
  },

  dataUrlToLocalImageFile(dataUrl, photoId) {
    return new Promise((resolve, reject) => {
      const match = /^data:image\/(jpeg|jpg|png|webp);base64,(.+)$/i.exec(String(dataUrl || ""));
      if (!match) {
        resolve(String(dataUrl || ""));
        return;
      }
      const ext = match[1].toLowerCase() === "png" ? "png" : "jpg";
      const safeId = String(photoId || Date.now()).replace(/[^a-z0-9_-]/gi, "-");
      const filePath = `${wx.env.USER_DATA_PATH}/meal-${safeId}.${ext}`;
      wx.getFileSystemManager().writeFile({
        filePath,
        data: match[2],
        encoding: "base64",
        success: () => resolve(filePath),
        fail: reject
      });
    });
  },

  imageFileToDataUrl(filePath) {
    return new Promise((resolve, reject) => {
      wx.compressImage({
        src: filePath,
        quality: 68,
        success: (compressed) => {
          try {
            const fs = wx.getFileSystemManager();
            const base64 = fs.readFileSync(compressed.tempFilePath || filePath, "base64");
            if (!base64) throw new Error("图片读取失败");
            resolve(`data:image/jpeg;base64,${base64}`);
          } catch (error) {
            reject(error);
          }
        },
        fail: () => {
          try {
            const fs = wx.getFileSystemManager();
            const base64 = fs.readFileSync(filePath, "base64");
            resolve(`data:image/jpeg;base64,${base64}`);
          } catch (error) {
            reject(error);
          }
        }
      });
    });
  },

  localImageFileToDataUrl(filePath) {
    return new Promise((resolve, reject) => {
      try {
        const base64 = wx.getFileSystemManager().readFileSync(filePath, "base64");
        if (!base64) throw new Error("图片读取失败");
        resolve(`data:image/jpeg;base64,${base64}`);
      } catch (error) {
        reject(error);
      }
    });
  },

  async analyzeMealPhoto(photoId, options = {}) {
    const plan = ensurePlan(this.state, this.data.dateKey);
    const photo = (plan.afterPhotos || []).find((item) => item.id === photoId);
    if (!photo) return;
    const image =
      (this.photoImages && this.photoImages[photoId]) ||
      photo.image ||
      (photo.localImagePath ? await this.localImageFileToDataUrl(photo.localImagePath).catch(() => "") : "");
    if (!image) {
      this.patchPhoto(photoId, {
        analysisStatus: photo.analysis ? "done" : "failed",
        analysisError: "原图没有保存在本地，请重新上传后估算",
        shareStatus: "idle"
      });
      showToast("原图没有保存在本地，请重新上传");
      return;
    }
    const targets = planFoodTargets(this.state, plan);
    const targetNames = (photo.targetKeys || []).map((key) => photoTargetName(key, targets)).filter(Boolean);

    try {
      this.patchPhoto(photoId, { analysisStatus: "loading", analysisError: "" });
      const payload = await requestApi("/api/analyze-meal-photo", {
        image,
        targetNames,
        includeShareImage: false
      });
      this.patchPhoto(photoId, {
        analysis: payload.analysis,
        analysisStatus: "done",
        analysisError: "",
        shareStatus: options.autoShare ? "loading" : "idle"
      });

      if (options.autoShare) {
        await this.generateMealSharePhoto(photoId, { image, targetNames, analysis: payload.analysis, quiet: true });
      }
    } catch (error) {
      const latestPlan = ensurePlan(this.state, this.data.dateKey);
      const latestPhoto = (latestPlan.afterPhotos || []).find((item) => item.id === photoId) || photo;
      this.patchPhoto(photoId, {
        analysisStatus: latestPhoto.analysis ? "done" : "failed",
        analysisError: error.message || "热量估算失败",
        shareStatus: "failed",
        shareError: error.message || "分享图生成失败"
      });
      showToast(error.message || "热量估算失败");
    }
  },

  async retryPhoto(event) {
    const consented = await this.confirmAiPhotoProcessing("重新估算");
    if (!consented) return;
    this.analyzeMealPhoto(event.currentTarget.dataset.id, { autoShare: true });
  },

  async generateSharePhoto(event) {
    const consented = await this.confirmAiPhotoProcessing("开始生成");
    if (!consented) return;
    this.generateMealSharePhoto(event.currentTarget.dataset.id);
  },

  confirmAiPhotoProcessing(confirmText) {
    return new Promise((resolve) => {
      wx.showModal({
        title: "AI 照片处理说明",
        content:
          "你选择的餐桌照片将发送至开发者部署在中国内地的服务器，并由阿里云百炼的千问和图像生成模型完成菜品识别、热量估算及分享图生成。原始照片不会保存到家庭菜单数据库。请避免上传人物面部或其他无关个人信息。",
        confirmText,
        cancelText: "暂不使用",
        success: (result) => resolve(Boolean(result.confirm)),
        fail: () => resolve(false)
      });
    });
  },

  async generateMealSharePhoto(photoId, options = {}) {
    const plan = ensurePlan(this.state, this.data.dateKey);
    const photo = (plan.afterPhotos || []).find((item) => item.id === photoId);
    if (!photo) return;
    const analysis = options.analysis || photo.analysis;
    if (!analysis) {
      await this.analyzeMealPhoto(photoId, { autoShare: true });
      return;
    }
    const image =
      options.image ||
      (this.photoImages && this.photoImages[photoId]) ||
      photo.image ||
      (photo.localImagePath ? await this.localImageFileToDataUrl(photo.localImagePath).catch(() => "") : "");
    if (!image) {
      this.patchPhoto(photoId, { shareStatus: "failed", shareError: "原图没有保存在本地，请重新上传后生成分享图" });
      if (!options.quiet) showToast("原图没有保存在本地");
      return;
    }
    const targets = planFoodTargets(this.state, plan);
    const targetNames = options.targetNames || (photo.targetKeys || []).map((key) => photoTargetName(key, targets)).filter(Boolean);
    this.patchPhoto(photoId, { shareStatus: "loading", shareError: "", shareStartedAt: new Date().toISOString() });
    try {
      let sharePayload = await requestApi(
        "/api/analyze-meal-photo",
        {
          image,
          targetNames,
          includeShareImage: true,
          analysis
        },
        { timeout: 30000 }
      );
      const deadline = Date.now() + SHARE_TASK_MAX_WAIT_MS;
      while (!sharePayload.shareImage && sharePayload.shareTaskId) {
        if (!["PENDING", "RUNNING"].includes(sharePayload.shareStatus)) {
          throw new Error("分享图生成失败");
        }
        if (Date.now() >= deadline) throw new Error("分享图生成时间较长，请稍后重试");
        await wait(SHARE_TASK_POLL_INTERVAL_MS);
        sharePayload = await requestApi(
          "/api/analyze-meal-photo",
          {
            includeShareImage: true,
            analysis,
            shareTaskId: sharePayload.shareTaskId
          },
          { timeout: 30000 }
        );
      }
      this.patchPhoto(photoId, {
        shareImage: sharePayload.shareImage || "",
        shareStatus: sharePayload.shareImage ? "done" : "failed",
        shareError: sharePayload.shareImage ? "" : "分享图生成失败",
        shareStartedAt: null,
        shareCreatedAt: sharePayload.shareImage ? new Date().toISOString() : null
      });
      if (!options.quiet && sharePayload.shareImage) showToast("分享图已生成", "success");
    } catch (error) {
      this.patchPhoto(photoId, {
        shareStatus: "failed",
        shareError: error.message || "分享图生成失败",
        shareStartedAt: null
      });
      if (!options.quiet) showToast(error.message || "分享图生成失败");
    }
  },

  async saveSharePhoto(event) {
    const photoId = event.currentTarget.dataset.id;
    const plan = ensurePlan(this.state, this.data.dateKey);
    const photo = (plan.afterPhotos || []).find((item) => item.id === photoId);
    if (!photo || !photo.shareImage) {
      showToast("分享图还没生成");
      return;
    }
    try {
      await requirePrivacyAuthorization();
      wx.showLoading({ title: "保存图片" });
      const imagePath = await this.dataUrlToLocalImageFile(photo.shareImage, `${photoId}-share`);
      await this.saveImageToAlbum(imagePath);
      wx.hideLoading();
      showToast("已保存到相册", "success");
    } catch (error) {
      wx.hideLoading();
      showToast(error.message || "保存失败");
    }
  },

  openPrivacyContract() {
    if (!wx.openPrivacyContract) {
      showToast("请在微信中查看隐私保护指引");
      return;
    }
    wx.openPrivacyContract({
      fail: () => showToast("隐私保护指引暂时无法打开")
    });
  },

  saveImageToAlbum(filePath) {
    return new Promise((resolve, reject) => {
      wx.saveImageToPhotosAlbum({
        filePath,
        success: resolve,
        fail: (error) => {
          if (String(error.errMsg || "").includes("auth deny")) {
            wx.openSetting();
            reject(new Error("请允许保存到相册"));
            return;
          }
          reject(error);
        }
      });
    });
  },

  removePhoto(event) {
    const id = event.currentTarget.dataset.id;
    const plan = ensurePlan(this.state, this.data.dateKey);
    plan.afterPhotos = (plan.afterPhotos || []).filter((photo) => photo.id !== id);
    if (this.photoImages) delete this.photoImages[id];
    this.persistState();
  },

  patchPhoto(photoId, patch) {
    const plan = ensurePlan(this.state, this.data.dateKey);
    plan.afterPhotos = (plan.afterPhotos || []).map((photo) => (photo.id === photoId ? { ...photo, ...patch } : photo));
    this.persistState();
  }
});

function markPlanDraft(plan) {
  plan.submitted = false;
  plan.submittedAt = null;
  plan.notificationUnread = false;
}

function categoryClass(category) {
  if (category === "肉菜") return "meat";
  if (category === "蔬菜") return "green";
  if (category === "汤粥") return "soup";
  if (category === "早餐") return "breakfast";
  if (category === "主食") return "staple";
  return "quick";
}

function compactStateForStorage(state, options = {}) {
  const compacted = normalizeAppState(state);
  compacted.dishes = (compacted.dishes || []).map((dish) => compactDishForStorage(dish, options)).filter(Boolean);
  Object.keys(compacted.plans || {}).forEach((dateKey) => {
    const plan = compacted.plans[dateKey];
    plan.afterPhotos = (plan.afterPhotos || []).map((photo) => stripPhotoImages(photo, options)).filter(Boolean);
    plan.wishes = (plan.wishes || []).map((wish) => compactWishForStorage(wish, options)).filter(Boolean);
  });
  return compacted;
}

function compactDishForStorage(dish, options = {}) {
  if (!dish || typeof dish !== "object") return null;
  return {
    ...dish,
    image: compactImageValue(dish.image, dish.imageUrl, options),
    imageUrl: compactImageValue(dish.imageUrl, dish.image, options),
    stepDetails: Array.isArray(dish.stepDetails) ? dish.stepDetails.map((step) => compactStepForStorage(step, options)) : []
  };
}

function compactWishForStorage(wish, options = {}) {
  if (!wish || typeof wish !== "object") return null;
  return {
    ...wish,
    recipe: wish.recipe && typeof wish.recipe === "object" ? compactDishForStorage(wish.recipe, options) : wish.recipe || null
  };
}

function compactStepForStorage(step, options = {}) {
  const normalized = normalizeStepItem(step);
  return {
    ...normalized,
    image: compactImageValue(normalized.image, normalized.imageUrl, options),
    imageUrl: compactImageValue(normalized.imageUrl, normalized.image, options)
  };
}

function compactImageValue(value, fallback, options = {}) {
  const image = String(value || "").trim();
  const fallbackUrl = nonDataUrl(fallback);
  if (options.stripAllImages) return fallbackUrl;
  if (image.startsWith("data:image/")) return fallbackUrl;
  return image;
}

function stripPhotoImages(photo, options = {}) {
  const hadImage = Boolean(photo.image || photo.imageOmitted);
  const hadShareImage = Boolean(photo.shareImage || photo.shareOmitted);
  return {
    ...photo,
    image: "",
    localImagePath: options.stripLocalPhotoPaths ? "" : String(photo.localImagePath || ""),
    imageOmitted: hadImage,
    shareImage: "",
    shareOmitted: hadShareImage,
    shareStatus: photo.shareStatus === "done" ? "idle" : photo.shareStatus,
    shareStartedAt: photo.shareStatus === "done" ? null : photo.shareStartedAt || null,
    shareCreatedAt: photo.shareStatus === "done" ? null : photo.shareCreatedAt
  };
}

function dishImageSrc(dish) {
  const raw = String((dish && (dish.imageUrl || dish.image)) || "").trim();
  return imageSrcFromRaw(raw) || proxyImageUrl(fallbackImageUrl(dish));
}

function imageSrcFromRaw(rawValue) {
  const raw = String(rawValue || "").trim();
  if (!raw) return "";
  if (raw.startsWith("data:image/")) return raw;
  if (/^https?:\/\//i.test(raw)) return proxyImageUrl(raw);
  return "";
}

function proxyImageUrl(url) {
  const apiBase = (getApp().globalData.apiBase || "").replace(/\/+$/, "");
  return `${apiBase}/api/proxy-image?url=${encodeURIComponent(url)}`;
}

function fallbackImageUrl(dish = {}) {
  const name = String(dish.name || "");
  if (/粥|汤|羹/.test(name) || dish.category === "汤粥") {
    return "https://images.unsplash.com/photo-1547592166-23ac45744acd?auto=format&fit=crop&w=900&q=80";
  }
  if (/面|饭|粉|饼|主食/.test(name) || dish.category === "主食") {
    return "https://images.unsplash.com/photo-1612927601601-6638404737ce?auto=format&fit=crop&w=900&q=80";
  }
  if (/鸡|鸭|鱼|虾|肉|排骨|牛|羊|翅/.test(name) || dish.category === "肉菜") {
    return "https://images.unsplash.com/photo-1562967916-eb82221dfb92?auto=format&fit=crop&w=900&q=80";
  }
  if (/菜|豆|蚕豆|瓜|茄|椒|笋|菇|藕/.test(name) || dish.category === "蔬菜") {
    return "https://images.unsplash.com/photo-1584270354949-c26b0d5b4a0c?auto=format&fit=crop&w=900&q=80";
  }
  if (/蛋|早餐|吐司|三明治/.test(name) || dish.category === "早餐") {
    return "https://images.unsplash.com/photo-1525351484163-7529414344d8?auto=format&fit=crop&w=900&q=80";
  }
  return "https://images.unsplash.com/photo-1589927986089-35812388d1f4?auto=format&fit=crop&w=900&q=80";
}

function dishFromRecipe(recipe, fallbackName) {
  const name = String((recipe && recipe.name) || fallbackName || "新菜").trim().slice(0, 28);
  const category = inferCategory(name, recipe);
  const image = nonDataUrl(recipe && (recipe.imageUrl || recipe.image));
  const ingredients = Array.isArray(recipe && recipe.ingredients)
    ? recipe.ingredients.map(recipeIngredient).filter(Boolean).slice(0, 24)
    : [];
  return {
    id: `dish-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name,
    category,
    meals: category === "早餐" ? ["breakfast"] : ["lunch", "dinner"],
    time: Math.max(5, Math.min(180, Math.round(Number(recipe && recipe.time) || 20))),
    difficulty: Number(recipe && recipe.time) > 45 ? "周末" : Number(recipe && recipe.time) > 20 ? "稳妥" : "轻松",
    rating: 4,
    image,
    imageUrl: image,
    sourceUrl: String((recipe && recipe.sourceUrl) || "").trim(),
    ingredients,
    steps: Array.isArray(recipe && recipe.steps) ? recipe.steps.map((step) => String(step || "").trim()).filter(Boolean).slice(0, 12) : [],
    stepDetails: Array.isArray(recipe && recipe.stepDetails) ? recipe.stepDetails.map(normalizeStepItem).filter((step) => step.text || step.image || step.imageUrl).slice(0, 12) : [],
    note: String((recipe && recipe.note) || "从下厨房导入。").trim().slice(0, 80)
  };
}

function recipeIngredient(value) {
  const line = String(value || "").replace(/\s+/g, " ").trim();
  if (!line) return null;
  const match = line.match(/^(.{1,14}?)(?:\s+|：|:)(.{1,20})$/);
  const name = cleanIngredientName(match ? match[1] : line);
  if (!name) return null;
  return {
    name,
    amount: null,
    unit: "",
    amountText: match ? match[2].trim() : "",
    group: guessGroup(name)
  };
}

function cleanIngredientName(value) {
  return String(value || "")
    .replace(/[，,。；;、]+$/g, "")
    .replace(/^(主料|辅料|调料|配料)[:：]/, "")
    .trim()
    .slice(0, 18);
}

function inferCategory(name, recipe) {
  const text = `${name} ${(recipe && recipe.note) || ""}`;
  if (/早餐|饼|粥|包子|吐司|三明治/.test(text)) return "早餐";
  if (/汤|粥|羹/.test(text)) return "汤粥";
  if (/饭|面|粉|饺|馄饨|米线/.test(text)) return "主食";
  if (/鸡|鸭|鱼|虾|肉|牛|羊|排骨|翅/.test(text)) return "肉菜";
  if (/菜|瓜|豆|笋|菇|藕|茄|椒/.test(text)) return "蔬菜";
  return "快手菜";
}

function wishStatusText(wish) {
  if (wish.status === "searching") return "正在自动找下厨房高分菜谱";
  if (wish.status === "found") return "已找到下厨房高分参考";
  if (wish.status === "declined") return "这次不做";
  if (wish.status === "failed") return "搜索失败，可重新找";
  if (wish.status === "accepted") return "已接招";
  return "许愿菜";
}

function nonDataUrl(value) {
  const url = String(value || "").trim();
  return /^https?:\/\//i.test(url) ? url : "";
}

function dishStepItems(dish) {
  const details = Array.isArray(dish && dish.stepDetails) ? dish.stepDetails.map(normalizeStepItem) : [];
  const texts = Array.isArray(dish && dish.steps) ? dish.steps.map((step) => String(step || "").trim()).filter(Boolean) : [];
  if (details.some((step) => step.text || step.image || step.imageUrl)) {
    return details.map((step, index) => ({
      text: step.text || texts[index] || "",
      image: step.image || "",
      imageUrl: step.imageUrl || ""
    })).filter((step) => step.text || step.image || step.imageUrl);
  }
  return texts.map((text) => ({ text, image: "", imageUrl: "" }));
}

function normalizeStepItem(step) {
  if (typeof step === "string") return { text: step.trim(), image: "", imageUrl: "" };
  return {
    text: String((step && step.text) || "").trim(),
    image: String((step && step.image) || "").trim(),
    imageUrl: String((step && step.imageUrl) || "").trim()
  };
}

function stepImageSrc(step) {
  return imageSrcFromRaw((step && (step.imageUrl || step.image)) || "");
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function normalizeHouseholdCode(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeTab(value) {
  const tab = String(value || "").trim();
  return ["wife", "husband", "menu"].includes(tab) ? tab : "";
}
