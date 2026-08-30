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
  assert.match(source, /await this\.generateMealSharePhoto\(photoId, \{ image, analysis: payload\.analysis, quiet: true \}\)/);
  assert.match(source, /async generateSharePhoto\(event\) \{\s*this\.generateMealSharePhoto/);
  assert.match(template, /整桌照片热量识别/);
  assert.match(template, /\{\{item\.totalCalories\}\}/);
  assert.match(template, /\{\{item\.calories\}\} kcal/);
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
