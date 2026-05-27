# 线上 MVP 部署步骤

## 1. 创建 Supabase project

1. 打开 Supabase，新建一个 project。
2. 在 Authentication 设置里启用 Anonymous sign-ins。
3. 打开 SQL Editor，粘贴并运行 `supabase-schema.sql`。
4. 在 Project Settings -> API 里复制：
   - Project URL
   - anon/public key

## 2. 配置前端

打开 `config.js`，填入 Supabase 配置：

```js
window.WIFE_KITCHEN_CONFIG = {
  supabaseUrl: "https://qsbonrvstwgdirvfaxhu.supabase.co",
  supabaseAnonKey: "你的 anon/public key"
};
```

项目 URL 不能填 Supabase 控制台地址，必须是 `https://项目 ref.supabase.co` 这种 API 地址。

`anon/public key` 可以出现在前端代码里，真正的数据隔离依赖 Supabase RLS。

## 3. 本地验证在线模式

```bash
python3 -m http.server 5175 --bind 0.0.0.0
```

打开：

```text
http://127.0.0.1:5175/#wife
```

输入一个家庭码，例如：

```text
home-kitchen-2026
```

另一台设备输入同一个家庭码，就会看到同一份菜单。

## 4. 推到 GitHub

在 GitHub 新建一个 repository，然后在本地执行：

```bash
git init
git add .
git commit -m "Build wife kitchen online MVP"
git branch -M main
git remote add origin https://github.com/YOUR_NAME/YOUR_REPO.git
git push -u origin main
```

## 5. 部署到 Vercel

1. 打开 Vercel。
2. New Project。
3. 选择刚才的 GitHub repository。
4. Framework Preset 选择 Other。
5. Build Command 留空。
6. Output Directory 留空或填 `.`。
7. Deploy。

部署完成后，Vercel 会给你一个公开 URL。页面公开没关系，数据需要家庭码 + Supabase RLS 才能访问。

## 6. MVP 使用方式

- 老婆打开 `https://你的域名/#wife`
- 老公打开 `https://你的域名/#husband`
- 两个人输入同一个家庭码
- 老婆确认下单后，老公端会同步看到订单
- 朋友使用时，给他们一个不同的家庭码；同一个家庭码会进入同一份菜单数据

## 注意事项

- 第一版家庭码就是共享密码，建议设置得长一点。
- 匿名登录如果用户清空浏览器数据，会生成一个新的匿名用户；只要还知道家庭码，就能重新加入家庭。
- 不能把 Supabase service role key 放进前端或 GitHub，只能使用 anon/public key。
- 后续如果要更正式，可以升级到手机号、邮箱或微信小程序登录。
