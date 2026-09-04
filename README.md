# 观澜 · A 股智能行情与投资社区

一套基于 **uni-app (Vue 3 + TypeScript)** 的跨端行情应用：专业 K 线图表、全指标智能分析报告、
自选异动提醒、全球市场指数面板，以及内置的**投资社区**（发帖 / 关注 / 私信 / 等级成长体系）。
后端由 **Supabase**（PostgreSQL / Auth / Edge Functions / Realtime）承载，前端可静态托管，无需自建服务器。

> 构建目标：**H5 网页**（主端）+ 微信小程序 / App（同一套代码编译产出）。

---

## ✨ 功能总览

### 📈 行情与图表
- **多周期 K 线**：分时 / 日 / 周 / 月 / 年，量能、MACD 副图可独立开关，量均线 MA5/10/20 各自独立显示。
- **智能标注**：系统按行情自动绘制结构支撑 / 压力、交易参考 S/B、趋势线（虚线锁定，与手绘实线区分），多周期独立配置、分时自动禁用防误导。
- **手绘画线**：横线 / 趋势线 / 黄金分割，按股票本地持久化，重进自动恢复；价位磁吸到 K 线高低开收。
- **右侧标签防重叠**：价格轴标签统一错位布局，多条价位接近的线自动上下接着排，永不叠字。

### 🌍 全球市场指数面板
- 六组并排：**A 股指数 / 亚太市场 / 美股市场 / 欧洲市场 / 商品期货 / 科技热点**。
- **科技热点**中美成对：A 股引用东财官方概念板块指数（半导体 / 存储芯片 / CPO / AI 应用 / 商业航天 / 机器人）；
  美股自建**等权篮子**（英伟达、博通、台积电、阿斯麦、美光、Coherent、Palantir、Rocket Lab、
  特斯拉等 46 只代表股，覆盖 GPU/代工/设备、内存/硬盘、光模块/连接器、云与 AI 软件、
  火箭/星座/月球、人形/手术/仓储机器人等主线环节），
  只展示涨跌幅、不合成伪点位，并以「篮子」角标明示口径。
- **期指持仓**：中金所官方持仓排名（中信席位 / 前 20 机构加多加空），客观数据中性着色。

### ⭐ 自选与异动
- 自选分组管理、显示列自定义、长按快捷操作。
- **今日最热**榜单 + **今日异动**提醒：封涨停 / 封跌停 / 快速拉升下跌 / 大笔买卖 / 放量突破，
  涨红绿跌统一语义，跌停开板 / 炸板展示「较跌停 +x.xx%」距板幅度。

### 🧠 智能分析报告
- 覆盖 MACD / KDJ / RSI / ADX(DMI) / BIAS / 布林带宽 / 量比 / 资金流 / 筹码分布 / OBV / 最大回撤 / VaR 等全指标，白话解读。
- **综合技术评分**与风险等级：每项加减分明示理由（如「RSI偏高 −6」），资讯情绪 ±12 分纳入。
- 形态信号卡：金叉死叉、超买超卖、乖离、变盘信号等，文案与阈值同源一致，缺数据一律降级「暂无数据」不误导。
- 附带简单回测（信号胜率 / 平均收益，样本不足自动隐藏）。

### 👥 投资社区
- 帖子流 / 点赞 / 评论与回复展开；发帖可附**持仓卡片**（单张或多张包）。
- 用户名片、用户名模糊搜索、关注体系、**私信**（对方未开启则显式提示）。
- 消息中心（通知 + 会话）、公告弹窗。

### 👤 用户与成长
- 游客即用：行情分析与本地自选无需登录；登录后自选 / 资料 / 关注云端同步。
- **等级体系**：经验自动累积（后端只升不降），全等级徽章可见可点，等级页展示进度与权益。
- **VIP 会员**：黑金昵称 / 金冠徽章，与等级徽章一套视觉体系。
- 公开资料页：他人可查看简介 / 注册时间 / 公开自选 / 动态；头像框、资料编辑、账号安全、自助注销。

---

## 📡 行情数据链路（多源冗余）

```
交易所 → 数据商 Web API → Edge Function 服务端转发 → 前端解析
```

