# 观澜 · Supabase 后端部署指南

本目录已提供**一键建库脚本** `deploy.sql` 与**环境变量样例** `.env.example`。
前端在填入凭据后会自动切换为 Supabase 后端（`USE_REMOTE = true`），UI 无需改动。

> 沙箱内无 Supabase CLI / Docker，无法替你在云端建项目或直连执行 SQL；
> 以下步骤在 **Supabase 控制台（网页）** 操作，约 5 分钟完成。

---

## 一、准备 Supabase 项目

1. 打开 https://supabase.com → 新建项目（选免费版，区域就近）。
2. 等待数据库就绪（约 1–2 分钟）。
3. 记录两样东西（Project Settings → API）：
   - **Project URL**：形如 `https://<project-ref>.supabase.co`
   - **anon public key**：`eyJ...` 一长串

---

## 二、执行建库脚本（建表 / 策略 / 存储桶 / 函数）

1. 左侧菜单 **SQL Editor → New query**。
2. 打开本目录 `deploy.sql`，**全选复制**粘贴进编辑器。
3. 点击 **Run**（或 Ctrl/Cmd + Enter）。

脚本是幂等的（`if not exists` / `drop ... if exists`），可重复执行。它会：
- 建 `profiles` / `watchlists` / `community_posts` / `community_replies` / `community_likes` 五张表；
- 开启 RLS 并配置行级安全策略；
- 注册「新用户自动建 profile」触发器；
- 创建 `avatars` 公开存储桶（限 2MB）；
- 创建 `toggle_post_like(p_post_id)` 点赞切换函数（计数由触发器维护，前端无法伪造）；
- 把相关表加入 Realtime 发布；
- **第 8 节为生产强化**：把社区写操作收紧为「仅登录用户可发 / 仅作者可删」。

> 想先以匿名模式联调？把 `deploy.sql` 第 8 节整段注释掉再执行即可；
> 正式上线前务必保留第 8 节。

---

## 三、配置身份认证（邮箱 + 邮件确认 + 邮箱验证码）

1. **Auth → Providers → Email**：打开 **Email** 与 **Confirm email**（开启邮件确认，
   与前端「注册→等待邮件确认→点击回跳自动登录」流程配套）。
2. **开启「邮箱验证码（Email OTP）」并修正邮件模板**（注册验证码 / 找回密码依赖此项）：

   > ⚠️ **踩坑重点**：前端 `requestSignupCode` / `requestResetCode` 已正确调用 `signInWithOtp`
   > 且**未传 `emailRedirectTo`**，因此 Supabase 应当发送 6 位验证码而非登录链接。
   > 如果你收到的是「Your sign-in link / Follow the link below to sign in」这种**登录链接**邮件，
   > 问题 100% 出在 Supabase 邮件模板——`signInWithOtp` 实际发出的是 **Magic Link** 模板，
   > 而该模板默认正文是 `{{ .ConfirmationURL }}`（一个可点击链接）。必须把它换成 `{{ .Token }}`。

   - **步骤 A**：Auth → Providers → Email，打开 **Email OTP** 开关。
   - **步骤 B（关键，缺一不可）**：进入 **Auth → Email Templates → Magic Link**，
     把正文里的 `{{ .ConfirmationURL }}` **整段替换成 `{{ .Token }}`**，并改成验证码文案
     （直接粘贴下方模板）。只开开关、不改模板，你收到的仍是登录链接。
   - **步骤 C**：同样确认 **Auth → Email Templates → Email OTP** 模板含 `{{ .Token }}`
     （该模板默认即为验证码；仅当你曾改过它才需要还原）。
   - 两个模板都粘贴**同一份**中文验证码模板（主题也一起改掉英文默认值）：

     **主题（Subject）**：`【观澜】您的验证码`

     ```html
     <h2 style="margin:0 0 12px;font-family:-apple-system,Segoe UI,Roboto,sans-serif">【观澜】您的验证码</h2>
     <p style="margin:0 0 12px;font-family:-apple-system,Segoe UI,Roboto,sans-serif">您好，您正在使用「观澜」进行身份验证，本次验证码为：</p>
     <p style="font-size:32px;font-weight:700;letter-spacing:6px;color:#16a34a;margin:0 0 12px;font-family:-apple-system,Segoe UI,Roboto,sans-serif">{{ .Token }}</p>
     <p style="margin:0 0 12px;font-family:-apple-system,Segoe UI,Roboto,sans-serif">验证码有效期 5 分钟，请勿转发或告知他人。</p>
     <p style="margin:0;color:#888;font-size:13px;font-family:-apple-system,Segoe UI,Roboto,sans-serif">若非本人操作，请忽略本邮件。</p>
     ```

   - **步骤 D（有效期必须对齐 5 分钟）**：邮件文案已改为「5 分钟」，但**服务端实际有效期需单独设置**，否则用户拿到码后服务端仍可能在更长时间内放行，造成「邮件说 5 分钟、实际更久」的不一致。请在 Supabase 将邮箱验证码有效期设为 **300 秒（5 分钟）**：
     - **Supabase 云控制台**：Auth → Providers → Email，找到「Email OTP 有效期 / OTP expiry」并设为 `300`（若无该字段，用下方环境变量方式）。
     - **自托管 / 环境变量**：设置 `GOTRUE_MAILER_OTP_EXPIRY=300`（单位秒），重启 Auth 服务生效。
     - 前端已按 60s 做重发冷却（`register.vue` 的 `startCountdown()`），与 5 分钟有效期组合即：发码后 60s 内不可重发、码本身 5 分钟内可验。

   - 校验：触发一次「注册发码」或「忘记密码发码」，邮箱应收到**纯数字验证码**邮件，
     主题为中文「【观澜】您的验证码」；前端填码即可通过 `verifyOtp` 验证。
