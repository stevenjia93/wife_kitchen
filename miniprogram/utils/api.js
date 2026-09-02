const AUTH_KEY = "wife-kitchen-mini-auth-v1";

function requestApi(path, data, options = {}) {
  const app = getApp();
  const apiBase = (options.apiBase || app.globalData.apiBase || "").replace(/\/+$/, "");
  if (!apiBase) return Promise.reject(new Error("国内 API 域名尚未配置"));
  return new Promise((resolve, reject) => {
    const authState = options.auth === false ? null : wx.getStorageSync(AUTH_KEY) || null;
    const header = { "content-type": "application/json" };
    if (authState?.token) header.authorization = `Bearer ${authState.token}`;
    wx.request({
      url: `${apiBase}${path}`,
      method: options.method || "POST",
      data,
      timeout: options.timeout || 120000,
      header,
      success(response) {
        const payload = response.data || {};
        if (response.statusCode >= 200 && response.statusCode < 300) {
          resolve(payload);
        } else {
          reject(new Error(payload.error || `请求失败：${response.statusCode}`));
        }
      },
      fail(error) {
        reject(new Error(error.errMsg || "网络请求失败"));
      }
    });
  });
}

function requestImageFile(path, filePath, data, options = {}) {
  const app = getApp();
  const apiBase = (options.apiBase || app.globalData.apiBase || "").replace(/\/+$/, "");
  if (!apiBase) return Promise.reject(new Error("国内 API 域名尚未配置"));
  return new Promise((resolve, reject) => {
    const authState = options.auth === false ? null : wx.getStorageSync(AUTH_KEY) || null;
    const query = Object.entries(data || {})
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
      .join("&");
    const header = { "content-type": "application/octet-stream", "x-image-mime": imageMimeFromPath(filePath) };
    if (authState?.token) header.authorization = `Bearer ${authState.token}`;
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(readTimeout);
      callback(value);
    };
    const readTimeout = setTimeout(() => finish(reject, new Error("读取照片超时，请重新选择")), 15000);
    wx.getFileSystemManager().readFile({
      filePath,
      success(result) {
        if (settled) return;
        const bytes = result.data;
        if (!bytes || !bytes.byteLength) {
          finish(reject, new Error("图片读取失败"));
          return;
        }
        clearTimeout(readTimeout);
        wx.request({
          url: `${apiBase}${path}${query ? `?${query}` : ""}`,
          method: "POST",
          data: bytes,
          timeout: options.timeout || 120000,
          header,
          success(response) {
            const payload = response.data || {};
            if (response.statusCode >= 200 && response.statusCode < 300) {
              finish(resolve, payload);
            } else {
              finish(reject, new Error(payload.error || `请求失败：${response.statusCode}`));
            }
          },
          fail(error) {
            finish(reject, new Error(error.errMsg || "照片上传失败"));
          }
        });
      },
      fail(error) {
        finish(reject, new Error(error.errMsg || "图片读取失败"));
      }
    });
  });
}

function imageMimeFromPath(filePath) {
  const suffix = String(filePath || "").toLowerCase();
  if (suffix.endsWith(".png")) return "image/png";
  if (suffix.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

function loginWithWechat() {
  return new Promise((resolve, reject) => {
    wx.login({
      timeout: 10000,
      success(result) {
        if (!result.code) {
          reject(new Error("微信登录没有返回凭证"));
          return;
        }
        requestApi("/api/wechat-auth", { code: result.code }, { auth: false, timeout: 15000 })
          .then((payload) => {
            wx.setStorageSync(AUTH_KEY, payload);
            resolve(payload);
          })
          .catch(reject);
      },
      fail(error) {
        reject(new Error(error.errMsg || "微信登录失败"));
      }
    });
  });
}

function showToast(title, icon = "none") {
  wx.showToast({ title: String(title || ""), icon, duration: 1800 });
}

function requirePrivacyAuthorization() {
  if (!wx.requirePrivacyAuthorize) return Promise.resolve();
  return new Promise((resolve, reject) => {
    wx.requirePrivacyAuthorize({
      success: resolve,
      fail() {
        reject(new Error("请先同意隐私保护指引"));
      }
    });
  });
}

module.exports = {
  AUTH_KEY,
  loginWithWechat,
  requestImageFile,
  requestApi,
  showToast,
  requirePrivacyAuthorization
};
