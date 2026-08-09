# 股票智能分析 · 跨端版（H5 网页 + 微信小程序）

一套代码同时运行在 **Web 网页（H5）** 与 **微信小程序**，基于 **uni-app (Vue 3 + TypeScript)**
+ **Supabase**（PostgreSQL / Auth / Storage / Realtime / Edge Functions）+ **KLineCharts** + **uni-icons**。

> 设计目标：Web 端与微信小程序端视觉 / 交互 / 业务逻辑完全一致，后续接入小程序为「编译」而非「重写」。

---

## ✨ 特性

- **统一 Outline 线条图标**：H5 端用内联 SVG（无字体依赖，绝不会出现「图标不显示」），微信小程序端回退到 `uni-icons` 字体图标，风格简洁一致。
- **丰富动效**：卡片自下淡入、列表依次进场、弹窗底部滑入、底部导航切换淡入淡出、按钮按压回弹、价格变色等，纯 CSS 实现，无 Web-only API。
- **智能分析**：趋势 / 支撑压力 / 主力建仓区 / 量能 / 资金 / 筹码 / MACD / KDJ / RSI，输出白话报告（当前状态、关注 / 建仓 / 加仓 / 减仓、买入区间、风险提示）。
- **多周期**：分时 / 日 K / 周 K / 月 K / 年 K。
- **打开即用**：默认游客模式，行情分析与本地自选立即可用；点击头像弹窗登录 / 注册（Supabase），登录后自选与资料云端同步。
- **跨端行情**：统一 `fetchQuote` 入口，**多源冗余 + 通道降级**（详见下方「行情数据源」）。数据源优先级与菜单显隐**可配置**（Supabase `app_config` 远程下发，改库即生效、无需发版）。
- **前后端分离**：登录 / 自选 / 社区 / 公告 / 系统配置全部落在 Supabase（PostgreSQL + Auth + Storage + Edge Functions）；行情与资金流经 **Edge Function 服务端转发**（东财已验证可访问），彻底移除本地 Node 后端。

---

## 📁 目录结构

```
stock-analyzer-uni/
├─ src/
│  ├─ config/app.ts          # 运行期配置：Supabase URL/KEY、USE_EDGE_FUNCTIONS、本地默认菜单/数据源
│  ├─ config/remote.ts       # 从 Supabase app_config 表拉取远程配置（菜单显隐 / 数据源顺序）
│  ├─ utils/                 # 纯业务逻辑（跨端，零平台依赖）
│  │  ├─ analyzer.ts         #   分析引擎（指标 + 综合研判 + 白话报告）
│  │  ├─ period.ts           #   周期配置 + 代码解析 + 行情行解析
│  │  └─ colors.ts / format.ts
│  ├─ api/                   # 数据 / 服务隔离层
│  │  ├─ supabase.ts         #   Supabase 客户端（H5 原生 / 小程序 uni.request 垫片）
│  │  ├─ quote.ts            #   跨端行情统一入口
│  │  ├─ sources/            #   数据源层：多源注册表 + 并发首胜 + 熔断降级
│  │  │  ├─ index.ts         #     注册表（东财/腾讯/新浪/代理）按配置组装取数链
│  │  │  ├─ eastmoney.ts / tencent.ts / sina.ts / proxy.ts
│  │  │  ├─ transport.ts     #     传输层降级（直连/JSONP/Edge Function/公共代理）
│  │  ├─ announcement.ts     #   公告（Supabase announcements 表）
│  │  ├─ auth.ts             #   登录 / 注册 / 资料更新 / 头像上传
│  ├─ store/                 # 响应式状态（Vue reactive，跨端通用）
│  │  ├─ appConfig.ts        #   运行时配置合成（本地默认 + 远程覆盖）
│  │  ├─ user.ts             #   用户态 + 资料 + 会话订阅
│  │  ├─ watchlist.ts        #   自选股（云端 / 本地降级 + Realtime）
│  │  ├─ nav.ts              #   UI 桥接（底部导航 key、登录弹窗、跳转行情）
│  ├─ components/            # 跨端 UI 组件
│  │  ├─ OutlineIcon.vue     #   线条图标封装（uni-icons）
│  │  ├─ PriceText.vue / AnalysisCard.vue / StockChart.vue（行情图引擎）
│  │  ├─ ReportView.vue / AuthShell.vue / AppTabBar.vue（tabs 由系统配置下发）
│  ├─ views/                 # 四个页面视图（Market / Watchlist / Community / Profile）
│  ├─ pages/index/index.vue  # 壳页：底部导航（按配置显隐）+ 视图切换 + 认证弹窗
│  ├─ styles/global.css      # 全局设计系统（颜色 / 间距 / 圆角 / 动效）
│  ├─ App.vue / main.ts
├─ uni_modules/              # 跨端组件（uni-icons，已 vendored）
├─ supabase/
│  ├─ deploy.sql            # 建表 / RLS / 存储桶 / Realtime（公告、系统配置、社区等）
│  ├─ DEPLOY.md             # Supabase 部署指引（SQL + Edge Function + 环境变量）
│  └─ functions/guanlan-quote-proxy/  # Edge Function：行情 / 资金流服务端转发
└─ manifest.json / pages.json / vite.config.ts
```

---

## 📡 行情数据源（多源冗余，可配置）

