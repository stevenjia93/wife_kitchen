const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.join(__dirname, "..");

test("re-upload replaces the current photo and auto-generates a share image after recognition", () => {
  const source = fs.readFileSync(path.join(projectRoot, "miniprogram/pages/home/index.js"), "utf8");
  const template = fs.readFileSync(path.join(projectRoot, "miniprogram/pages/home/index.wxml"), "utf8");
  assert.match(source, /plan\.afterPhotos = \[photo\]/);
  assert.match(source, /this\.analyzeMealPhoto\(photo\.id\)/);
  const uploadStart = source.indexOf("async uploadMealPhoto() {");
  const uploadEnd = source.indexOf("confirmPhotoReplacement() {", uploadStart);
  const uploadSource = source.slice(uploadStart, uploadEnd);
  assert.ok(uploadSource.indexOf("plan.afterPhotos = [photo]") < uploadSource.indexOf("await this.imageFileToDataUrl(filePath)"));
  assert.ok(uploadSource.indexOf("this.refreshView()") < uploadSource.indexOf("this.persistState()"));
  assert.match(uploadSource, /照片已选择，正在识别/);
  assert.match(uploadSource, /fail:\s*\(error\)\s*=>/);
  assert.match(source, /compressedWidth:\s*1600/);
  assert.match(source, /setTimeout\(\(\) => readImage\(filePath\), 12_000\)/);
  assert.match(source, /includeShareImage:\s*true/);
  assert.match(source, /shareTaskId:\s*payload\.shareTaskId/);
  assert.match(source, /await this\.generateMealSharePhoto\(photoId, \{ image, analysis: payload\.analysis, quiet: true, dateKey \}\)/);
  assert.match(source, /async generateSharePhoto\(event\) \{\s*this\.generateMealSharePhoto/);
  assert.match(template, /整桌照片热量识别/);
  assert.match(template, /\{\{item\.totalCalories\}\}/);
  assert.match(template, /\{\{item\.calories\}\} kcal/);
  assert.doesNotMatch(source, /MAX_DAILY_PHOTO_ANALYSIS_ATTEMPTS|今天的 3 次照片识别已用完/);
  assert.doesNotMatch(template, /剩 \{\{photoAttemptsRemaining\}\} 次/);
});

test("selecting a photo refreshes the card before preprocessing and starts recognition", async () => {
  const pagePath = path.join(projectRoot, "miniprogram/pages/home/index.js");
  const stateUtils = require(path.join(projectRoot, "miniprogram/utils/state.js"));
  const previousGlobals = { Page: global.Page, wx: global.wx, getApp: global.getApp };
  let pageConfig;
  let chooseCallback;
  const toasts = [];

  try {
    global.getApp = () => ({ globalData: { apiBase: "https://api.wife-kitchen.com" } });
    global.Page = (config) => {
      pageConfig = config;
    };
    global.wx = {
      env: { USER_DATA_PATH: "/mock-data" },
      requirePrivacyAuthorize: ({ success }) => success(),
      showModal: ({ success }) => success({ confirm: true }),
      showToast: (options) => toasts.push(options.title),
      chooseMedia: (options) => {
        chooseCallback = Promise.resolve(
          options.success({ tempFiles: [{ tempFilePath: "/mock-input/photo.jpg" }] })
        );
      },
      compressImage: ({ success }) => success({ tempFilePath: "/mock-input/compressed.jpg" }),
      getFileSystemManager: () => ({
        readFileSync: () => Buffer.from("photo-bytes").toString("base64"),
        writeFile() {},
        unlink: ({ success }) => success && success()
      }),
      setStorageSync() {},
      removeStorageSync() {}
    };

    delete require.cache[require.resolve(pagePath)];
    require(pagePath);
    const page = {
      ...pageConfig,
      data: { ...pageConfig.data, authLoading: false, householdId: "household-test" },
      state: stateUtils.createDefaultState(),
      photoImages: {},
      setData(patch, callback) {
        this.data = { ...this.data, ...patch };
        if (callback) callback();
      },
      queueRemoteSave() {}
    };
    let sawLoadingCard = false;
    page.analyzeMealPhoto = async () => {
      sawLoadingCard = page.data.photos.length === 1 && page.data.photos[0].analysisStatus === "loading";
    };

    await page.uploadMealPhoto();
    await Promise.race([
      chooseCallback,
      new Promise((resolve) => setTimeout(resolve, 50))
    ]);

    assert.equal(sawLoadingCard, true);
    assert.equal(page.data.photos.length, 1);
    assert.equal(page.data.photos[0].localImagePath, "/mock-input/photo.jpg");
    assert.ok(toasts.includes("照片已选择，正在识别"));
  } finally {
    delete require.cache[require.resolve(pagePath)];
    global.Page = previousGlobals.Page;
    global.wx = previousGlobals.wx;
    global.getApp = previousGlobals.getApp;
  }
});

test("meal photos and cloud generation tasks resume after reopening or changing dates", () => {
  const source = fs.readFileSync(path.join(projectRoot, "miniprogram/pages/home/index.js"), "utf8");
  const stateSource = fs.readFileSync(path.join(projectRoot, "miniprogram/utils/state.js"), "utf8");
  assert.match(source, /hydrateMealPhotosForDate\(dateKey/);
  assert.match(source, /action:\s*"load"/);
  assert.match(source, /shareTaskId:\s*sharePayload\.shareTaskId/);
  assert.match(source, /dateKey,\s*photoId,\s*includeShareImage:\s*true/);
  assert.match(stateSource, /shareTaskId:\s*String\(photo\.shareTaskId/);
  assert.match(stateSource, /remoteStored:\s*Boolean\(photo\.remoteStored\)/);
});

test("menu management keeps image, copy and delete action in one row without a source button", () => {
  const template = fs.readFileSync(path.join(projectRoot, "miniprogram/pages/home/index.wxml"), "utf8");
  const styles = fs.readFileSync(path.join(projectRoot, "miniprogram/pages/home/index.wxss"), "utf8");
  assert.match(template, /<view wx:for="\{\{managedDishes\}\}"[^>]*class="managed-dish"/);
  assert.match(template, /class="managed-thumb/);
  assert.match(template, /class="managed-copy"/);
  assert.match(template, /class="delete-menu-btn"/);
  assert.doesNotMatch(template, /查看来源|managed-source-btn/);
  assert.match(styles, /\.managed-dish \{[\s\S]*align-items: center/);
  assert.match(styles, /\.managed-ingredients \{[\s\S]*white-space: nowrap/);
  assert.match(styles, /\.delete-menu-btn \{[\s\S]*width: 56rpx[\s\S]*height: 56rpx/);
});

test("meal defaults stay behind settings and dish meal tags use fixed square controls", () => {
  const source = fs.readFileSync(path.join(projectRoot, "miniprogram/pages/home/index.js"), "utf8");
  const template = fs.readFileSync(path.join(projectRoot, "miniprogram/pages/home/index.wxml"), "utf8");
  const styles = fs.readFileSync(path.join(projectRoot, "miniprogram/pages/home/index.wxss"), "utf8");

  assert.match(template, /class="topbar-settings"[^>]*bindtap="openMealSettings"/);
  assert.match(template, /wx:if="\{\{mealSettingsOpen\}\}" class="settings-mask"/);
  assert.match(template, /class="detail-meal-inline"/);
  assert.match(template, /\{\{item\.shortLabel\}\}/);
  assert.doesNotMatch(template, /meal-preference-row|适合餐次|可多选，仅用于点菜时筛选/);
  assert.match(source, /openMealSettings\(\) \{\s*this\.setData\(\{ mealSettingsOpen: true \}\)/);
  assert.match(styles, /\.meal-square \{[\s\S]*width: 52rpx[\s\S]*max-width: 52rpx[\s\S]*height: 52rpx/);
});

test("calendar uses six explicit seven-column rows instead of wrapping native buttons", () => {
  const source = fs.readFileSync(path.join(projectRoot, "miniprogram/pages/home/index.js"), "utf8");
  const template = fs.readFileSync(path.join(projectRoot, "miniprogram/pages/home/index.wxml"), "utf8");
  const styles = fs.readFileSync(path.join(projectRoot, "miniprogram/pages/home/index.wxss"), "utf8");

  assert.match(source, /calendarWeeks:\s*chunkCalendarWeeks\(/);
  assert.match(template, /wx:for="\{\{calendarWeeks\}\}"[^>]*class="calendar-week"/);
  assert.doesNotMatch(template, /wx:for="\{\{calendarDays\}\}"/);
  assert.match(styles, /\.calendar-week \{[\s\S]*display: flex[\s\S]*width: 100%/);
  assert.match(styles, /\.calendar-day \{[\s\S]*flex: 1 1 0[\s\S]*width: 0/);
});

test("household banner supports a shared user-selected cover", () => {
  const source = fs.readFileSync(path.join(projectRoot, "miniprogram/pages/home/index.js"), "utf8");
  const template = fs.readFileSync(path.join(projectRoot, "miniprogram/pages/home/index.wxml"), "utf8");
  const styles = fs.readFileSync(path.join(projectRoot, "miniprogram/pages/home/index.wxss"), "utf8");
  const privacy = fs.readFileSync(path.join(projectRoot, "miniprogram/privacy-notice.txt"), "utf8");

  assert.match(template, /class="topbar panel \{\{householdId \? 'family-hero' : ''\}\}"/);
  assert.match(template, /class="family-cover"[^>]*src="\{\{householdCover\}\}"/);
  assert.match(template, /bindtap="changeHouseholdCover"/);
  assert.match(source, /changeHouseholdCover\(\)/);
  assert.match(source, /this\.state\.householdCover = cover/);
  assert.match(source, /compressedWidth:\s*1200/);
  assert.match(styles, /\.family-hero \{/);
  assert.match(styles, /\.family-cover,/);
  assert.match(privacy, /家庭封面/);
});
