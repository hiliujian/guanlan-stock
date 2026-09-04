// 全球重要市场指数目录 + 批量实时报价。
//
// 取数统一走 Eastmoney ulist 网关（fltt=2 返回真实价格，单次请求覆盖全部标的，
// 零后端改动、前端并发降为 0）。详见 src/api/sources/index.ts 的 getUlistQuotes。
//
// 数据可用性（实测）：A股主要指数、恒生/恒生科技/韩国/日经、美股三大、欧洲四大，
// 均经 Eastmoney ulist（实时主机）返回真实点位；商品期货（沪金/沪银/沪铜/原油主连、
// COMEX 金/银/铜、WTI/布伦特原油）Eastmoney 不提供，改走新浪期货接口返回真实价格。
import {
  getUlistQuotes,
  getFuturesQuotes,
  getTencentFallbackQuotes,
  getSinaUsExtQuotes,
  parseSinaUsExtTime,
  FUTURES_SECIDS,
  type UlistQuote,
  type SinaUsExtQuote,
} from "@/api/sources";

interface GlobalIndexItem {
  secid: string;
  name: string;
  /** 国旗 ISO 3166-1 alpha-2 码（用于列表前的小国旗图标）；商品期货等非国家标的留空改用 icon */
  flag?: string;
  /** 非国家标的（商品期货等）改用本地 PNG 图片图标（gold / silver / copper / oil），与 flag 二选一 */
  icon?: string;
  /** 篮子合成指数的成分股 secid 列表：有此字段时本项为「等权合成指数」，
   *  点位=成分股最新价等权平均、涨跌幅=成分股涨跌幅等权平均（与市场魔方同思路，
   *  用一篮子代表股合成主题指数，而非拿单只股票冒充）。secid 仅作展示键（bkt.* 非真实行情代码）。 */
  members?: string[];
}
interface GlobalIndexGroup {
  title: string; // 分组标题：A股指数 / 亚太市场 / 美股市场 / 欧洲市场 / 商品期货 / 科技热点
  items: GlobalIndexItem[];
}
type GlobalSessionLabel = "盘前" | "盘中" | "盘后";
export interface GlobalIndexQuote {
  secid: string;
  name: string;
  price: number | null; // 最新点位
  pct: number | null; // 涨跌幅(%)，带符号
  chg: number | null; // 涨跌额，带符号
  /** 篮子项当前所处美股行情阶段（盘前/盘中/盘后），UI 用它替代固定「篮子」角标；非篮子项缺省 */
  session?: GlobalSessionLabel;
  /** 美股篮子盘前/盘后时段的「正式涨跌幅」(%, 相对昨日收盘的正式时段涨跌)。仅此时填充供小字并列展示；其余缺省 */
  regPct?: number | null;
}

// ---------------- 美东交易日划分（时区经 Intl 由 ICU 处理，自动适应冬/夏令时） ----------------
type UsSession = "pre" | "regular" | "post" | "closed";
interface EtNow {
  weekday: string;
  month: number;
  day: number;
  minutes: number; // 当日 0 点起的美东分钟数
}
function etNow(d: Date = new Date()): EtNow {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value || "";
  return {
    weekday: g("weekday"),
    month: parseInt(g("month"), 10),
    day: parseInt(g("day"), 10),
    minutes: (parseInt(g("hour"), 10) % 24) * 60 + parseInt(g("minute"), 10),
  };
}
/** 美股当前阶段：盘前 04:00–09:30 / 盘中 09:30–16:00 / 盘后 16:00–20:00（美东，周一至五）。 */
function usSession(d: Date = new Date()): UsSession {
  const et = etNow(d);
  if (et.weekday === "Sat" || et.weekday === "Sun") return "closed";
  if (et.minutes >= 240 && et.minutes < 570) return "pre";
  if (et.minutes >= 570 && et.minutes < 960) return "regular";
  if (et.minutes >= 960 && et.minutes < 1200) return "post";
  return "closed";
}