3. **Auth → URL Configuration**：
   - **Site URL** 填 `http://localhost:5173`（开发）及你的线上域名。
   - **Redirect URLs** 至少加入 `http://localhost:5173`（部署到 H5 时加上正式域名）。
   - 否则邮件里的确认链接回跳会被 Supabase 拒绝（报 redirect URL 不在白名单）。
4. 注册确认邮件模板（Auth → Templates → **Confirm signup**）默认即可；如需汉化可在那里改。

---

## 四、填入前端凭据

1. 复制 `.env.example` 为 `.env`：`cp .env.example .env`（Windows 直接另存为 `.env`）。
2. 填入第二步拿到的 URL 与 anon key：
   ```
   VITE_SUPABASE_URL=https://<project-ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```
3. `.env` 已被 `.gitignore` 忽略，切勿提交真实密钥。
4. 重新 `npm run dev:h5`（或 `build:h5`）。前端检测到 `VITE_SUPABASE_URL` 有效即自动走后端；
   社区发帖 / 点赞 / 自选同步 / 头像上传全部落到 Supabase。

---

## 五、验证清单

- [ ] 注册 → 收到验证邮件 → 点击链接回跳自动登录。
- [ ] 「登录页 → 忘记密码」，输入注册邮箱收验证码 → 填码验证 → 重设密码 → 进入首页。
- [ ] 「我的 → 个人资料」改昵称 / 简介 / 上传头像，刷新后仍保留。
- [ ] 自选股增删后刷新仍在（云端）。
- [ ] 社区发帖、点赞、回复正常，刷新后计数不丢。
- [ ] 退出登录后再发布，会先引导登录（社区已收紧为登录可写）。

---

## 六、行情代理（Edge Function · 统一后端的市场数据入口）

`supabase/functions/guanlan-quote-proxy/index.ts` 是行情代理 Edge Function，部署在 Supabase 免费服务器上。
统一后端架构下，前端（尤其是微信小程序，受域名白名单限制）经由它请求东方财富（K 线 + 资金流），
绕开浏览器跨域并集中管理第三方调用。部署：

```bash
# 需要本地装好 Supabase CLI 并 link 到本项目（见下方「八、Edge Functions 部署（新手 CLI 全流程）」）
npx supabase functions deploy guanlan-quote-proxy
```

> 前端接入本函数属于「统一后端」的后续收尾步骤（当前行情层仍走 dev 代理 / 公共代理仅供测试）。
> 一旦接入，生产环境不再直连东方财富；本地 `vite.config.ts` 的 dev 代理仅用于未部署函数时的本地调试。

---

## 七、重置 / 重建数据库（删除表并重新生成）

