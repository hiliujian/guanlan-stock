# 股票智能分析 · 跨端版（H5 网页 + 微信小程序）

一套代码同时运行在 **Web 网页（H5）** 与 **微信小程序**，基于 **uni-app (Vue 3 + TypeScript)**
+ **Supabase**（PostgreSQL / Auth / Storage / Realtime / Edge Functions）+ **uCharts** + **uni-icons**。

> 设计目标：Web 端与微信小程序端视觉 / 交互 / 业务逻辑完全一致，后续接入小程序为「编译」而非「重写」。

---

## ✨ 特性

- **统一 Outline 线条图标**：H5 端用内联 SVG（无字体依赖，绝不会出现「图标不显示」），微信小程序端回退到 `uni-icons` 字体图标，风格简洁一致。
- **丰富动效**：卡片自下淡入、列表依次进场、弹窗底部滑入、底部导航切换淡入淡出、按钮按压回弹、价格变色等，纯 CSS 实现，无 Web-only API。
- **智能分析**：趋势 / 支撑压力 / 主力建仓区 / 量能 / 资金 / 筹码 / MACD / KDJ / RSI，输出白话报告（当前状态、关注 / 建仓 / 加仓 / 减仓、买入区间、风险提示）。
- **多周期**：分时 / 日 K / 周 K / 月 K / 年 K。
- **打开即用**：默认游客模式，行情分析与本地自选立即可用；点击头像弹窗登录 / 注册（Supabase），登录后自选与资料云端同步。
- **跨端行情**：统一 `fetchQuote` 入口，**单一数据源东方财富**（实时行情 / K 线 / 分时 / 主力净流入 全部来自东方财富官方 web 接口），经代理获取，**不再使用东方财富 JSONP**（避免 H5 / iframe 下被浏览器禁止跨域 `<script>` 注入而失败）。

---

## 📁 目录结构

```
stock-analyzer-uni/
├─ src/
│  ├─ config/app.ts          # 运行期配置（Supabase URL/KEY、是否走 Edge 代理）
│  ├─ utils/                 # 纯业务逻辑（跨端，零平台依赖）
│  │  ├─ analyzer.ts         #   分析引擎（指标 + 综合研判 + 白话报告）
│  │  ├─ chart.ts            #   图表配置构建器（转 uCharts 配置）
│  │  ├─ period.ts           #   周期配置 + 代码解析 + 行情行解析
│  │  ├─ colors.ts / format.ts
│  ├─ api/                   # 数据 / 服务隔离层
│  │  ├─ supabase.ts         #   Supabase 客户端（H5 原生 / 小程序 uni.request 垫片）
│  │  ├─ quote.ts            #   跨端行情（东方财富单源：实时/K线/分时/资金流，经代理）
│  │  ├─ auth.ts             #   登录 / 注册 / 资料更新 / 头像上传
│  ├─ store/                 # 响应式状态（Vue reactive，跨端通用）
│  │  ├─ user.ts             #   用户态 + 资料 + 会话订阅
│  │  ├─ watchlist.ts        #   自选股（云端 / 本地降级 + Realtime）
│  │  ├─ nav.ts              #   UI 桥接（登录弹窗、跳转行情）
│  ├─ components/            # 跨端 UI 组件
│  │  ├─ OutlineIcon.vue     #   线条图标封装（uni-icons）
│  │  ├─ PriceText.vue / AnalysisCard.vue / KlineChart.vue
│  │  ├─ ReportView.vue / AuthModal.vue / AppTabBar.vue
│  ├─ views/                 # 三个页面视图
│  │  ├─ MarketView.vue / WatchlistView.vue / ProfileView.vue
│  ├─ pages/index/index.vue  # 壳页：底部导航 + 三视图切换 + 认证弹窗
│  ├─ styles/global.css      # 全局设计系统（颜色 / 间距 / 圆角 / 动效）
│  ├─ App.vue / main.ts
├─ uni_modules/              # 跨端组件（qiun-data-charts、uni-icons，已 vendored）
├─ supabase/
│  ├─ schema.sql            # 建表 / RLS / 触发器 / 存储桶 / Realtime
│  └─ functions/get-quote/  # 可选 Edge Function 行情代理
└─ manifest.json / pages.json / vite.config.ts
```

---

## 📡 行情数据源（官方门户接口）

**数据链路**：交易所（上交所 / 深交所 / 港交所）是行情的源头 → 数据商（东方财富、同花顺、腾讯、新浪等）通过授权行情源 / 镜像拿到数据 → 再以各自的 **web API** 对外提供。本项目直接调用这些**交易所授权门户的官方 web 接口**，不走东方财富 JSONP。

