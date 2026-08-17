# 阿里云国内部署与备案步骤

目标架构：微信小程序/H5 → 已备案 HTTPS 域名 → 阿里云轻量服务器上的 Nginx → systemd 托管的 Express + 本机 PostgreSQL。上线后不再依赖 Vercel、Supabase 或 Docker Hub。

## 0. 先区分两类备案

1. **API 域名的 ICP 备案**：在阿里云完成。中国内地 ECS 上的接口域名必须先完成 ICP 备案或阿里云接入备案。
2. **微信小程序备案**：在微信公众平台完成，不在阿里云办理。ICP 备案完成后，再在微信后台填写小程序备案和服务器域名。

备案实名认证、短信/人脸核验、协议确认和最终提交必须由备案主体本人操作。

## 1. 资源前置检查

- 阿里云中国站账号已实名认证，备案主体与域名实名主体一致。
- 域名后缀可备案，域名已实名认证且信息已同步。
- ECS 位于中国内地，具有公网 IP，并满足阿里云当前备案实例时长和计费要求。
- 推荐 RDS PostgreSQL 与 ECS 位于同地域、同 VPC；只开放内网白名单给 ECS，不开放公网 5432。
- 为后端固定一个长期域名，例如 `kitchen.example.com`，不要把 ECS IP 写进小程序。

## 2. 在阿里云申请 ICP 备案

1. 打开阿里云 ICP 备案控制台，选择“开始备案”或“新增/接入其他服务”。
2. 未备案域名选择首次备案/新增网站；已在其他服务商备案的域名选择“接入备案”。
3. 服务类型选择网站，填写备案主体、负责人和网站信息。
4. 接入信息选择目标 ECS 实例。
5. 网站名称建议使用与家庭菜单工具一致、不过度商业化的名称；备注说明用于家庭成员菜单同步。
6. 由备案主体本人完成证件、真实性核验、短信/人脸核验、协议确认和最终提交。
7. 阿里云初审和管局审核通过后，再把域名解析到 ECS 公网 IP。
8. 对外开通后按属地要求在 30 日内完成公安联网备案，并在 H5 页面底部展示备案号（如适用）。

## 3. 配置 PostgreSQL

当前轻量服务器的 2 核 2 GB/40 GB 配置足够小规模家庭使用。生产服务器使用系统仓库中的 PostgreSQL，通过 Unix Socket 与 Express 通信；5432 不开放公网。服务器上的 3000 已被其他进程使用，因此 Wife Kitchen 实际监听本机 3100。

在服务器 `/opt/wife-kitchen/.env.production` 中配置：

```text
PORT=3100
TRUST_PROXY=true
POSTGRES_HOST=/实际的 PostgreSQL Unix Socket 目录
POSTGRES_PORT=5432
POSTGRES_DB=wife_kitchen
POSTGRES_USER=wife_kitchen
POSTGRES_PASSWORD=替换为至少32位随机密码
DATABASE_SSL=disable
DATABASE_POOL_MAX=10
```

系统用户和数据库角色统一使用 `wife_kitchen`，PostgreSQL 的 `pg_hba.conf` 仅允许这个同名本机用户通过 peer 认证。需要更高可用性时再迁移到同地域 RDS PostgreSQL：设置 `DATABASE_URL`、RDS 内网白名单和 SSL 即可，应用代码无需改变。

## 4. 部署 Express

从发布分支拉取代码，并从阿里云系统仓库安装 Node.js、npm、PostgreSQL 和 Nginx。依赖安装使用锁文件：

```bash
git clone --depth 1 --branch codex/aliyun-domestic-migration \
  https://github.com/stevenjia93/wife_kitchen.git /opt/wife-kitchen
cd /opt/wife-kitchen
npm ci --omit=dev
```

初始化数据库、创建 `wife_kitchen` 角色和数据库后执行迁移：

```bash
set -a
. ./.env.production
set +a
npm run migrate
```

将 `deploy/wife-kitchen.service.example` 安装到 `/etc/systemd/system/wife-kitchen.service`，再启动服务：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now postgresql nginx wife-kitchen
curl http://127.0.0.1:3100/healthz
```

健康检查必须返回 `{"ok":true}`。公网只开放 Nginx 的 80/443。`compose.yaml` 保留为其他全新服务器的 Docker 备选方案，但当前阿里云服务器不依赖 Docker Hub。

在 ICP 和 HTTPS 完成前，可以暂时使用 `deploy/nginx-http.conf.example` 通过公网 IP 做后端验收；当前服务器需要把其中的上游端口从 3000 改为 3100。这个 HTTP/IP 地址不能填入微信小程序合法域名，也不能作为正式生产入口。

如果要保留原 Supabase 菜单数据，在首次启动新服务前临时为迁移命令注入旧项目的 `SUPABASE_URL` 和 `SUPABASE_SECRET_KEY`，执行：

```bash
set -a
. ./.env.production
set +a
npm run migrate:supabase
```

核对数据后立即从服务器环境中删除 Supabase 变量。迁移脚本不会把密钥写入代码或数据库。

## 5. 配置域名、HTTPS 与 Nginx

1. ICP 通过后，将 `kitchen.example.com` 的 A 记录解析到 ECS 公网 IP。
2. 申请并部署该域名的有效 TLS 证书。
3. 根据 `deploy/nginx.conf.example` 创建 Nginx 站点，替换域名和证书路径。
4. 安全组只开放 22（限制来源）、80、443；不要开放 3000 和 5432。
5. 运行：

```bash
sudo nginx -t
sudo systemctl reload nginx
curl https://kitchen.example.com/healthz
```

## 6. 切换 H5 和微信小程序

H5 与 API 同域部署，`config.js` 保持：

```js
window.WIFE_KITCHEN_CONFIG = { apiBase: "", onlineEnabled: true };
```

将 `miniprogram/app.js` 中的占位值替换为：

```js
apiBase: "https://kitchen.example.com"
```

在微信公众平台 → 开发管理 → 开发设置 → 服务器域名中，将以下域名配置为 `request` 合法域名：

```text
https://kitchen.example.com
```

不再配置 Supabase 或 Vercel 域名。当前小程序不使用 `web-view`，无需业务域名。

## 7. 隐私与小程序备案

- 在微信隐私保护指引中保留：相册（仅写入）、写入剪切板对应的“读取剪切板”声明、收集用户选中的照片或视频信息。
- 联系方式使用 `stevenjia93@gmail.com`。
- 补充文档上传 `miniprogram/privacy-notice.txt`。
- 小程序前端没有第三方插件/SDK；阿里云和可选的 OpenAI 是服务端服务提供方，在补充文档披露。
- 账号注销选择“小程序中未注册账号”；家庭码不是独立注册账号。
- 微信小程序备案在微信公众平台由主体本人完成最终核验与提交。

## 8. 发布前验收

1. 关闭 VPN/代理，用中国大陆手机网络请求 `/healthz`。
2. 两台真机输入同一家庭码：A 修改菜单，B 下拉刷新后能看到更新。
3. 验证菜谱搜索、图片代理；仅在配置 `OPENAI_API_KEY` 后测试 AI 照片功能。
4. 验证隐私弹窗、相册写入、剪切板写入和选图权限。
5. 微信开发者工具上传新版本，在微信公众平台提交审核；审核通过后由管理员发布。

## 9. 回滚与退役

- 切换前保留原 Supabase 数据导出和旧版本一段观察期。
- 国内服务验证通过后，从生产环境删除 Supabase/Vercel 密钥，不再把旧域名加入微信合法域名。
- 若新版本异常，先在微信后台回滚上一正式版本；数据库不要删除，修复后再发布。