**数据链路**：交易所（上交所 / 深交所 / 港交所）是行情的源头 → 数据商（东方财富、腾讯、新浪等）通过授权行情源 / 镜像拿到数据 → 再以各自的 **web API** 对外提供。本项目对每类数据接入多家相互独立的上游源，做 **并发首胜 + 自动降级**（某源连续失败 3 次熔断 60s 后自愈），单家源故障不影响整页。

**默认优先级（可在 Supabase `app_config` 的 `sources` 字段改，无需发版）**：

| 数据 | 首选 | 次选 | 兜底 | 说明 |
| --- | --- | --- | --- | --- |
| 实时行情 | 东方财富 | 腾讯证券 | 新浪财经 | 三级冗余 |
| K 线 | 东方财富 | 腾讯证券 | 新浪财经(日K) | 东财额外提供换手率(f61)，采用时优先 |
| 分时 | 东方财富 | 腾讯证券 | 新浪财经 | 三级冗余 |
| 资金流 | 东方财富 | Edge 代理(新浪) | — | 主力净流入仅东财免费开放；东财不可达经 Edge Function 转发新浪 |
| 搜索 | 东方财富 | 腾讯证券 | 新浪财经 | 三级冗余 |
| 资讯 | 东方财富 | — | — | 结构化资讯独一家，不可达则返回空列表 |

**请求通道（自动选择，按优先级）**：
1. **Supabase Edge Function**（`guanlan-quote-proxy`）服务端转发（东财已验证可访问），H5 与小程序统一走此通道，规避 CORS 与小程序域名白名单；
2. 直连（带 UA/Referer）→ JSONP → 公共 CORS 代理，逐级回退；
3. 本地开发另有 Vite 同源代理 `/rt /em /search` 直连东财调试用。

> 东方财富接口返回 UTF-8；新浪资金流返回 GBK（已由 Edge Function 转码）。实时行情价格按市场精度缩放（A 股×100、港股×1000），已在 `sources/eastmoney.ts` 的 `emPriceScale` 中处理。

> **前端无需手动选择沪/深/港/京**：输入股票代码（或名称）即按规则自动识别市场（`period.ts` 的 `resolveSecid` auto 模式）并立即开始分析；同时提供东方财富搜索接口的代码/名称联想。自选股以 `secid` 反推的 `code`/`market` 存储。

## ⚙️ 系统配置（菜单 / 数据源远程下发）

所有业务级配置存在 Supabase `app_config` 表（key/value jsonb，RLS 公开读 / 仅 service_role 可写）。前端启动时拉取并与本地默认合并，组件自动响应。

| 字段 | 类型 | 作用 |
| --- | --- | --- |
| `menus` | `{market,watch,community,profile: boolean}` | 底部导航显隐（关闭则入口一并隐藏） |
| `sources` | `{realtime,kline,trend,flow,search,news: SourceId[]}` | 每类数据的数据源优先级列表 |

新增配置项（如 `features` / `theme`）无需改表，直接在 `app_config` 加 key 即可。

---

## 🚀 运行

> 要求 Node ≥ 18（本仓库推荐用 Node 20/22）。

```bash
npm install

# H5 网页开发
npm run dev:h5        # http://localhost:5173
# H5 网页构建
npm run build:h5      # 产物在 dist/build/h5，可直接静态托管

# 微信小程序
npm run dev:mp-weixin     # 产物在 dist/dev/mp-weixin
npm run build:mp-weixin   # 产物在 dist/build/mp-weixin
# 用「微信开发者工具」导入上述目录即可预览（需填小程序 appid，见 manifest.json）

# App（可选）
npm run dev:app / npm run build:app
```

> 后端（登录 / 自选云同步 / 社区 / 公告 / 配置）与行情代理均由 **Supabase** 承载，
> 前端可静态托管在任意平台（Vercel / Netlify / 对象存储等），无需自建服务器。

> 注：在受限沙箱环境里 `vite` 依赖优化 / `uni` 清理产物时会触发批量删除被拦截而中断，
> 属环境限制；在本地普通机器上 `npm run dev:h5` 可正常运行。生产构建（`build:h5`）不受影响。

---

## 🔧 Supabase 配置（不配也能分析，配了功能完整）

1. 在 `.env`（或 `.env.local`）填入 `VITE_SUPABASE_URL` 与 `VITE_SUPABASE_ANON_KEY`。
2. 在 Supabase 控制台 SQL Editor 执行 `supabase/deploy.sql`（幂等，可重复执行）。
3. 部署行情/资金流 Edge Function：`npx supabase functions deploy guanlan-quote-proxy`
   （更多细节见 `supabase/DEPLOY.md`）。

未配置时：登录 / 自选云同步 / 社区 / 公告不可用，但行情分析（本地默认配置）与本地自选完全可用。

---

## 🎨 跨端设计要点

- **业务逻辑与 UI 分离**：`utils/` 为纯函数，H5 / 小程序零改动复用。
- **图表用 KLineCharts**：H5 端专用 K 线框架（蜡烛 / 量 / MACD / 分时 / 筹码 / 预置画线），专业且无水印。
- **图标用字体图标**：小程序不支持内联 SVG，统一走 `uni-icons` 字体方案。
- **避免 Web-only API**：不依赖 `window` / `document`（仅在 `isH5()` 守卫内使用），动效纯 CSS。
- **响应式布局**：以 `rpx` 为单位自适应屏宽；H5 桌面端用 `.app-shell` 居中成手机宽度，保证两端视觉一致。