- **三级冗余 + 熔断自愈**：东方财富 → 腾讯证券 → 新浪财经，单源连续失败熔断 60s，恢复自动切回；单家故障不影响整页。
- **数据源优先级可配置**：Supabase `app_config` 表远程下发（菜单显隐 / 各类数据源顺序），改库即生效、无需发版。
- **通道自动降级**：Edge Function 代理（规避 CORS 与小程序白名单）→ 直连(UA/Referer) → JSONP → 公共 CORS 代理。
- **多市场覆盖**：A 股 / 港股 / 美股 / 指数走东财-腾讯-新浪；商品期货（沪金沪银沪铜 / 原油 / COMEX）走新浪期货接口；期指持仓走中金所官方 CSV。
- 输入代码或名称自动识别市场（沪 / 深 / 港 / 京），无需手动切换。

## 🔧 工程亮点

- **业务与 UI 分离**：`src/utils/` 全部纯函数（分析引擎、周期解析、形态识别），零平台依赖，跨端复用。
- **设计系统 token 化**：颜色（涨跌 / 警示 / 淡黑规范）、字号梯度、阴影 / 圆角 / 动效全部 CSS 变量收敛，`npm run lint:font` 守护字号纪律。
- **组件化底部窗体**：`PeekSheet` 统一折叠 / 半屏 / 铺满三态手势，切页自动收起；消息中心 / 发帖 / 关注列表 / 指数面板 / 热榜同一套交互。
- **路由与权限守卫**：`useAuthGuard` + `usePageGuard` 双保险，游客可达页白名单化管理。
- **浅 / 深主题**：跟随系统切换，K 线等 canvas 场景统一解析真实色值兜底。
- **上线即体检**：`vue-tsc` strict 全量类型检查；无 console 调试残留、无未使用导出 / 组件 / 死样式（发布前扫描清零）。

---

## 📁 目录结构

```
src/
├─ api/                     # 数据层：多源注册表 + 并发首胜 + 熔断降级
│  ├─ sources/              #   eastmoney / tencent / sina 解析器 + transport 通道降级
│  ├─ globalIndices.ts      #   全球指数 + 科技热点篮子合成
│  ├─ quote.ts / community.ts / auth.ts / user.ts / cffex.ts ...
├─ components/              # 跨端组件
│  ├─ StockChart.vue        #   K 线引擎（klinecharts 定制：智能标注 / 手绘 / 磁吸 / 标签布局）
│  ├─ ReportView.vue        #   智能分析报告
│  ├─ MarketView / WatchlistView / CommunityView / ProfileView / RankView → src/views/
│  ├─ PeekSheet / BottomSheet / MessageCenter / PostComposer / UserAvatar / LevelTag ...
├─ store/                   # 轻量响应式状态（user / watchlist / level / community / anomaly ...）
├─ composables/             # useAuthGuard / usePreventPageScroll
├─ utils/                   # 纯业务逻辑：analyzer / autoLevels / period / marketStatus ...
├─ pages/                   # 登录注册 / 资料编辑 / 等级 / VIP / 设置 / 法务 等二级页
├─ styles/global.css        # 设计系统 token + 深色主题
├─ config/                  # 运行期配置 + app_config 远程合成
supabase/
├─ deploy.sql               # 建表 / RLS / Realtime（幂等）
├─ functions/               # Edge Functions：guanlan-quote-proxy（行情转发）/ login-geo / delete-account
└─ DEPLOY.md                # 部署指引
scripts/                    # 校准与验证脚本（MACD 对拍 / 科技热点实测 / 字号检查 ...）
```

---

## 🚀 运行

> 要求 Node ≥ 18（推荐 20/22）。

```bash
npm install

# H5 开发 / 构建（产物 dist/build/h5，可静态托管）
npm run dev:h5
npm run build:h5

# 微信小程序 / App（可选）
npm run dev:mp-weixin && npm run build:mp-weixin
npm run dev:app && npm run build:app

# 质量检查
npm run type-check    # vue-tsc strict 全量类型检查
npm run lint:font     # 字号 token 纪律检查
```

## ⚙️ Supabase 配置（不配也能分析，配了功能完整）

1. `.env` 填入 `VITE_SUPABASE_URL` 与 `VITE_SUPABASE_ANON_KEY`。
2. SQL Editor 执行 `supabase/deploy.sql`（幂等）。
3. 部署 Edge Functions：`npx supabase functions deploy guanlan-quote-proxy`（详见 `supabase/DEPLOY.md`）。

未配置时：登录 / 云同步 / 社区不可用，但行情分析（本地默认配置）与本地自选完全可用。