// 全球重要市场指数目录（按地区/品种分组）。国家/地区标的用 flag（列表前小国旗）；
// 商品期货等非国家标的改用 icon（本地 PNG 图片图标，如 gold / silver / copper / oil），与 flag 二选一。
export const GLOBAL_INDEX_GROUPS: GlobalIndexGroup[] = [
  {
    title: "A股指数",
    items: [
      { secid: "1.000001", name: "上证指数", flag: "cn" },
      { secid: "0.399001", name: "深证成指", flag: "cn" },
      { secid: "0.399006", name: "创业板指", flag: "cn" },
      { secid: "1.000688", name: "科创50", flag: "cn" },
      { secid: "1.000300", name: "沪深300", flag: "cn" },
      { secid: "1.000905", name: "中证500", flag: "cn" },
      { secid: "1.000852", name: "中证1000", flag: "cn" },
      { secid: "1.000016", name: "上证50", flag: "cn" },
    ],
  },
  {
    title: "亚太市场",
    items: [
      { secid: "100.HSI", name: "恒生指数", flag: "hk" },
      { secid: "100.HSTECH", name: "恒生科技指数", flag: "hk" },
      { secid: "100.KS11", name: "韩国KOSPI", flag: "kr" },
      { secid: "100.N225", name: "日经225", flag: "jp" },
    ],
  },
  {
    title: "美股市场",
    items: [
      { secid: "100.DJIA", name: "道琼斯", flag: "us" },
      { secid: "100.NDX", name: "纳斯达克", flag: "us" },
      { secid: "100.SPX", name: "标普500", flag: "us" },
    ],
  },
  {
    title: "欧洲市场",
    items: [
      { secid: "100.FTSE", name: "英国富时100", flag: "gb" },
      { secid: "100.GDAXI", name: "德国DAX", flag: "de" },
      { secid: "100.FCHI", name: "法国CAC40", flag: "fr" },
      { secid: "100.SX5E", name: "欧洲斯托克50", flag: "eu" },
    ],
  },
  {
    title: "商品期货",
    items: [
      { secid: "114.AU0", name: "沪金主连", icon: "gold" },
      { secid: "114.AG0", name: "沪银主连", icon: "silver" },
      { secid: "114.CU0", name: "沪铜主连", icon: "copper" },
      { secid: "114.SC0", name: "原油主连", icon: "oil" },
      { secid: "112.GC00Y", name: "纽约金", icon: "gold" },
      { secid: "112.SI00Y", name: "纽约银", icon: "silver" },
      { secid: "112.HG00Y", name: "美铜", icon: "copper" },
      { secid: "112.CL00Y", name: "美原油", icon: "oil" },
      { secid: "112.BR00Y", name: "布伦特原油", icon: "oil" },
    ],
  },
  {
    // 科技热点（中美合为一组）：与「市场魔方」行业级口径不同——此处是**热点概念细分**，
    // 非申万电子/计算机/通信/传媒全行业口径，目的在于让用户快速看 AI/半导体/机器人等
    // 最热科技方向的涨跌，不等同于「科技板块整体」。
    // A 股项直接引用东财概念板块指数（官方市值加权指数，返回真实点位）；
    // 美股东财无 SOX 等主题指数覆盖，按同思路自建等权合成指数：每主题取一篮子代表性
    // 美股（全部经网关 ulist 有实时行情），涨跌幅由成分股等权平均。
    // 篮子覆盖原则：覆盖该主题市场公认的主线环节（如半导体含 GPU/ASIC/代工/设备/模拟，
    // CPO 含光模块/光引擎/连接器/交换芯片，机器人含人形/手术/仓储/协作/自动化），
    // 每只均为对应环节的代表性公司，避免单点偏差；全部成员经 scripts/verify-tech-hotspots.mjs
    // 实测在东财网关可达。新增/更换成员后必须重跑该脚本核对前缀与名称。
    // 东财美股 secid 规则（实测确认）：NASDAQ 上市用 105. 前缀，NYSE 上市用 106. 前缀。
    // COHR / CIEN / ROK 均为 NYSE 上市，必须用 106.；曾误把它们统一成 105. 导致静默取不到
    // 数据、篮子口径失真，故此处显式用 106.。
    // 盘前/盘后阶段：改用新浪美股 gb_ 扩展行情驱动篮子（见 fetchGlobalIndices 的分级过滤），
    // 角标同步显示当前阶段（盘前/盘中/盘后）。
    // 日韩主题（半导体/存储）：东财 ulist 覆盖韩国 KOSPI（市场号 177）与日本东证（市场号 176）
    // 的个股行情，均为等权合成篮子；KST/JST 交易时段与美东无关，恒走常规口径、
    // 不打美东阶段标签（见 fetchGlobalIndices 的 flag 特判）。
    title: "科技热点",
    items: [
      { secid: "90.BK0917", name: "半导体(中国)", flag: "cn" },
      { secid: "90.BK1137", name: "存储芯片(中国)", flag: "cn" },
      { secid: "90.BK1128", name: "CPO(中国)", flag: "cn" },
      { secid: "90.BK1629", name: "AI应用(中国)", flag: "cn" },
      // PCB 与 MLCC 为 AI 硬件上游核心环节（高多层板/HDI、被动元件），东财官方概念板块指数
      { secid: "90.BK0877", name: "PCB(中国)", flag: "cn" },
      { secid: "90.BK0890", name: "MLCC(中国)", flag: "cn" },
      { secid: "90.BK0963", name: "商业航天(中国)", flag: "cn" },
      { secid: "90.BK1090", name: "机器人(中国)", flag: "cn" },
      // 半导体(韩国)：三星电子(存储/代工/手机 SoC) + SK海力士(HBM/DRAM，全球存储双寡头)。
      // 东财 177 = KOSPI 市场号，ulist 实测可用
      { secid: "bkt.kr.semi", name: "半导体(韩国)", flag: "kr", members: ["177.005930", "177.000660"] },
      // 半导体(日本)：东京电子(涂胶显影/刻蚀设备) + 爱德万测试(SoC/存储测试机) +
      // 迪斯科(切割/研磨设备) + 信越化学(硅片)，设备与材料是日本半导体支柱环节。
      // 东财 176 = 日本东证市场号，8035 实测可用（东京电子）
      { secid: "bkt.jp.semi", name: "半导体(日本)", flag: "jp", members: ["176.8035", "176.6857", "176.6146", "176.4063"] },
      {
        // GPU/ASIC(英伟达/博通/AMD) + 代工/设备(台积电/阿斯麦/应用材料/泛林) +
        // CPU/模拟/连接(英特尔/高通/德仪/ADI/迈威尔)，覆盖半导体主线环节
        secid: "bkt.us.semi",
        name: "半导体(美国)",
        flag: "us",
        members: [
          "105.NVDA",
          "105.AVGO",
          "105.AMD",
          "106.TSM",
          "105.ASML",
          "105.INTC",
          "105.QCOM",
          "105.TXN",
          "105.ADI",
          "105.MRVL",
          "105.AMAT",
          "105.LRCX",
        ],
      },
      // 内存(MU/SanDisk) + 硬盘(希捷/西数)：存储两大形态全覆盖
      { secid: "bkt.us.storage", name: "存储芯片(美国)", flag: "us", members: ["105.MU", "105.SNDK", "105.STX", "105.WDC"] },
      // 光模块/光引擎(Coherent/Lumentum/Ciena/新易盛对标 Fabrinet) + 连接/接入(AAOI/
      // Astera Labs) + 连接器/光纤(安费诺/康宁)，覆盖 CPO 产业链
      {
        secid: "bkt.us.cpo",
        name: "CPO(美国)",
        flag: "us",
        members: ["106.COHR", "105.LITE", "106.CIEN", "106.FN", "105.AAOI", "105.ALAB", "106.APH", "106.GLW"],
      },
      // 云与大模型平台(微软/谷歌/Meta/亚马逊) + AI 软件应用(Palantir/ServiceNow/
      // 赛富时/Adobe/AppLovin)，平台与行业应用兼顾
      {
        secid: "bkt.us.aiapp",
        name: "AI应用(美国)",
        flag: "us",
        members: ["105.PLTR", "105.MSFT", "105.GOOG", "105.META", "105.AMZN", "106.NOW", "106.CRM", "105.ADBE", "105.APP"],
      },
      // 火箭复用(Rocket Lab) + 低轨星座(AST) + 月球任务(Intuitive Machines) +
      // 空间基础设施(Redwire) + 卫星遥感(Planet) + 亚轨道旅游(维珍银河)
      { secid: "bkt.us.space", name: "商业航天(美国)", flag: "us", members: ["105.RKLB", "105.ASTS", "105.LUNR", "106.RDW", "106.PL", "106.SPCE"] },
      {
        // 人形/具身智能(特斯拉 Optimus + 英伟达 GR00T 平台) + 手术(直觉外科) +
        // 协作/半导体测试(泰瑞达) + 工业自动化(罗克韦尔) + 仓储(Symbotic) + 配送(Serve)
        secid: "bkt.us.robot",
        name: "机器人(美国)",
        flag: "us",
        members: ["105.ISRG", "105.TER", "106.ROK", "105.SYM", "105.SERV", "105.TSLA", "105.NVDA"],
      },
    ],
  },
];