| 数据 | 接口（均为东方财富） | 说明 |
| --- | --- | --- |
| 实时行情 | `push2.eastmoney.com/api/qt/stock/get` | 最新价/昨收/开/高/低/名称/时间；价格按市场精度缩放（A 股×100、港股×1000） |
| K 线（日/周/月/年） | `push2his.eastmoney.com/api/qt/stock/kline/get` | 无 CORS，经代理获取 |
| 分时 | `push2his.eastmoney.com/api/qt/stock/trends2/get` | 无 CORS，经代理获取 |
| 主力净流入（资金流） | `push2his.eastmoney.com/api/qt/stock/fflow/kline/get` | 无 CORS，经代理获取 |

**为什么不再用 JSONP**：部署到 H5（iframe / 静态托管）后，浏览器出于安全会**禁止跨域 `<script>` 注入**，JSONP 直接失败（即之前「行情接口请求失败(JSONP)」的根因）。改为统一的 `fetch` + 代理后，任何环境都不会再出现该问题。

**请求通道（自动选择，按优先级）**：
1. 同源代理路径 `/rt`（实时）`/em`（K 线 / 分时 / 资金流）：开发期由 Vite 代理（`vite.config.ts`）、生产期由自带的 Node 代理服务（`server/index.js`）承接，浏览器同域请求，无跨域问题；
2. 若同源路径不可用（如纯静态托管没有后端），自动回退到公共 CORS 代理（codetabs → allorigins → corsproxy.io）。

> 东方财富全部接口返回 **UTF-8**，前端用 `TextDecoder('utf-8')` 解码；实时行情价格按市场精度缩放（A 股×100、港股×1000），已在 `quote.ts` 的 `emPriceScale` 中处理。

> **前端无需手动选择沪/深/港/京**：输入股票代码（或名称）即按规则自动识别市场（`period.ts` 的 `resolveSecid` auto 模式：5 位→港股 116.、6 开头→沪 1.、0/3 开头→深 0.、4/8/9 开头→北交所 0.）并立即开始分析；同时提供东方财富搜索接口的代码/名称联想（网络不可用时自动隐藏，回退到规则识别）。自选股以 `secid` 反推的 `code`/`market` 存储。

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

### 自带行情代理 + 静态服务（推荐用于 H5 部署）

`server/index.js` 零依赖（仅 Node 内置模块）：一边托管打包后的 H5，一边把 `/tencent` `/sina` `/em`
代理到对应的官方门户接口（服务端 fetch，浏览器同域调用，彻底规避跨域与 JSONP）。

```bash
npm run build:h5                 # 先构建产物到 dist/build/h5
PORT=8787 node server/index.js   # 启动后访问 http://localhost:8787
```

部署到服务器时，把前端的环境变量 `VITE_API_PROXY` 指向该地址，前端即走同源代理；
不配则自动回退到公共 CORS 代理。

> **出网策略（实测）**：服务端优先**直连**上游（腾讯 / 新浪 / 东方财富均验证可用）；
> 直连偶发失败时自动回退到 `curl`（会读取系统 `HTTPS_PROXY`，兼顾公司 / 沙箱代理场景）。
> 已**废弃 `https-proxy-agent` 依赖**——实测东方财富经其 CONNECT 隧道会稳定 `socket hang up`，
> 而直连与 `curl` 均稳定返回数据。

> 注：在受限沙箱环境里 `vite` 依赖优化 / `uni` 清理产物时会触发批量删除被拦截而中断，
> 属环境限制；在本地普通机器上 `npm run dev:h5` 可正常运行。生产构建（`build:h5`）不受影响。

---

## 🔧 Supabase 配置（可选，不配也能分析）

1. 在 `src/config/app.ts` 填入 `SUPABASE_URL` 与 `SUPABASE_ANON_KEY`（或用环境变量
   `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` 注入）。
2. 在 Supabase 控制台 SQL Editor 执行 `supabase/schema.sql`。
3. 若希望小程序端走代理（规避域名白名单）：`USE_EDGE_FUNCTIONS=true`，
   并部署 `supabase/functions/get-quote`（`supabase functions deploy get-quote`）。

未配置时：登录不可用，但行情分析、本地自选（Storage 降级）完全可用。

---

## 🎨 跨端设计要点

- **业务逻辑与 UI 分离**：`utils/` 为纯函数，H5 / 小程序零改动复用。
- **图表用 uCharts**：微信小程序无 DOM / Canvas 适配负担，蜡烛 / 量 / MACD / 分时 / 筹码全支持。
- **图标用字体图标**：小程序不支持内联 SVG，统一走 `uni-icons` 字体方案。
- **避免 Web-only API**：不依赖 `window` / `document`（仅在 `isH5()` 守卫内使用），动效纯 CSS。
- **响应式布局**：以 `rpx` 为单位自适应屏宽；H5 桌面端用 `.app-shell` 居中成手机宽度，保证两端视觉一致。
