# 老婆点菜 / 老公厨房 Prototype

一个家庭点餐应用：老婆负责点菜和跳过餐次，确认下单后，老公在厨房看做法、买食材。生产架构为国内 Express + PostgreSQL。

## 现在能做什么

- 在线模式：通过国内 Express API 和 PostgreSQL 用家庭码同步菜单
- 老婆端：按早餐、午餐、晚餐点菜
- 老婆端：每餐可以选择跳过
- 老婆端：全部餐次确认后再下单
- 支持切换日期：过去看历史，今天和未来可预约点餐
- 老公端：收到新订单提醒
- 老公端：查看每餐菜品、原料、简单做法和下厨房参考
- 老公端：自动生成并合并采购清单
- 老公端：勾选已购买食材
- 老公端：录入自己的菜谱
- 老公端：查看“我的菜单”列表并移除不会做的菜
- 饭后照片：上传整桌照后自动估算每道菜和整桌大致热量，可生成手绘风分享图
- 本地保存数据

## 怎么打开

本地安装依赖并启动 Express：

```bash
npm ci
DATABASE_URL=postgresql://... npm run migrate
DATABASE_URL=postgresql://... npm start
```

然后访问 `http://localhost:3000`。只预览本地数据时可使用 `http://localhost:3000/?local=1`。

## 下一步可以做

- 按 `DEPLOYMENT.md` 部署到已备案的阿里云域名
- 增加每周菜单和重复提醒
- 支持从下厨房收藏手动摘录食材和链接
- 接真实推送通知
- 生成小红书分享封面和开发记录

## AI 热量识别配置

热量识别和小红书风格分享图由 Express API 调用阿里云百炼华北2（北京）模型。千问 VL 负责照片分析，Qwen-Image 通过异步任务完成图生图，服务端再叠加精确热量文字。启用时需要在阿里云服务器环境变量里配置：

```text
DASHSCOPE_API_KEY=...
DASHSCOPE_VISION_MODEL=qwen3-vl-plus
DASHSCOPE_IMAGE_MODEL=qwen-image-3.0-pro
DASHSCOPE_IMAGE_SIZE=1024*1280
```