// 全部待取 secid（去重）：普通标的取自身 secid，篮子合成指数展开为全部成分股，
// 供批量请求一次拿全（篮子展示键 bkt.* 不进请求）。
const ALL_SECIDS: string[] = Array.from(
  new Set(
    GLOBAL_INDEX_GROUPS.flatMap((g) =>
      g.items.flatMap((i) => (i.members ? i.members : [i.secid]))
    )
  )
);

// 批量拉取全球重要指数 + 商品期货实时报价。
// 指数走 Eastmoney ulist（实时主机）；商品期货 Eastmoney 不提供，改走新浪期货接口。
// 两者并行拉取后合并：目录中所有标的先填入「暂无」骨架，再覆盖真实数据；
// 任一源失败仅该部分缺数据，由上层降级为「暂无数据」。
//
// 篮子（美股科技热点）标签与数据强绑定——标签永远描述「当前展示数据所属的阶段」：
//   · 盘前/盘后 → 新浪扩展行情驱动（新鲜度 + 涨跌幅上限 + 一致性校验，盘后更严），标签=盘前/盘后；
//   · 盘中 → 仅当时钟处于盘中时段且成分股行情时间戳确为今日实时盘中，标签=盘中；
//   · 休市（深夜/周末/假期，数据定格在最近收盘）→ 不打任何阶段标签（UI 不显示角标），
//     绝不用「盘中」冒充实时数据。
export async function fetchGlobalIndices(): Promise<Map<string, GlobalIndexQuote>> {
  const map = new Map<string, GlobalIndexQuote>();
  for (const g of GLOBAL_INDEX_GROUPS) {
    for (const it of g.items) {
      map.set(it.secid, { secid: it.secid, name: it.name, price: null, pct: null, chg: null });
    }
  }
  const indexSecids = ALL_SECIDS.filter((s) => !FUTURES_SECIDS.includes(s));
  const futuresSecids = ALL_SECIDS.filter((s) => FUTURES_SECIDS.includes(s));
  const [idxQuotes, futQuotes, hkQuotes] = await Promise.all([
    getUlistQuotes(indexSecids).catch(() => [] as UlistQuote[]),
    getFuturesQuotes(futuresSecids).catch(() => [] as UlistQuote[]),
    getTencentFallbackQuotes(ALL_SECIDS).catch(() => [] as UlistQuote[]),
  ]);
  const memberTs = new Map<string, number>(); // 成分股行情时间戳（f124，秒）→「盘中」标签的数据实证
  for (const q of [...idxQuotes, ...futQuotes, ...hkQuotes]) {
    if (!q.secid) continue;
    map.set(q.secid, {
      secid: q.secid,
      name: q.name || map.get(q.secid)?.name || q.secid,
      price: q.price,
      pct: q.pct,
      chg: q.chg,
    });
    if (q.ts != null) memberTs.set(q.secid, q.ts);
  }

  // 篮子合成指数：成分股等权。涨跌幅/涨跌额=成员等权平均；个别成员缺行情自动跳过，
  // 全缺则该项降级「暂无数据」。注意：不合成伪「点位」——成分股股价量纲不同，等权平均
  // 出的数值无指数含义，故 price 置 null，UI 仅展示涨跌幅（与 A 股官方板块指数区分）。
  const session = usSession();
  const et = etNow();
  const extended = session === "pre" || session === "post";
  const extMap = new Map<string, SinaUsExtQuote>();
  if (extended) {
    const ext = await getSinaUsExtQuotes(
      GLOBAL_INDEX_GROUPS.flatMap((g) => g.items.flatMap((i) => i.members ?? []))
    ).catch(() => [] as SinaUsExtQuote[]);
    for (const e of ext) extMap.set(e.secid, e);
  }
  // 「盘中」标签须有数据实证：时钟在盘中时段，且至少有成分股行情时间戳落在今日盘中窗口内。
  // 假期/停盘/深夜/周末 → 不打标签（UI 隐藏角标），杜绝标签与数据脱节。
  const regularLive =
    session === "regular" &&
    GLOBAL_INDEX_GROUPS.some((g) =>
      g.items.some((i) =>
        (i.members ?? []).some((m) => tsInRegularWindow(memberTs.get(m), et))
      )
    );
  const label: GlobalSessionLabel | undefined =
    session === "pre" ? "盘前" : session === "post" ? "盘后" : regularLive ? "盘中" : undefined;
  for (const g of GLOBAL_INDEX_GROUPS) {
    for (const it of g.items) {
      if (!it.members) continue;
      // 日韩篮子（flag kr/jp）：KST/JST 交易时段与美东无关，成分也不在新浪美股扩展行情内——
      // 若套用美东 session，盘前/盘后时段会因 extMap 无数据而误显「暂无数据」。
      // 故恒走常规口径（东财 ulist 等权），且不打美东阶段标签（与亚太指数一致，收盘后展示当日收盘）。
      const nonUs = it.flag === "kr" || it.flag === "jp";
      const r = nonUs ? computeBasket(it, map, extMap, "regular", null) : computeBasket(it, map, extMap, session, et);
      map.set(it.secid, {
        secid: it.secid,
        name: it.name,
        price: null,
        pct: r.pct,
        chg: r.chg,
        regPct: nonUs ? null : (r.regPct ?? null),
        session: nonUs ? undefined : label,
      });
    }
  }
  return mergeWithLastGood(map);
}