> 适用场景：你改了 `deploy.sql` 的表结构、想推倒重来；或测试数据太脏想清空。
> **⚠️ 这会删除这些表里的全部数据，且不可恢复。** 当前后端尚未上线、无真实数据，可放心执行；
> 一旦有线上数据，请改用下方「仅加列 / 仅清数据」的轻量方式，不要整体 DROP。

### 方式 A：删除全部业务表后重新生成（最干净）

把下面脚本整段粘贴到 **SQL Editor → New query → Run**，再 **重新粘贴并运行一遍 `deploy.sql`** 即可：

```sql
-- 1) 社区三表（cascade 会一并清理外键 / 索引 / 触发器 / RLS 策略）
drop table if exists public.community_likes    cascade;
drop table if exists public.community_replies  cascade;
drop table if exists public.community_posts    cascade;

-- 2) 账户 / 自选（依赖 auth.users，cascade 清理自身策略与索引）
drop table if exists public.watchlists cascade;
drop table if exists public.profiles   cascade;

-- 3) 依赖上述表的函数（表已随 cascade 失效，显式删掉更干净；deploy.sql 会重建）
drop function if exists public.handle_new_user()      cascade;
drop function if exists public.sync_post_likes()      cascade;
drop function if exists public.toggle_post_like(uuid) cascade;

-- 4) 头像存储桶（非表，单独清；不删则旧头像文件仍占空间）
delete from storage.objects where bucket_id = 'avatars';
delete from storage.buckets where id = 'avatars';
```

> 注意：不要碰 `auth.users` 及整个 `auth` schema —— 那是 Supabase 托管的，删了 Auth（登录/注册）直接瘫痪。
> Realtime 发布里的表引用随表销毁自动移除，重跑 `deploy.sql` 第 6 节会重新加入。

### 方式 B：只加列 / 只清数据（有线上数据时用，零破坏）

- **新增字段**（推荐，上线前应一次性把前瞻列加齐，避免来回 ALTER）：
  ```sql
  alter table public.community_posts add column if not exists tags text[] not null default '{}';
  ```
- **清空数据但保留表结构**（开发期重置演示数据）：
  ```sql
  truncate table public.community_posts, public.community_replies, public.community_likes restart identity;
  ```

### 方式 C：整库清零（最彻底）

Supabase 免费版没有「drop database」按钮，最干净的做法是 **Project Settings → Delete project**，
再用同一个组织新建一个空项目（拿新 URL / anon key），然后从头执行本指南的二~四步。
适合你想 100% 干净的场合，但会同时清空 Auth 用户，请确认可接受。

### 命名与扩展约定（改表前先读）

- 表名：小写、集合用复数（`community_posts` / `community_likes`）；账户相关单表 `profiles` / `watchlists`。
- 字段：全 `snake_case`；布尔用 `is_` 前缀（`is_hidden`）；时间用 `<动作>_at`（`created_at` / `last_seen_at`）。
- 枚举用 `text + check`（如 `status in ('published','deleted')`）或正式 `create type ... as enum`。
- 灵活/多值数据用 `jsonb`（`prefs` / `alerts` / `meta`）或 `text[]`（`tags` / `images`），避免将来每加一项就 ALTER 一次表。
- 外键务必带 `on delete cascade`（子资源随父删）或 `on delete set null`（保留历史但断开关联）。
- **前瞻扩展列已预先加好**：`profiles.prefs/website/location/last_seen_at`、`watchlists.group_name/sort_order/is_hidden/alerts`、
  `community_posts.status/images/tags/meta`、`community_replies.status/parent_id/meta`，均为「带默认值的可选列」，
  现有前端逻辑（对象式 insert + select）不受影响，未来按需启用即可。


## 八、Edge Functions 部署（新手 CLI 全流程）

你已 `supabase login` 成功 ✅。下面所有命令在你**自己电脑的终端**里跑（进入项目根目录 `guanlan-stock/` 后执行），不是在聊天框里跑。

> 前置：本机装好 Node.js（你已有）。Supabase CLI 用 `npx supabase` 即可，无需全局安装；
> 若想全局装：`npm i -g supabase`（macOS 也可 `brew install supabase/tap/supabase`）。

### 步骤 1：找到你的 project-ref（部署目标的身份证）

