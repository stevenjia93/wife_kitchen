const stateUtils = require("../../utils/state");
const { AUTH_KEY, loginWithWechat, requestApi, showToast, requirePrivacyAuthorization } = require("../../utils/api");
const SHARE_TASK_POLL_INTERVAL_MS = 5000;
const SHARE_TASK_MAX_WAIT_MS = 12 * 60 * 1000;
const MAX_RECIPE_STEPS = 32;
const MAX_HOUSEHOLD_COVER_BYTES = 850 * 1024;
const mealShortLabels = { breakfast: "早", lunch: "午", dinner: "晚" };

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
  normalizeMealKeys,
  ensurePlan,
  activeDishes,
  getDish,
  wishesForMeal,
  selectedDishCount,
  wishCount,
  mealItemCount,
  isMealTimeElapsed,
  elapsedMeals,
  actionableUnresolvedMeals,
  applyPreferredMealSkips,
  calendarDaysForMonth,
  canViewOrder,
  canUploadMealPhotos,
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
    authLoading: true,
    userDisplayName: "微信用户",
    householdId: "",
    householdName: "",
    householdRole: "member",
    households: [],
    newHouseholdName: "我的家庭",
    deletingHouseholdId: "",
    inviteReady: false,
    status: "正在微信登录",
    syncing: false,
    dateKey: todayKey(),
    meal: "dinner",
    category: "全部",
    menuMealFilter: "all",
    wishName: "",
    featuredIndex: 0,
    calendarOpen: false,
    calendarMonthKey: "",
    calendarTitle: "",
    calendarWeekdays: ["日", "一", "二", "三", "四", "五", "六"],
    calendarWeeks: [],
    mealSettingsOpen: false,
    menuOpen: false,
    recipeInput: "",
    recipeLoading: false,
    detailOpen: false,
    detailDish: null,
    detailRecipeLoading: false,
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
    this.hydratingPhotoKeys = new Set();
    this.resumingShareTasks = new Set();
    this.recipeRefreshes = new Set();
    this.remoteSaveTimer = null;
    const savedHousehold = wx.getStorageSync(HOUSEHOLD_KEY) || {};
    const role = options.role === "husband" ? "husband" : "wife";
    const activeTab = normalizeTab(options.tab) || role;
    this.setData({
      role,
      activeTab,
      status: "正在微信登录"
    });
    this.refreshView();
    this.initializeAccount({
      inviteToken: normalizeInviteToken(options.invite || ""),
      savedHousehold
    }).catch((error) => {
      this.setData({ authLoading: false, syncing: false, status: "登录失败" });
      showToast(error.message || "微信登录失败");
    });
  },

  onShow() {
    this.enableShareMenu();
    if (this.data.householdId) this.hydrateMealPhotosForDate(this.data.dateKey);
  },

  onPullDownRefresh() {
    if (!this.data.householdId) {
      wx.stopPullDownRefresh();
      return;
    }
    this.enterHousehold(
      { id: this.data.householdId, name: this.data.householdName, role: this.data.householdRole },
      { silent: true }
    ).finally(() => wx.stopPullDownRefresh());
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
      title: `加入${this.data.householdName || "我的家庭"}，一起安排今天吃什么`,
      path: `/pages/home/index?${this.shareQuery()}`
    };
  },

  onShareTimeline() {
    return {
      title: "老婆点菜老公做",
      query: this.shareQuery({ includeInvite: false })
    };
  },

  shareQuery(options = {}) {
    const role = this.data.role === "husband" ? "husband" : "wife";
    const tab = normalizeTab(this.data.activeTab) || role;
    const params = [`role=${encodeURIComponent(role)}`, `tab=${encodeURIComponent(tab)}`];
    if (options.includeInvite !== false && this.inviteToken) {
      params.push(`invite=${encodeURIComponent(this.inviteToken)}`);
    }
    return params.join("&");
  },

  loadLocalState(storageKey = STORAGE_KEY) {
    try {
      const saved = wx.getStorageSync(storageKey);
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
    const storageKey = this.activeStateStorageKey || STORAGE_KEY;
    try {
      wx.setStorageSync(storageKey, compacted);
    } catch {
      try {
        wx.removeStorageSync(storageKey);
        wx.setStorageSync(storageKey, compactStateForStorage(compacted, { stripAllImages: true }));
      } catch (error) {
        console.warn("本地状态保存失败", error);
      }
    }
  },

  queueRemoteSave() {
    if (!this.data.householdId) return;
    clearTimeout(this.remoteSaveTimer);
    this.remoteSaveTimer = setTimeout(() => {
      this.saveRemoteState().catch((error) => {
        this.setData({ status: "同步失败" });
        showToast(error.message || "同步失败");
      });
    }, 500);
  },

  async saveRemoteState() {
    if (!this.data.householdId) return;
    await requestApi("/api/miniprogram-state", {
      householdId: this.data.householdId,
      payload: compactStateForStorage(this.state, { stripLocalPhotoPaths: true })
    });
    this.setData({ status: `在线同步：${this.data.householdName}` });
  },

  refreshView() {
    const dateKey = this.data.dateKey;
    const plan = ensurePlan(this.state, dateKey);
    const preferredMeals = normalizeMealKeys(this.state.preferredMeals);
    const visibleMealKeys = mealOrder.filter(
      (meal) => preferredMeals.includes(meal) || mealItemCount(plan, meal) > 0
    );
    const activeMeal = visibleMealKeys.includes(this.data.meal)
      ? this.data.meal
      : visibleMealKeys[0] || preferredMeals[0] || "dinner";
    const elapsed = elapsedMeals(plan, dateKey).filter((meal) => visibleMealKeys.includes(meal));
    const elapsedSet = new Set(elapsed);
    const reopenedSet = new Set(
      mealOrder.filter(
        (meal) => plan.reopened[meal] && isMealTimeElapsed(meal, dateKey) && !plan.skipped[meal] && !mealItemCount(plan, meal)
      )
    );
    const pending = actionableUnresolvedMeals(plan, dateKey, new Date(), preferredMeals);
    const dishes = this.filteredDishes(activeMeal);
    const menuDishes = this.menuFilteredDishes();
    const featuredIndex = dishes.length ? Math.min(this.data.featuredIndex, dishes.length - 1) : 0;
    const activeDish = dishes[featuredIndex] || null;
    const orderVisible = canViewOrder(plan, dateKey);
    const activeTab = this.data.activeTab || this.data.role || "wife";
    const hasMenuDraft = selectedDishCount(plan) + wishCount(plan) > 0 || mealOrder.some((meal) => plan.skipped[meal]);
    const shopping = orderVisible ? aggregateShoppingList(this.state, plan) : [];
    const photos = (plan.afterPhotos || []).map((photo) => this.buildPhotoView(photo));
    const photoBusy = (plan.afterPhotos || []).some(
      (photo) => photo.analysisStatus === "loading" || photo.shareStatus === "loading"
    );
    const activeMealItems = this.buildMealItems(plan, activeMeal);
    const managedDishes = activeDishes(this.state)
      .slice()
      .sort((a, b) => (b.rating || 0) - (a.rating || 0) || String(a.name).localeCompare(String(b.name), "zh-CN"))
      .map((dish) => this.buildManagedDish(dish));

    this.setData({
      brandMark: activeTab === "husband" ? "厨" : activeTab === "menu" ? "菜" : "点",
      navTitle: activeTab === "husband" ? "老公厨房" : activeTab === "menu" ? "管理菜单" : "老婆点菜",
      navSubtitle: this.data.householdId ? this.data.status : this.data.authLoading ? "正在验证微信身份" : "创建家庭或接受邀请后开始点菜",
      householdCover: this.state.householdCover || "",
      hasHouseholdCover: Boolean(this.state.householdCover),
      coverActionText: this.state.householdCover ? "换封面" : "加封面",
      showWife: activeTab === "wife",
      showHusband: activeTab === "husband",
      showMenu: activeTab === "menu",
      showOrderConfirmation: activeTab === "wife" && plan.submitted,
      showPhotoPanel: activeTab === "wife",
      dateTitle: dayLabel(dateKey),
      dateMeta: buildDateMeta(dateKey, plan, pending, elapsed),
      meal: activeMeal,
      featuredIndex,
      editable: isEditableDate(dateKey),
      canSubmit: isEditableDate(dateKey) && !pending.length,
      pendingText: pending.map((meal) => mealLabels[meal]).join("、"),
      orderStatus: plan.submitted ? `已下单 ${formatTime(plan.submittedAt)}` : pending.length ? "还有餐次未决定" : "可以下单了",
      submittedTimeText: formatTime(plan.submittedAt),
      confirmationItemCount: selectedDishCount(plan) + wishCount(plan),
      mealTabs: visibleMealKeys.map((meal) => ({
        key: meal,
        label: mealLabels[meal],
        active: activeMeal === meal,
        skipped: plan.skipped[meal],
        elapsed: elapsedSet.has(meal),
        reopened: reopenedSet.has(meal),
        count: mealItemCount(plan, meal)
      })),
      preferredMealOptions: mealOrder.map((meal) => ({
        key: meal,
        label: mealLabels[meal],
        shortLabel: mealShortLabels[meal],
        selected: preferredMeals.includes(meal)
      })),
      menuMealFilterOptions: [
        { key: "all", label: "全部", selected: this.data.menuMealFilter === "all" },
        ...mealOrder.map((meal) => ({
          key: meal,
          label: mealLabels[meal],
          selected: this.data.menuMealFilter === meal
        }))
      ],
      activeMealLabel: mealLabels[activeMeal],
      activeMealSkipped: plan.skipped[activeMeal],
      activeMealElapsed: elapsedSet.has(activeMeal),
      activeMealReopened: reopenedSet.has(activeMeal),
      activeMealCount: mealItemCount(plan, activeMeal),
      activeMealItems,
      filteredDishes: dishes.map((dish, index) => this.buildDishThumb(dish, index, featuredIndex)),
      menuDishes: menuDishes.map((dish) => this.buildMenuDish(dish, plan, activeMeal)),
      managedDishes,
      activeDish: activeDish ? this.buildDishView(activeDish, plan, activeMeal) : null,
      selectedCurrent: Boolean(activeDish && plan[activeMeal].includes(activeDish.id)),
      wifeMeals: this.buildWifeMeals(plan, elapsedSet, visibleMealKeys),
      husbandMeals: this.buildHusbandMeals(plan, elapsedSet, visibleMealKeys),
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
      showUploadButton: isEditableDate(dateKey),
      photoPanelSubtitle: photos.length
        ? "重新上传只保留最新一张，并替换当前照片。"
        : "拍一张整桌照，先识别菜品并估算热量。",
      uploadPhotoText: photoBusy
        ? "照片处理中"
        : photos.length
          ? "重新上传整桌照"
          : "上传整桌照",
      uploadPhotoHint: "先展示热量识别，随后自动生成分享图",
      photos
    });
  },

  filteredDishes(meal = this.data.meal) {
    const category = this.data.category;
    return activeDishes(this.state)
      .filter((dish) => dish.meals.includes(meal))
      .filter((dish) => category === "全部" || dish.category === category)
      .sort((a, b) => (b.rating || 0) - (a.rating || 0) || (a.time || 0) - (b.time || 0));
  },

  menuFilteredDishes() {
    const filter = this.data.menuMealFilter;
    const category = this.data.category;
    return activeDishes(this.state)
      .filter((dish) => filter === "all" || dish.meals.includes(filter))
      .filter((dish) => category === "全部" || dish.category === category)
      .sort((a, b) => (b.rating || 0) - (a.rating || 0) || (a.time || 0) - (b.time || 0));
  },

  buildDishView(dish, plan, activeMeal = this.data.meal) {
    return {
      ...dish,
      imageSrc: dishImageSrc(dish),
      imageInitial: dish.name.slice(0, 1),
      ingredientText: (dish.ingredients || []).map(formatIngredient).slice(0, 8).join("、"),
      stepText: (dish.steps || []).slice(0, 3).join(" / "),
      palette: categoryClass(dish.category),
      selected: plan[activeMeal].includes(dish.id)
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

  buildMenuDish(dish, plan, activeMeal = this.data.meal) {
    return {
      id: dish.id,
      name: dish.name,
      note: dish.note || "按家里口味调整。",
      meta: `${dish.category} · ${dish.time} 分钟 · ${dish.difficulty}`,
      imageSrc: dishImageSrc(dish),
      imageInitial: dish.name.slice(0, 1),
      ingredientText: (dish.ingredients || []).map(formatIngredient).slice(0, 6).join("、"),
      mealText: (dish.meals || []).map((meal) => mealLabels[meal]).join(" / "),
      selected: (plan[activeMeal] || []).includes(dish.id)
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

  buildWifeMeals(plan, elapsedSet = new Set(), visibleMealKeys = mealOrder) {
    return visibleMealKeys.map((meal) => {
      const ids = plan[meal] || [];
      const wishes = wishesForMeal(plan, meal);
      return {
        meal,
        label: mealLabels[meal],
        skipped: plan.skipped[meal],
        elapsed: elapsedSet.has(meal),
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
        wishes: wishes.map((wish) => this.buildWishView(wish))
      };
    });
  },

  buildHusbandMeals(plan, elapsedSet = new Set(), visibleMealKeys = mealOrder) {
    return visibleMealKeys.map((meal) => {
      const ids = plan[meal] || [];
      const wishes = wishesForMeal(plan, meal);
      return {
        meal,
        label: mealLabels[meal],
        skipped: plan.skipped[meal],
        elapsed: elapsedSet.has(meal),
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
      recipeReady: ingredients.length > 0 && steps.length > 0,
      recipeName: recipe.name || wish.name,
      sourceUrl: recipe.sourceUrl || "",
      ratingText: recipe.searchRating ? `评分 ${recipe.searchRating}` : "",
      cookedText: recipe.searchCookedCount ? `${recipe.searchCookedCount} 人做过` : "",
      ingredientText: ingredients.slice(0, 10).join("、"),
      stepPreview: steps.slice(0, 3).map((text, index) => ({
        index: index + 1,
        text: cleanStepDisplayText(text)
      })),
      guideLabel: recipeGuideLabel(recipe.guideSource),
      error: wish.error || "暂时没找到参考菜谱。"
    };
  },

  buildManagedDish(dish) {
    return {
      id: dish.id,
      name: dish.name,
      meta: `${dish.category || "家常菜"} · ${dish.time || 20} 分钟 · ${(dish.meals || []).map((meal) => mealLabels[meal]).join("/")}`,
      imageSrc: dishImageSrc(dish),
      imageInitial: dish.name.slice(0, 1),
      ingredientText: (dish.ingredients || []).map(formatIngredient).slice(0, 6).join("、") || "还没有原料清单",
      sourceUrl: dish.sourceUrl || ""
    };
  },

  buildDishDetail(dish, options = {}) {
    const steps = dishStepItems(dish);
    const visibleSteps = steps.length ? steps : fallbackStepsForDish(dish);
    const meals = normalizeMealKeys(dish.meals);
    return {
      id: dish.id,
      name: dish.name,
      category: dish.category || "家常菜",
      meta: `${dish.time || 20} 分钟 · ${dish.difficulty || "家常"}`,
      note: dish.note || "按家里口味调整。",
      imageSrc: dishImageSrc(dish),
      imageInitial: dish.name.slice(0, 1),
      sourceUrl: dish.sourceUrl || "",
      canRefreshImages: dishNeedsStepImageRefresh(dish),
      canEditMeals:
        options.canEditMeals !== false && this.data.activeTab === "menu" && Boolean(getDish(this.state, dish.id)),
      mealOptions: mealOrder.map((meal) => ({
        key: meal,
        label: mealLabels[meal],
        shortLabel: mealShortLabels[meal],
        selected: meals.includes(meal)
      })),
      guideLabel: recipeGuideLabel(dish.guideSource),
      ingredients: (dish.ingredients || []).map((item) => ({ text: formatIngredient(item) })),
      steps: visibleSteps.map((step, index) => ({
        index: index + 1,
        text: cleanStepDisplayText(step.text) || "打开下厨房查看完整步骤。",
        imageSrc: stepImageSrc(step)
      }))
    };
  },

  buildPhotoView(photo) {
    const originalImage = photo.localImagePath || photo.image || (this.photoImages && this.photoImages[photo.id]) || "";
    const displayImage = photo.shareImage || originalImage || "";
    const analysis = photo.analysis || null;
    const shareStartedAt = Date.parse(photo.shareStartedAt || "");
    const shareElapsedMs = shareStartedAt ? Date.now() - shareStartedAt : 0;
    const shareStillRunning =
      photo.shareStatus === "loading" &&
      Boolean(photo.shareTaskId) &&
      (!shareStartedAt || shareElapsedMs < SHARE_TASK_MAX_WAIT_MS);
    const recognizedNames = analysis
      ? Array.from(new Set((analysis.items || []).map((item) => String(item.label || "").trim()).filter(Boolean))).slice(0, 6)
      : [];
    return {
      ...photo,
      displayImage,
      isSharePreview: Boolean(photo.shareImage),
      missingPhotoText: photo.remoteStored ? "正在恢复当天照片" : "原图尚未恢复",
      targetLabel: recognizedNames.join("、") || (photo.analysisStatus === "loading" ? "正在识别照片内容" : "整桌照片"),
      timeText: formatTime(photo.createdAt),
      totalCalories: analysis ? Math.round(analysis.totalCalories || 0) : 0,
      confidenceText: analysis ? confidenceText(analysis.confidence) : "",
      analysisItems: analysis ? (analysis.items || []).slice(0, 5) : [],
      canSaveShare: Boolean(photo.shareImage),
      canGenerateShare: Boolean(analysis && !photo.shareImage && (originalImage || photo.remoteStored) && !shareStillRunning),
      generateShareText: photo.shareStatus === "failed" ? "重新生成分享图" : "生成分享图",
      shareEtaText: shareStillRunning ? "通常 1–3 分钟，关闭后重新打开也会继续" : "",
      statusText:
        shareStillRunning
          ? "正在美化照片并添加手账标注"
          : photo.analysisStatus === "loading"
            ? "正在按照片识别菜品和热量"
            : ""
    };
  },

  async initializeAccount({ inviteToken, savedHousehold }) {
    this.setData({ authLoading: true, syncing: true, status: "正在微信登录" });
    let account = wx.getStorageSync(AUTH_KEY) || null;
    let payload = null;
    if (account?.token) {
      try {
        payload = await requestApi("/api/households", { action: "list" });
      } catch {
        wx.removeStorageSync(AUTH_KEY);
        account = null;
      }
    }
    if (!account?.token) {
      account = await loginWithWechat();
      payload = await requestApi("/api/households", { action: "list" });
    }

    let households = Array.isArray(payload.households) ? payload.households : [];
    let activeHousehold = null;
    let useLegacyLocal = false;

    if (inviteToken) {
      const joined = await requestApi("/api/households", { action: "join", inviteToken });
      activeHousehold = joined.household;
      households = mergeHouseholdList(households, activeHousehold);
      showToast(`已加入${activeHousehold.name}`, "success");
    }

    const savedId = String(savedHousehold?.id || savedHousehold?.householdId || "").trim();
    if (!activeHousehold && savedId) activeHousehold = households.find((item) => item.id === savedId) || null;

    const legacyCode = normalizeLegacyHouseholdCode(savedHousehold?.code || "");
    if (!activeHousehold && legacyCode) {
      try {
        const claimed = await requestApi("/api/households", { action: "claimLegacy", code: legacyCode });
        activeHousehold = claimed.household;
        households = mergeHouseholdList(households, activeHousehold);
        useLegacyLocal = true;
      } catch (error) {
        if (!/已完成迁移/.test(error.message || "")) throw error;
      }
    }

    if (!activeHousehold && households.length === 1) activeHousehold = households[0];
    this.setData({
      authLoading: false,
      syncing: false,
      userDisplayName: payload.user?.displayName || account.user?.displayName || "微信用户",
      households,
      status: activeHousehold ? "正在同步家庭菜单" : "请选择或创建家庭"
    });
    if (activeHousehold) await this.enterHousehold(activeHousehold, { silent: true, useLegacyLocal });
    else this.refreshView();
  },

  onHouseholdNameInput(event) {
    this.setData({ newHouseholdName: event.detail.value });
  },

  async createHousehold() {
    this.setData({ syncing: true });
    try {
      const payload = await requestApi("/api/households", {
        action: "create",
        name: this.data.newHouseholdName
      });
      const households = mergeHouseholdList(this.data.households, payload.household);
      this.setData({ households, syncing: false });
      await this.enterHousehold(payload.household);
    } catch (error) {
      this.setData({ syncing: false });
      showToast(error.message || "家庭创建失败");
    }
  },

  selectHousehold(event) {
    const household = this.data.households.find((item) => item.id === event.currentTarget.dataset.id);
    if (household) this.enterHousehold(household);
  },

  deleteHousehold(event) {
    const household = this.data.households.find((item) => item.id === event.currentTarget.dataset.id);
    if (!household || household.role !== "owner" || this.data.deletingHouseholdId) return;
    wx.showModal({
      title: `删除“${household.name}”？`,
      content: "确认删除后，该家庭及其中的菜单、点餐记录和图片记录都会消失，且无法恢复。",
      confirmText: "确认删除",
      confirmColor: "#d84a2b",
      cancelText: "取消",
      success: (result) => {
        if (result.confirm) this.confirmDeleteHousehold(household);
      }
    });
  },

  async confirmDeleteHousehold(household) {
    this.setData({ deletingHouseholdId: household.id, syncing: true });
    try {
      await requestApi("/api/households", {
        action: "delete",
        householdId: household.id
      });
      wx.removeStorageSync(`${STORAGE_KEY}:${household.id}`);
      const savedHousehold = wx.getStorageSync(HOUSEHOLD_KEY) || {};
      if (savedHousehold.id === household.id || savedHousehold.householdId === household.id) {
        wx.removeStorageSync(HOUSEHOLD_KEY);
      }
      this.setData({
        households: this.data.households.filter((item) => item.id !== household.id),
        deletingHouseholdId: "",
        syncing: false,
        status: "请选择或创建家庭"
      });
      showToast("家庭已删除", "success");
    } catch (error) {
      this.setData({ deletingHouseholdId: "", syncing: false });
      showToast(error.message || "删除失败");
    }
  },

  async enterHousehold(household, options = {}) {
    if (!household?.id) return;
    this.setData({ syncing: true, status: "正在进入家庭菜单...", inviteReady: false });
    try {
      const payload = await requestApi("/api/miniprogram-state", { householdId: household.id });
      const storageKey = `${STORAGE_KEY}:${household.id}`;
      const scopedState = wx.getStorageSync(storageKey);
      const nextState = payload.payload
        ? normalizeAppState(payload.payload)
        : options.useLegacyLocal
          ? this.state
          : scopedState
            ? normalizeAppState(scopedState)
            : createDefaultState();
      this.activeStateStorageKey = storageKey;
      this.state = normalizeAppState(compactStateForStorage(nextState));
      this.saveLocalState(this.state);
      wx.setStorageSync(HOUSEHOLD_KEY, { id: household.id, name: household.name, role: household.role });
      this.setData({
        householdId: household.id,
        householdName: household.name,
        householdRole: household.role || "member",
        status: `在线同步：${household.name}`,
        syncing: false
      });
      this.refreshView();
      this.hydrateMealPhotosForDate(this.data.dateKey);
      if (!payload.payload) await this.saveRemoteState();
      this.prepareHouseholdInvite();
      if (!options.silent) showToast(`已进入${household.name}`, "success");
    } catch (error) {
      this.setData({ syncing: false, status: "连接失败" });
      showToast(error.message || "连接失败");
    }
  },

  async prepareHouseholdInvite() {
    if (!this.data.householdId) return;
    try {
      const payload = await requestApi("/api/households", {
        action: "invite",
        householdId: this.data.householdId
      });
      this.inviteToken = payload.inviteToken || "";
      this.setData({ inviteReady: Boolean(this.inviteToken) });
    } catch {
      this.inviteToken = "";
      this.setData({ inviteReady: false });
    }
  },

  leaveHousehold() {
    wx.removeStorageSync(HOUSEHOLD_KEY);
    this.activeStateStorageKey = null;
    this.inviteToken = "";
    this.setData({
      householdId: "",
      householdName: "",
      householdRole: "member",
      inviteReady: false,
      status: "请选择或创建家庭"
    });
    this.refreshView();
  },

  switchRole(event) {
    const role = event.currentTarget.dataset.role || "wife";
    this.setData({ role, activeTab: role }, () => this.refreshView());
  },

  switchTab(event) {
    const tab = event.currentTarget.dataset.tab || "wife";
    const role = tab === "husband" ? "husband" : tab === "wife" ? "wife" : this.data.role;
    this.setData(
      { activeTab: tab, role, calendarOpen: false, mealSettingsOpen: false, menuOpen: false, detailOpen: false },
      () => this.refreshView()
    );
  },

  shiftDate(event) {
    const days = Number(event.currentTarget.dataset.days || 0);
    const date = dateFromKey(this.data.dateKey);
    date.setDate(date.getDate() + days);
    const dateKey = dateKeyFromDate(date);
    this.setData({ dateKey, featuredIndex: 0, menuOpen: false }, () => {
      this.refreshView();
      this.hydrateMealPhotosForDate(dateKey);
    });
  },

  goToday() {
    const dateKey = todayKey();
    this.setData({ dateKey, featuredIndex: 0, menuOpen: false }, () => {
      this.refreshView();
      this.hydrateMealPhotosForDate(dateKey);
    });
  },

  openCalendar() {
    const monthKey = this.data.dateKey.slice(0, 7);
    this.setData({ calendarOpen: true, ...this.calendarViewData(monthKey) });
  },

  closeCalendar() {
    this.setData({ calendarOpen: false });
  },

  shiftCalendarMonth(event) {
    const months = Number(event.currentTarget.dataset.months || 0);
    const date = dateFromKey(`${this.data.calendarMonthKey || this.data.dateKey.slice(0, 7)}-01`);
    date.setMonth(date.getMonth() + months);
    this.setData(this.calendarViewData(dateKeyFromDate(date).slice(0, 7)));
  },

  selectCalendarDate(event) {
    const dateKey = String(event.currentTarget.dataset.key || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return;
    this.setData({
      dateKey,
      calendarOpen: false,
      featuredIndex: 0,
      menuOpen: false,
      detailOpen: false
    }, () => {
      this.refreshView();
      this.hydrateMealPhotosForDate(dateKey);
    });
  },

  calendarViewData(monthKey) {
    const [year, month] = monthKey.split("-").map(Number);
    return {
      calendarMonthKey: monthKey,
      calendarTitle: `${year}年${month}月`,
      calendarWeeks: chunkCalendarWeeks(
        calendarDaysForMonth(monthKey, this.state.plans, this.data.dateKey, todayKey())
      )
    };
  },

  selectMeal(event) {
    this.setData({ meal: event.currentTarget.dataset.meal || "dinner", featuredIndex: 0 }, () => this.refreshView());
  },

  openMealSettings() {
    this.setData({ mealSettingsOpen: true });
  },

  closeMealSettings() {
    this.setData({ mealSettingsOpen: false });
  },

  async changeHouseholdCover() {
    if (!this.data.householdId) return;
    try {
      await requirePrivacyAuthorization();
    } catch (error) {
      showToast(error.message);
      return;
    }
    wx.chooseMedia({
      count: 1,
      mediaType: ["image"],
      sourceType: ["album", "camera"],
      sizeType: ["compressed"],
      success: async (result) => {
        const filePath = result.tempFiles && result.tempFiles[0] && result.tempFiles[0].tempFilePath;
        if (!filePath) return;
        try {
          wx.showLoading({ title: "更新封面" });
          const cover = await this.coverFileToDataUrl(filePath);
          this.state.householdCover = cover;
          this.persistState();
          wx.hideLoading();
          showToast("家庭封面已更新", "success");
        } catch (error) {
          wx.hideLoading();
          showToast(error.message || "封面更新失败");
        }
      }
    });
  },

  togglePreferredMeal(event) {
    const meal = event.currentTarget.dataset.meal;
    if (!mealOrder.includes(meal)) return;
    const current = normalizeMealKeys(this.state.preferredMeals);
    const selected = current.includes(meal);
    if (selected && current.length === 1) return showToast("至少保留一个常用餐次");
    this.state.preferredMeals = selected
      ? current.filter((item) => item !== meal)
      : mealOrder.filter((item) => current.includes(item) || item === meal);
    this.persistState();
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
      plan.reopened[meal] = false;
      plan[meal] = [];
      plan.wishes = (plan.wishes || []).filter((wish) => wish.meal !== meal);
    } else if (elapsedMeals(plan, this.data.dateKey).includes(meal)) {
      plan.reopened[meal] = true;
    }
    markPlanDraft(plan);
    this.persistState();
  },

  reopenElapsedMeal() {
    if (!isEditableDate(this.data.dateKey)) return showToast("历史日期只能查看");
    const plan = ensurePlan(this.state, this.data.dateKey);
    plan.reopened[this.data.meal] = true;
    markPlanDraft(plan);
    this.persistState();
  },

  keepMealElapsed() {
    const plan = ensurePlan(this.state, this.data.dateKey);
    plan.reopened[this.data.meal] = false;
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
    this.setData({ menuOpen: true, menuMealFilter: "all" }, () => this.refreshView());
  },

  closeMenuSheet() {
    this.setData({ menuOpen: false });
  },

  setMenuMealFilter(event) {
    const filter = event.currentTarget.dataset.meal || "all";
    if (filter !== "all" && !mealOrder.includes(filter)) return;
    this.setData({ menuMealFilter: filter }, () => this.refreshView());
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
      detailDish: this.buildDishDetail(dish),
      detailRecipeLoading: false
    });
    if (dishNeedsStepImageRefresh(dish)) this.refreshDishRecipe(dishId);
  },

  refreshDishRecipeByTap(event) {
    this.refreshDishRecipe(event.currentTarget.dataset.id, { showResult: true });
  },

  async refreshDishRecipe(dishId, options = {}) {
    if (!dishId || this.recipeRefreshes.has(dishId)) return;
    const index = (this.state.dishes || []).findIndex((item) => item.id === dishId);
    const dish = index >= 0 ? this.state.dishes[index] : null;
    if (!dish?.sourceUrl) return;

    this.recipeRefreshes.add(dishId);
    if (this.data.detailOpen && this.data.detailDish?.id === dishId) {
      this.setData({ detailRecipeLoading: true });
    }
    try {
      const payload = await requestApi("/api/import-recipe", {
        url: dish.sourceUrl,
        includeImages: false,
        includeStepImages: false
      });
      const nextDish = mergeDishRecipeData(dish, payload.recipe);
      if (dishStepImageCount(nextDish) > dishStepImageCount(dish)) {
        this.state.dishes[index] = nextDish;
        this.persistState();
        if (this.data.detailOpen && this.data.detailDish?.id === dishId) {
          this.setData({ detailDish: this.buildDishDetail(nextDish) });
        }
        showToast("已补齐图文步骤", "success");
      } else if (options.showResult) {
        showToast("暂时没有读到步骤图");
      }
    } catch (error) {
      if (options.showResult) showToast(error.message || "图文步骤更新失败");
    } finally {
      this.recipeRefreshes.delete(dishId);
      if (this.data.detailOpen && this.data.detailDish?.id === dishId) {
        this.setData({ detailRecipeLoading: false });
      }
    }
  },

  openWishDetail(event) {
    const found = this.findWishLocation(event.currentTarget.dataset.id);
    if (!found?.wish?.recipe) return showToast("做法还在整理中");
    const dish = dishFromRecipe(found.wish.recipe, found.wish.name);
    dish.meals = [found.wish.meal];
    dish.note = found.wish.recipe.note || "根据高分菜谱整理的家庭参考做法。";
    dish.guideSource = found.wish.recipe.guideSource || "";
    this.setData({ detailOpen: true, detailDish: this.buildDishDetail(dish, { canEditMeals: false }) });
  },

  toggleDishMeal(event) {
    const dishId = this.data.detailDish?.id;
    const meal = event.currentTarget.dataset.meal;
    const dish = getDish(this.state, dishId);
    if (!dish || !mealOrder.includes(meal)) return;
    const current = normalizeMealKeys(dish.meals);
    const selected = current.includes(meal);
    if (selected && current.length === 1) return showToast("至少选择一个适合餐次");
    dish.meals = selected
      ? current.filter((item) => item !== meal)
      : mealOrder.filter((item) => current.includes(item) || item === meal);
    this.persistState();
    this.setData({ detailDish: this.buildDishDetail(getDish(this.state, dishId)) });
  },

  closeDishDetail() {
    this.setData({ detailOpen: false, detailDish: null, detailRecipeLoading: false });
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
      seenRecipeNames: [],
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

  async searchWishRecipe(dateKey, wishId, options = {}) {
    const current = this.findWishLocation(wishId, dateKey);
    if (!current) return;
    current.wish.status = "searching";
    current.wish.error = "";
    current.wish.searchStartedAt = new Date().toISOString();
    this.persistState();
    try {
      const payload = await requestApi("/api/search-recipe", {
        query: current.wish.name,
        alternative: options.alternative === true,
        excludeNames: current.wish.seenRecipeNames || [],
        includeImages: false,
        includeStepImages: false
      });
      const latest = this.findWishLocation(wishId, dateKey);
      if (!latest) return;
      latest.wish.status = "found";
      latest.wish.recipe = payload.recipe || null;
      latest.wish.seenRecipeNames = rememberRecipeName(
        latest.wish.seenRecipeNames,
        latest.wish.recipe?.name
      );
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
    found.wish.seenRecipeNames = rememberRecipeName(
      found.wish.seenRecipeNames,
      found.wish.recipe?.name || found.wish.name
    );
    found.wish.recipe = null;
    this.searchWishRecipe(found.dateKey, wishId, { alternative: true });
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
    const preferredMeals = normalizeMealKeys(this.state.preferredMeals);
    applyPreferredMealSkips(plan, preferredMeals);
    const pending = actionableUnresolvedMeals(plan, this.data.dateKey, new Date(), preferredMeals);
    if (pending.length) return showToast(`还有 ${pending.map((meal) => mealLabels[meal]).join("、")} 未决定`);
    plan.submitted = true;
    plan.submittedAt = new Date().toISOString();
    plan.notificationUnread = true;
    this.persistState();
  },

  editSubmittedOrder() {
    const plan = ensurePlan(this.state, this.data.dateKey);
    markPlanDraft(plan);
    this.persistState();
  },

  goKitchenAfterOrder() {
    this.setData({ role: "husband", activeTab: "husband", menuOpen: false, detailOpen: false }, () => this.refreshView());
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
      if (!isEditableDate(this.data.dateKey)) showToast("历史日期不能再上传照片");
      else showToast("当前照片还在处理中");
      return;
    }
    const previousPhotos = [...(plan.afterPhotos || [])];
    if (previousPhotos.length && !(await this.confirmPhotoReplacement())) return;
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
        if (!filePath) {
          showToast("没有读取到所选照片，请重新选择");
          return;
        }
        const photoId = `photo-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const photo = {
          id: photoId,
          dateKey: this.data.dateKey,
          image: "",
          localImagePath: filePath,
          imageOmitted: true,
          createdAt: new Date().toISOString(),
          analysisStatus: "loading",
          shareStatus: "idle",
          shareTaskId: "",
          remoteStored: false,
          shareStored: false
        };
        previousPhotos.forEach((item) => this.discardPhotoAssets(item));
        plan.afterPhotos = [photo];
        this.refreshView();
        showToast("照片已选择，正在识别");
        this.persistState();
        try {
          const image = await this.imageFileToDataUrl(filePath);
          const localImagePath = await this.dataUrlToLocalImageFile(image, photoId).catch(() => "");
          this.photoImages[photo.id] = image;
          this.patchPhoto(photo.id, { localImagePath: localImagePath || filePath }, photo.dateKey);
          this.analyzeMealPhoto(photo.id);
        } catch (error) {
          this.patchPhoto(photo.id, {
            analysisStatus: "failed",
            analysisError: error.message || "照片处理失败",
            shareStatus: "idle"
          }, photo.dateKey);
          showToast(error.message || "照片处理失败");
        }
      },
      fail: (error) => {
        if (!/cancel/i.test(String(error.errMsg || ""))) showToast(error.errMsg || "照片选择失败");
      }
    });
  },

  confirmPhotoReplacement() {
    return new Promise((resolve) => {
      wx.showModal({
        title: "重新上传照片？",
        content: "新照片会替换上一张，之前的识别结果和分享图也会作废。",
        confirmText: "替换上传",
        confirmColor: "#d84a2b",
        cancelText: "保留原图",
        success: (result) => resolve(Boolean(result.confirm)),
        fail: () => resolve(false)
      });
    });
  },

  discardPhotoAssets(photo) {
    if (!photo) return;
    if (this.photoImages) delete this.photoImages[photo.id];
    const filePath = String(photo.localImagePath || "");
    if (!filePath || !filePath.startsWith(wx.env.USER_DATA_PATH)) return;
    wx.getFileSystemManager().unlink({ filePath, fail() {} });
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
      let settled = false;
      const readImage = (targetPath) => {
        if (settled) return;
        try {
          const fs = wx.getFileSystemManager();
          const base64 = fs.readFileSync(targetPath || filePath, "base64");
          if (!base64) throw new Error("图片读取失败");
          if (base64.length > 2_300_000) throw new Error("照片太大，请裁剪后重新上传");
          settled = true;
          clearTimeout(timeoutId);
          resolve(`data:image/jpeg;base64,${base64}`);
        } catch (error) {
          settled = true;
          clearTimeout(timeoutId);
          reject(error);
        }
      };
      const timeoutId = setTimeout(() => readImage(filePath), 12_000);
      try {
        wx.compressImage({
          src: filePath,
          quality: 64,
          compressedWidth: 1600,
          compressedHeight: 1600,
          success: (compressed) => readImage(compressed.tempFilePath || filePath),
          fail: () => readImage(filePath)
        });
      } catch {
        readImage(filePath);
      }
    });
  },

  coverFileToDataUrl(filePath) {
    return new Promise((resolve, reject) => {
      const readCover = (targetPath) => {
        try {
          const base64 = wx.getFileSystemManager().readFileSync(targetPath || filePath, "base64");
          if (!base64) throw new Error("封面读取失败");
          if (Math.ceil(base64.length * 0.75) > MAX_HOUSEHOLD_COVER_BYTES) {
            throw new Error("封面图片太大，请换一张更简洁的照片");
          }
          resolve(`data:image/jpeg;base64,${base64}`);
        } catch (error) {
          reject(error);
        }
      };
      wx.compressImage({
        src: filePath,
        quality: 64,
        compressedWidth: 1200,
        compressedHeight: 720,
        success: (compressed) => readCover(compressed.tempFilePath || filePath),
        fail: () => readCover(filePath)
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

  async analyzeMealPhoto(photoId) {
    const currentPlan = ensurePlan(this.state, this.data.dateKey);
    const currentPhoto = (currentPlan.afterPhotos || []).find((item) => item.id === photoId);
    const dateKey = currentPhoto?.dateKey || this.data.dateKey;
    const plan = ensurePlan(this.state, dateKey);
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
      }, dateKey);
      showToast("原图没有保存在本地，请重新上传");
      return;
    }
    try {
      this.patchPhoto(photoId, { analysisStatus: "loading", analysisError: "" }, dateKey);
      const payload = await requestApi("/api/analyze-meal-photo", {
        householdId: this.data.householdId,
        dateKey,
        photoId,
        image,
        includeShareImage: true
      });
      const shareRunning = Boolean(payload.shareTaskId) && ["PENDING", "RUNNING"].includes(payload.shareStatus);
      this.patchPhoto(photoId, {
        analysis: payload.analysis,
        analysisStatus: "done",
        analysisError: "",
        shareImage: payload.shareImage || "",
        shareStatus: payload.shareImage ? "done" : shareRunning ? "loading" : "failed",
        shareError: payload.shareError || (shareRunning ? "" : "分享图任务启动失败，可以稍后重试"),
        shareTaskId: payload.shareTaskId || "",
        shareRemoteStatus: payload.shareStatus || "",
        shareStartedAt: shareRunning ? new Date().toISOString() : null,
        remoteStored: true
      }, dateKey);
      if (shareRunning) {
        await this.generateMealSharePhoto(photoId, { image, analysis: payload.analysis, quiet: true, dateKey });
      } else if (payload.shareError) {
        showToast("热量识别完成，分享图生成失败，可稍后重试");
      }
    } catch (error) {
      const latestPlan = ensurePlan(this.state, dateKey);
      const latestPhoto = (latestPlan.afterPhotos || []).find((item) => item.id === photoId) || photo;
      this.patchPhoto(photoId, {
        analysisStatus: latestPhoto.analysis ? "done" : "failed",
        analysisError: error.message || "热量估算失败",
        shareStatus: "idle"
      }, dateKey);
      showToast(error.message || "热量估算失败");
    }
  },

  async retryPhoto(event) {
    const consented = await this.confirmAiPhotoProcessing("重新估算");
    if (!consented) return;
    this.analyzeMealPhoto(event.currentTarget.dataset.id);
  },

  async generateSharePhoto(event) {
    this.generateMealSharePhoto(event.currentTarget.dataset.id);
  },

  confirmAiPhotoProcessing(confirmText) {
    return new Promise((resolve) => {
      wx.showModal({
        title: "AI 照片处理说明",
        content:
          "你选择的餐桌照片将发送至开发者部署在中国内地的服务器，并由阿里云百炼完成菜品识别、热量估算及分享图生成。原图、识别结果和分享图会按家庭和日期保存，供家庭成员回看；重新上传、删除照片或删除家庭时会一并删除。请避免上传人物面部或其他无关个人信息。",
        confirmText,
        cancelText: "暂不使用",
        success: (result) => resolve(Boolean(result.confirm)),
        fail: () => resolve(false)
      });
    });
  },

  async generateMealSharePhoto(photoId, options = {}) {
    const dateKey = options.dateKey || this.data.dateKey;
    const taskKey = `${dateKey}:${photoId}`;
    if (this.resumingShareTasks?.has(taskKey)) return;
    const plan = ensurePlan(this.state, dateKey);
    const photo = (plan.afterPhotos || []).find((item) => item.id === photoId);
    if (!photo) return;
    const analysis = options.analysis || photo.analysis;
    if (!analysis) {
      showToast("请先完成照片识别");
      return;
    }
    const image =
      options.image ||
      (this.photoImages && this.photoImages[photoId]) ||
      photo.image ||
      (photo.localImagePath ? await this.localImageFileToDataUrl(photo.localImagePath).catch(() => "") : "");
    if (!image && !photo.remoteStored) {
      this.patchPhoto(photoId, { shareStatus: "failed", shareError: "原图没有保存成功，请重新上传后生成分享图" }, dateKey);
      if (!options.quiet) showToast("原图没有保存在本地");
      return;
    }
    this.resumingShareTasks?.add(taskKey);
    this.patchPhoto(photoId, {
      shareStatus: "loading",
      shareError: "",
      shareStartedAt: photo.shareStartedAt || new Date().toISOString()
    }, dateKey);
    try {
      let sharePayload;
      if (photo.shareTaskId) {
        sharePayload = {
          shareTaskId: photo.shareTaskId,
          shareStatus: photo.shareRemoteStatus || "RUNNING",
          shareImage: ""
        };
      } else {
        sharePayload = await requestApi(
          "/api/analyze-meal-photo",
          {
            householdId: this.data.householdId,
            dateKey,
            photoId,
            ...(image ? { image } : {}),
            includeShareImage: true,
            analysis
          },
          { timeout: 30000 }
        );
        this.patchPhoto(photoId, {
          shareTaskId: sharePayload.shareTaskId || "",
          shareRemoteStatus: sharePayload.shareStatus || "PENDING",
          remoteStored: true
        }, dateKey);
      }
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
            householdId: this.data.householdId,
            dateKey,
            photoId,
            includeShareImage: true,
            analysis,
            shareTaskId: sharePayload.shareTaskId
          },
          { timeout: 30000 }
        );
        this.patchPhoto(photoId, {
          shareTaskId: sharePayload.shareTaskId || "",
          shareRemoteStatus: sharePayload.shareStatus || "RUNNING"
        }, dateKey);
      }
      this.patchPhoto(photoId, {
        shareImage: sharePayload.shareImage || "",
        shareOmitted: Boolean(sharePayload.shareImage),
        shareStored: Boolean(sharePayload.shareImage),
        shareStatus: sharePayload.shareImage ? "done" : "failed",
        shareError: sharePayload.shareImage ? "" : "分享图生成失败",
        shareTaskId: sharePayload.shareTaskId || "",
        shareRemoteStatus: sharePayload.shareStatus || "",
        shareStartedAt: null,
        shareCreatedAt: sharePayload.shareImage ? new Date().toISOString() : null
      }, dateKey);
      if (!options.quiet && sharePayload.shareImage) showToast("分享图已生成", "success");
    } catch (error) {
      const stillRunning = /生成时间较长/.test(String(error.message || ""));
      this.patchPhoto(photoId, {
        shareStatus: stillRunning ? "loading" : "failed",
        shareError: stillRunning ? "分享图仍在云端生成，重新打开后会继续获取" : error.message || "分享图生成失败",
        shareStartedAt: stillRunning ? null : photo.shareStartedAt || null
      }, dateKey);
      if (!options.quiet) showToast(error.message || "分享图生成失败");
    } finally {
      this.resumingShareTasks?.delete(taskKey);
    }
  },

  async hydrateMealPhotosForDate(dateKey = this.data.dateKey) {
    if (!this.data.householdId) return;
    const plan = ensurePlan(this.state, dateKey);
    const photos = [...(plan.afterPhotos || [])];
    for (const photo of photos) {
      const hydrateKey = `${dateKey}:${photo.id}`;
      const needsMedia = !photo.shareImage || !(this.photoImages && this.photoImages[photo.id]);
      if (!needsMedia || this.hydratingPhotoKeys?.has(hydrateKey)) continue;
      this.hydratingPhotoKeys?.add(hydrateKey);
      try {
        const payload = await requestApi(
          "/api/analyze-meal-photo",
          {
            action: "load",
            householdId: this.data.householdId,
            dateKey,
            photoId: photo.id
          },
          { timeout: 30000 }
        );
        if (payload.image) this.photoImages[photo.id] = payload.image;
        const remoteRunning = ["PENDING", "RUNNING"].includes(payload.shareStatus);
        this.patchPhoto(photo.id, {
          analysis: payload.analysis || photo.analysis,
          analysisStatus: payload.analysis ? "done" : photo.analysisStatus === "loading" ? "failed" : photo.analysisStatus,
          analysisError:
            payload.analysis || photo.analysisStatus !== "loading" ? photo.analysisError : "识别未完成，可以重新估算",
          shareImage: payload.shareImage || "",
          shareOmitted: Boolean(payload.shareImage || photo.shareOmitted),
          shareStored: Boolean(payload.shareImage),
          shareStatus: payload.shareImage ? "done" : remoteRunning ? "loading" : photo.shareStatus,
          shareTaskId: payload.shareTaskId || photo.shareTaskId || "",
          shareRemoteStatus: payload.shareStatus || photo.shareRemoteStatus || "",
          shareCreatedAt: payload.shareCreatedAt || photo.shareCreatedAt || null,
          remoteStored: true
        }, dateKey);
        if (!payload.shareImage && (payload.analysis || photo.analysis)) {
          this.generateMealSharePhoto(photo.id, {
            analysis: payload.analysis || photo.analysis,
            dateKey,
            quiet: true
          });
        }
      } catch (error) {
        if (!/没有找到当天的照片记录/.test(String(error.message || ""))) {
          console.warn("恢复餐桌照片失败", error);
        }
      } finally {
        this.hydratingPhotoKeys?.delete(hydrateKey);
        if (dateKey === this.data.dateKey) this.refreshView();
      }
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

  async removePhoto(event) {
    const id = event.currentTarget.dataset.id;
    const dateKey = this.data.dateKey;
    const plan = ensurePlan(this.state, dateKey);
    const photo = (plan.afterPhotos || []).find((item) => item.id === id);
    this.discardPhotoAssets(photo);
    plan.afterPhotos = (plan.afterPhotos || []).filter((photo) => photo.id !== id);
    this.persistState();
    if (photo?.remoteStored) {
      requestApi("/api/analyze-meal-photo", {
        action: "delete",
        householdId: this.data.householdId,
        dateKey,
        photoId: id
      }).catch(() => showToast("照片记录删除同步失败，请稍后重试"));
    }
  },

  patchPhoto(photoId, patch, dateKey = this.data.dateKey) {
    const plan = ensurePlan(this.state, dateKey);
    plan.afterPhotos = (plan.afterPhotos || []).map((photo) => (photo.id === photoId ? { ...photo, ...patch } : photo));
    this.persistState();
  }
});

function markPlanDraft(plan) {
  plan.submitted = false;
  plan.submittedAt = null;
  plan.notificationUnread = false;
}

function buildDateMeta(dateKey, plan, pending, elapsed) {
  const parts = [dateModeText(dateKey), `${selectedDishCount(plan) + wishCount(plan)} 项已选`];
  if (elapsed.length) parts.push(`${elapsed.length} 餐已过`);
  parts.push(pending.length ? `${pending.length} 餐待定` : "当前无需再决定");
  return parts.join(" · ");
}

function rememberRecipeName(value, name) {
  const names = Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean) : [];
  const nextName = String(name || "").trim();
  if (nextName) names.push(nextName);
  return Array.from(new Set(names)).slice(-16);
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
  if (options.stripAllImages) compacted.householdCover = "";
  compacted.dishes = (compacted.dishes || []).map((dish) => compactDishForStorage(dish, options)).filter(Boolean);
  Object.keys(compacted.plans || {}).forEach((dateKey) => {
    const plan = compacted.plans[dateKey];
    plan.afterPhotos = (plan.afterPhotos || []).map((photo) => stripPhotoImages(photo, options)).filter(Boolean);
    plan.wishes = (plan.wishes || []).map((wish) => compactWishForStorage(wish, options)).filter(Boolean);
  });
  return compacted;
}

function chunkCalendarWeeks(days) {
  const calendarDays = Array.isArray(days) ? days : [];
  return Array.from({ length: 6 }, (_, index) => ({
    id: `calendar-week-${index}`,
    days: calendarDays.slice(index * 7, index * 7 + 7)
  }));
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
    shareStatus: photo.shareStatus,
    shareStartedAt: photo.shareStartedAt || null,
    shareCreatedAt: photo.shareCreatedAt || null
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
    guideSource: String((recipe && recipe.guideSource) || "").trim(),
    ingredients,
    steps: Array.isArray(recipe && recipe.steps) ? recipe.steps.map(cleanStepDisplayText).filter(Boolean).slice(0, MAX_RECIPE_STEPS) : [],
    stepDetails: Array.isArray(recipe && recipe.stepDetails) ? recipe.stepDetails.map(normalizeStepItem).filter((step) => step.text || step.image || step.imageUrl).slice(0, MAX_RECIPE_STEPS) : [],
    note: String((recipe && recipe.note) || "从下厨房导入。").trim().slice(0, 80)
  };
}

function fallbackStepsForDish(dish = {}) {
  const ingredients = (dish.ingredients || []).map((item) => item.name).filter(Boolean);
  const ingredientText = ingredients.slice(0, 5).join("、") || "食材";
  return [
    { text: `准备${ingredientText}，洗净切配并把调味料放在手边。`, image: "", imageUrl: "" },
    { text: "锅烧热后按食材成熟速度依次下锅，先处理较难熟的主料。", image: "", imageUrl: "" },
    { text: "加入调味料翻炒或焖煮至熟，过程中少量多次调整咸淡。", image: "", imageUrl: "" },
    { text: "确认食材熟透后收汁或关火，装盘后趁热享用。", image: "", imageUrl: "" }
  ];
}

function recipeGuideLabel(source) {
  if (source === "qwen") return "参考做法";
  if (source === "local") return "家庭参考做法";
  return "小程序内做法";
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

function dishStepImageCount(dish) {
  return dishStepItems(dish).filter((step) => /^https?:\/\//i.test(String(step.imageUrl || step.image || ""))).length;
}

function dishNeedsStepImageRefresh(dish) {
  if (!dish?.sourceUrl) return false;
  const steps = dishStepItems(dish);
  const imageCount = dishStepImageCount(dish);
  if (steps.length && imageCount >= steps.length) return false;
  const checkedAt = Date.parse(dish.recipeImagesCheckedAt || "");
  return !checkedAt || Date.now() - checkedAt > 7 * 24 * 60 * 60 * 1000;
}

function mergeDishRecipeData(dish, recipe = {}) {
  const incomingSteps = Array.isArray(recipe.steps)
    ? recipe.steps.map(cleanStepDisplayText).filter(Boolean).slice(0, MAX_RECIPE_STEPS)
    : [];
  const incomingDetails = Array.isArray(recipe.stepDetails)
    ? recipe.stepDetails.map(normalizeStepItem).filter((step) => step.text || step.image || step.imageUrl).slice(0, MAX_RECIPE_STEPS)
    : [];
  const incomingIngredients = Array.isArray(recipe.ingredients)
    ? recipe.ingredients.map(recipeIngredient).filter(Boolean).slice(0, 40)
    : [];
  const image = nonDataUrl(recipe.imageUrl || recipe.image) || dish.imageUrl || dish.image || "";
  return {
    ...dish,
    name: String(recipe.name || dish.name || "家常菜").trim().slice(0, 28),
    time: Math.max(5, Math.min(180, Math.round(Number(recipe.time) || Number(dish.time) || 20))),
    image,
    imageUrl: image,
    sourceUrl: String(recipe.sourceUrl || dish.sourceUrl || "").trim(),
    guideSource: "source",
    recipeImagesCheckedAt: new Date().toISOString(),
    ingredients: incomingIngredients.length ? incomingIngredients : dish.ingredients || [],
    steps: incomingSteps.length ? incomingSteps : dish.steps || [],
    stepDetails: incomingDetails.length ? incomingDetails : dish.stepDetails || []
  };
}

function normalizeStepItem(step) {
  if (typeof step === "string") return { text: cleanStepDisplayText(step), image: "", imageUrl: "" };
  return {
    text: cleanStepDisplayText((step && step.text) || ""),
    image: String((step && step.image) || "").trim(),
    imageUrl: String((step && step.imageUrl) || "").trim()
  };
}

function cleanStepDisplayText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/^\s*(?:步骤\s*)?\d+\s*[.．、:：]\s*/, "")
    .trim();
}

function stepImageSrc(step) {
  return imageSrcFromRaw((step && (step.imageUrl || step.image)) || "");
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function mergeHouseholdList(households, household) {
  const list = Array.isArray(households) ? households.filter((item) => item.id !== household.id) : [];
  return [household, ...list];
}

function normalizeInviteToken(value) {
  const token = String(value || "").trim();
  return /^[A-Za-z0-9_-]{24,100}$/.test(token) ? token : "";
}

function normalizeLegacyHouseholdCode(value) {
  const code = String(value || "").trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{0,79}$/i.test(code) ? code : "";
}

function normalizeTab(value) {
  const tab = String(value || "").trim();
  return ["wife", "husband", "menu"].includes(tab) ? tab : "";
}