// 刷新容错：源级失败在 fetchGlobalIndices 内被降级为「空数据」（对应条目 price/pct 全 null）。
// 若把这种结果直接覆盖到 UI，行情页会从「有数据」突变为「暂无数据」，体验突兀。
// 因此保留最近一次含有效数据的合并结果 lastGoodGlobal：
//   · 新结果整体无任何有效数据 → 整体沿用上次快照；
//   · 新结果部分缺失 → 仅对缺失条目用旧值补位（允许数据延迟，正常条目仍用新值）；
//   · 首次拉取（无旧快照）→ 原样返回，UI 正常显示「暂无数据」。
let lastGoodGlobal: Map<string, GlobalIndexQuote> | null = null;
function mergeWithLastGood(fresh: Map<string, GlobalIndexQuote>): Map<string, GlobalIndexQuote> {
  const hasData = (q: GlobalIndexQuote) => q.price != null || q.pct != null;
  if (![...fresh.values()].some(hasData)) return lastGoodGlobal ?? fresh;
  if (lastGoodGlobal) {
    for (const [secid, q] of fresh) {
      if (hasData(q)) continue;
      const old = lastGoodGlobal.get(secid);
      if (old && hasData(old)) fresh.set(secid, old);
    }
  }
  lastGoodGlobal = fresh;
  return fresh;
}