1. 打开 https://supabase.com/dashboard → 进入你的项目。
2. 看浏览器地址栏，形如：
   `https://supabase.com/dashboard/project/<project-ref>`
   那串 `<project-ref>`（例如 `abcdefghijklmnopqrstu`）就是它。
   或者：项目内 **Settings → API**，页面顶部「Project URL」`https://<project-ref>.supabase.co` 里的 `<project-ref>` 也是它。
3. 复制下来备用（下文的 `<ref>` 都指它）。

### 步骤 2：关联本地项目到云端（生成 config.toml）

```bash
cd guanlan-stock
npx supabase link --project-ref <ref>
```

- 首次会让你输入**数据库密码**（建 Supabase 项目时你设的那个；忘了就去 Settings → Database → Reset database password 重置）。
- 成功后会在 `supabase/` 下生成 `config.toml`（已被 `.gitignore` 忽略，别提交）。
- 这一步**不会动你已有的表**，只是把本地目录和云端项目绑起来，方便后续部署函数。

### 步骤 3：部署 Edge Function（免费服务器）

```bash
npx supabase functions deploy guanlan-quote-proxy
```

- **不需要 Docker**（只有本地模拟 `supabase start` 才要 Docker，云端部署不用）。
- **不需要设密钥**（本函数直连东方财富，代码里没用 `Deno.env.get`，所以无需 `supabase secrets set`）。
- 部署成功后，函数地址就是：
  `https://<ref>.supabase.co/functions/v1/guanlan-quote-proxy`
- 以后每加一个新函数，把 `guanlan-quote-proxy` 换成新函数目录名再跑一次即可。

### 步骤 4：验证函数真的能跑

在你电脑终端粘贴（把 `<ref>` 换成你的）：

```bash
curl -X POST 'https://<ref>.supabase.co/functions/v1/guanlan-quote-proxy' \
  -H "Content-Type: application/json" \
  -d '{"secid":"1.600519","klt":101,"beg":20240101}'
```

返回一段 JSON（含 `klines` / `flowMap` 字段）就说明部署成功。
函数里已写好 CORS 头（`Access-Control-Allow-Origin: *`），H5 前端直连不会被跨域拦。

> ⚠️ **实测硬约束（2026-08-01）**：函数能部署、能运行，但东方财富（`push2his.eastmoney.com`）会在 TLS 层**掐断来自 Supabase 海外云（AWS Sydney，及其他海外地域）的 IP**——调用返回 500 `peer closed connection without sending TLS close_notify`。已用临时诊断函数确认 Supabase 出口本身正常（github/postman 均 200），唯独东方财富被封；加浏览器 `User-Agent`/`Referer`、换 Supabase 地域均无效。
> 后果：**H5 端浏览器（用户中国 IP）直连东方财富仍可用**（`VITE_USE_EDGE_FUNCTIONS=false`）；但**微信小程序因域名白名单必须走代理，而本代理被东方财富封锁，小程序暂无法经此函数拿 A 股行情**。若小程序要拿 A 股行情，需把行情代理搬到有中国/HK 线路的服务器，或换用「海外云可达」的付费 A 股数据源——详见项目 memory 的「Edge Function guanlan-quote-proxy」章节。

### 步骤 5（可选）：如果以后函数要调第三方 API key

```bash
npx supabase secrets set EM_API_KEY=你的密钥
```

设一次即可，云端持久保存；代码里用 `Deno.env.get('EM_API_KEY')` 读取。当前 `guanlan-quote-proxy` 用不到。

### 常见卡点

- **`supabase: command not found`** → 用 `npx supabase ...` 代替 `supabase ...`，或先 `npm i -g supabase`。
- **`link` 时报密码错** → 去 Settings → Database → Reset database password，用新密码重试。
- **部署报「function not found」** → 确认目录是 `supabase/functions/guanlan-quote-proxy/index.ts`，且你在 `guanlan-stock/` 根目录执行。
- **curl 返回 401/403** → 函数默认公开（匿名可调用）；当前不用管，若以后在函数里加了鉴权再另行处理。

> 提示：建表（第二~四步）与部署 Edge Function（本节）彼此独立——表没建好也能先部署函数，函数没部署也不影响表与登录/社区功能。建议顺序：先确认表已建（第七节按需重建）→ 再部署 `guanlan-quote-proxy` → 最后跑验证清单。

