function requestApi(path, data, options = {}) {
  const app = getApp();
  const apiBase = (options.apiBase || app.globalData.apiBase || "").replace(/\/+$/, "");
  if (!apiBase) return Promise.reject(new Error("国内 API 域名尚未配置"));
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${apiBase}${path}`,
      method: options.method || "POST",
      data,
      timeout: options.timeout || 120000,
      header: {
        "content-type": "application/json"
      },
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
  requestApi,
  showToast,
  requirePrivacyAuthorization
};