/** 行情时间戳是否落在美东今日正式时段窗口（09:30–16:00，容忍收盘整点秒级余量）。 */
function tsInRegularWindow(ts: number | undefined, et: EtNow): boolean {
  if (!ts) return false;
  const t = etNow(new Date(ts * 1000));
  return t.month === et.month && t.day === et.day && t.minutes >= 570 && t.minutes <= 965;
}

/** 扩展时段数据新鲜度：成交时间须为美东「今天」且落在当前阶段窗口内（防旧盘后/假期/隔日脏数据）。 */
function extFresh(
  t: { month: number; day: number; minutes: number; am: boolean } | null,
  et: EtNow,
  session: "pre" | "post"
): boolean {
  if (!t || t.month !== et.month || t.day !== et.day) return false;
  if (session === "pre") return t.am && t.minutes >= 240 && t.minutes < 570; // 04:00–09:30
  return !t.am && t.minutes >= 960 && t.minutes <= 1260; // 盘后 16:00–20:00，容忍 21:00 前的迟到的戳
}

/** 篮子等权计算：正式/休市走东财常规口径；盘前/盘后走新浪扩展行情并施加分级过滤。 */
function computeBasket(
  it: GlobalIndexItem,
  map: Map<string, GlobalIndexQuote>,
  extMap: Map<string, SinaUsExtQuote>,
  session: UsSession,
  et: EtNow | null
): { pct: number | null; chg: number | null; regPct: number | null } {
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  if (session === "pre" || session === "post") {
    const post = session === "post";
    // 过滤阈值：盘后比盘前更严（用户要求盘后不得沿用常规口径）。
    //   pctCap：单成员扩展涨跌幅绝对值上限（防错价/错小数点类脏数据）；
    //   consTol：报告涨跌幅 vs (扩展价-正式收盘)/正式收盘 推算值的容差(pp)（防字段错位）。
    const pctCap = post ? 15 : 25;
    const consTol = post ? 0.5 : 1.0;
    const rows: { pct: number; chg: number; reg: number | null }[] = [];
    for (const m of it.members ?? []) {
      const e = extMap.get(m);
      if (!e || e.extPrice == null || e.extPct == null || e.close == null) continue;
      if (!extFresh(parseSinaUsExtTime(e.extTime), et as EtNow, post ? "post" : "pre")) continue;
      if (Math.abs(e.extPct) > pctCap) continue;
      const derived = ((e.extPrice - e.close) / e.close) * 100;
      if (Math.abs(derived - e.extPct) > consTol) continue;
      // 正式涨跌幅 = (正式收盘-昨收)/昨收（与新浪 [2] 字段同义），供盘前/盘后小字并列展示
      const reg = e.preClose ? ((e.close - e.preClose) / e.preClose) * 100 : null;
      rows.push({ pct: e.extPct, chg: e.extPrice - e.close, reg });
    }
    // 准入下限：盘后须至少一半成分有新鲜有效数据；盘前至少 2 只（保证可产出又防单点脏数据）
    const quorum = post ? Math.ceil((it.members?.length ?? 0) / 2) : 2;
    if (rows.length < Math.max(quorum, 1)) return { pct: null, chg: null, regPct: null };
    const regs = rows.map((r) => r.reg).filter((v): v is number => v != null);
    return {
      pct: mean(rows.map((r) => r.pct)),
      chg: mean(rows.map((r) => r.chg)),
      regPct: regs.length ? mean(regs) : null,
    };
  }
  // 正式/休市：常规口径（东财 ulist 等权，价格与涨跌幅非空即可入样）
  const rows = (it.members ?? [])
    .map((m) => map.get(m))
    .filter((q): q is GlobalIndexQuote => !!q && q.price != null && q.pct != null);
  if (!rows.length) return { pct: null, chg: null, regPct: null };
  return {
    pct: mean(rows.map((q) => q.pct as number)),
    chg: mean(rows.map((q) => q.chg ?? 0)),
    regPct: null, // 常规口径的 pct 本身就是正式涨跌幅，无需另设
  };
}
