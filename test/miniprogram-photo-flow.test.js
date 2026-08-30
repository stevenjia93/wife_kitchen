const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.join(__dirname, "..");

test("re-upload replaces the current photo and does not auto-generate a share image", () => {
  const source = fs.readFileSync(path.join(projectRoot, "miniprogram/pages/home/index.js"), "utf8");
  assert.match(source, /plan\.afterPhotos = \[photo\]/);
  assert.match(source, /this\.analyzeMealPhoto\(photo\.id\)/);
  assert.doesNotMatch(source, /autoShare\s*:\s*true/);
});

test("menu management keeps the description separate from source and delete actions", () => {
  const template = fs.readFileSync(path.join(projectRoot, "miniprogram/pages/home/index.wxml"), "utf8");
  const styles = fs.readFileSync(path.join(projectRoot, "miniprogram/pages/home/index.wxss"), "utf8");
  assert.match(template, /class="managed-main"/);
  assert.match(template, />查看来源<\/button>/);
  assert.match(styles, /\.managed-actions[\s\S]*padding-left: 134rpx/);
  assert.match(styles, /\.managed-source-btn[\s\S]*flex: 1 1 auto/);
});
