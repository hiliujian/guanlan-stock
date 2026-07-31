// =====================================================================
// 资讯情绪量化（纯函数，跨端通用）
//
// 把「股票关联新闻 / 行业动态 / 市场事件」转成可参与分析的量化信号：
//   · 用金融情感词库对标题+摘要做多空扫描，按词权重累加、按时间衰减；
//   · 归一化得到 -100(强利空) ~ +100(强利好) 的情绪分；
//   · 抽取命中的「催化剂 / 风险事件」关键词，供报告与风控引用。
//
// 设计原则：仅做「文本层面的情绪倾向统计」，不宣称读懂新闻语义；权重经过
// 人工分级（暴雷/退市/立案等尾部风险权重最高），并叠加时效衰减，保证
// 新鲜利好/利空对评分的影响大于陈旧消息。结果作为综合研判的一个因子，
// 与量价、资金等技术因子等权协同，不单独决定买卖。
// =====================================================================

export type NewsScope = "stock" | "industry" | "market";

export interface NewsItem {
  id: string;
  title: string;
  summary: string;
  time: string; // 原始时间文本
  ts: number; // epoch 毫秒；无法解析为 0
  source: string;
  url: string;
  scope: NewsScope;
}

export interface NewsSignal {
  score: number; // -100 ~ 100
  label: string; // 利好偏多 / 中性 / 利空偏空
  bullItems: number; // 偏多条目数
  bearItems: number; // 偏空条目数
  catalysts: string[]; // 命中的利好关键词（按权重降序）
  risks: string[]; // 命中的利空关键词（按权重降序）
  items: NewsItem[]; // 近因排序后的条目（用于展示，最多 12 条）
}

// 情感词库（人工分级权重：1~4，尾部风险最高）。命中即累加对应权重。
const BULL: [string, number][] = [
  ["业绩预增", 3], ["扭亏", 3], ["超预期", 2], ["盈利预告", 3], ["上调评级", 3],
  ["涨停", 3], ["涨停板", 3], ["利好", 3], ["政策利好", 3], ["中标", 2],
  ["签约", 2], ["订单", 2], ["回购", 2], ["增持", 2], ["分红", 1],
  ["获批", 2], ["涨价", 2], ["扩产", 1], ["高送转", 2], ["创新高", 2],
  ["突破", 1], ["机构看好", 2], ["产能释放", 1], ["困境反转", 2],
];
const BEAR: [string, number][] = [
  ["暴雷", 4], ["爆雷", 4], ["退市", 4], ["立案", 4], ["处罚", 3], ["监管", 2],
  ["业绩预减", 3], ["亏损", 3], ["商誉减值", 3], ["下调评级", 3], ["不及预期", 3],
  ["停产", 3], ["债务", 3], ["跌停", 3], ["减持", 3], ["利空", 3], ["维权", 2],
  ["诉讼", 2], ["问询", 2], ["质押", 2], ["降价", 2], ["召回", 2], ["商誉", 2],
  ["风险警示", 3], ["调查", 3],
];

// 时效衰减：越新的消息权重越高（1 天内全权，3 天内 0.7，7 天内 0.4，更旧 0.2；
// 无法解析时间按 0.5 计，既不无视也不高估）。
function recencyDecay(ts: number, now: number): number {
  if (!ts) return 0.5;
  const days = (now - ts) / 86_400_000;
  if (days <= 1) return 1;
  if (days <= 3) return 0.7;
  if (days <= 7) return 0.4;
  return 0.2;
}

function scan(text: string): { bullW: number; bearW: number; bullHits: string[]; bearHits: string[] } {
  const t = text || "";
  let bullW = 0;
  let bearW = 0;
  const bullHits: string[] = [];
  const bearHits: string[] = [];
  for (const [w, weight] of BULL) {
    if (t.includes(w)) {
      bullW += weight;
      if (!bullHits.includes(w)) bullHits.push(w);
    }
  }
  for (const [w, weight] of BEAR) {
    if (t.includes(w)) {
      bearW += weight;
      if (!bearHits.includes(w)) bearHits.push(w);
    }
  }
  return { bullW, bearW, bullHits, bearHits };
}

// 单条资讯的情绪标签（用于卡片着色）。取「权重最大」的一侧；若两侧皆无则中性。
export function tagNewsItem(item: NewsItem): "bull" | "bear" | "neutral" {
  const { bullW, bearW } = scan(item.title + " " + item.summary);
  if (bullW === 0 && bearW === 0) return "neutral";
  return bullW >= bearW ? "bull" : "bear";
}

// 多空信号总评分（核心量化入口）。
export function scoreNews(items: NewsItem[], now: number = Date.now()): NewsSignal {
  let bullItems = 0;
  let bearItems = 0;
  let bullW = 0;
  let bearW = 0;
  const catSet = new Set<string>();
  const riskSet = new Set<string>();
  const weighted: { item: NewsItem; w: number; side: "bull" | "bear" }[] = [];

  for (const it of items) {
    const { bullW: bw, bearW: rw, bullHits, bearHits } = scan(it.title + " " + it.summary);
    const decay = recencyDecay(it.ts, now);
    const wBull = bw * decay;
    const wBear = rw * decay;
    if (bw > 0) {
      bullItems++;
      bullW += wBull;
      bullHits.forEach((h) => catSet.add(h));
    }
    if (rw > 0) {
      bearItems++;
      bearW += wBear;
      bearHits.forEach((h) => riskSet.add(h));
    }
    // 记录该条「主导倾向」用于展示排序（无倾向不展示在情绪列表里）
    if (bw > 0 || rw > 0) {
      weighted.push({ item: it, w: Math.max(wBull, wBear), side: wBull >= wBear ? "bull" : "bear" });
    }
  }

  const total = bullW + bearW;
  let score = 0;
  if (total > 0) {
    // 平滑归一：分母 +2 避免少量消息时分数过激；结果恒在 (-100,100)
    score = ((bullW - bearW) / (bullW + bearW + 2)) * 100;
    score = Math.max(-100, Math.min(100, Math.round(score)));
  }
  const label = score >= 15 ? "利好偏多" : score <= -15 ? "利空偏空" : "中性";

  // 展示条目：按「情绪权重 × 时效」降序，最多 12 条
  weighted.sort((a, b) => b.w - a.w);
  const sortedItems = weighted.slice(0, 12).map((x) => x.item);

  return {
    score,
    label,
    bullItems,
    bearItems,
    catalysts: [...catSet].slice(0, 4),
    risks: [...riskSet].slice(0, 4),
    items: sortedItems,
  };
}

// =====================================================================
// 资讯筛选（量化程序视角的「严格关联 + 时效性」过滤）
//
// 设计目标：展示给投资者的资讯必须「经过严格的股票关联性匹配验证」，而非一堆
// 无关的噪声；同时这些资讯是情绪量化因子的直接输入，若混入无关条目会直接
// 干扰、偏差因子计算。两层过滤：
//   1) 有效性 + 时效：必须能解析出时间，且落在「最近 maxDays 天（含今日）」内；
//      无法解析时间（ts=0）或超期的条目直接丢弃——不能验证时效的内容不算
//      「有效资讯」，宁可少给也不给过期/无法判断的旧闻。
//   2) 严格关联性（所有 scope 统一执行）：条目必须真正在标题或摘要中命中
//      「股票代码 / 公司全称 / 去后缀核心词 / 去地理前缀简称」任一维度，
//      过滤掉代码搜索返回来的泛关联噪声以及不提及本股的行业/市场类资讯。
//   3) 排序：按发布时间倒序（最新在前），保持原有展示顺序与格式不变。
//
// 多维关联关键词（buildKeywords）示例：贵州茅台 →
//   [600519, 贵州茅台, 贵州茅台(去后缀无变化), 茅台(去地理前缀)]；
//   中国平安 → [601318, 中国平安, 中国平安, 平安]；
//   招商银行 → [600036, 招商银行, 招商(去后缀"银行"), 招商]；
//   宁德时代 → [300750, 宁德时代, 宁德时代, 宁德时代]（"宁德"非地理白名单→保留）。
// 这样既能兜住「用简称指代」（茅台）的新闻，又不会把毫不相关的通稿放进因子。
//
// 说明：若 code / name 均为空（极端情况下尚未解析出股票身份），关联性门槛
// 退化为「不过滤」（无法判断即不误杀），仅执行时效过滤。
// =====================================================================
export interface NewsFilterOpts {
  code: string; // 6 位股票代码
  name: string; // 股票名称（全称或标准简称）
  now?: number; // 基准时间（epoch ms），默认 Date.now()
  maxDays?: number; // 时效窗口（天，含今日），默认 3
}

// 公司后缀词（按长度降序优先匹配更长后缀），用于从全称提取核心词。
const NAME_SUFFIXES = [
  "股份有限公司", "有限责任公司", "有限公司", "集团公司", "集团",
  "银行", "证券", "保险", "地产", "置业", "科技", "技术", "控股", "实业",
  "制药", "电气", "能源", "化工", "传媒", "网络", "信息", "企业", "公司",
  "食品", "医药", "材料", "机械", "设备", "物流", "环保", "教育", "文化",
  "旅游", "航空", "汽车", "钢铁", "水泥", "电子", "软件", "半导体",
  "新能源", "生物医药", "股份",
];
// 地理前缀（省 / 直辖市 / 主要城市 / 中国），用于从核心词再提取「简称」。
const GEO_PREFIXES = [
  "中国", "北京", "上海", "天津", "重庆", "广东", "江苏", "浙江", "四川",
  "山东", "河南", "湖北", "湖南", "福建", "安徽", "河北", "陕西", "山西",
  "江西", "广西", "云南", "贵州", "甘肃", "海南", "宁夏", "青海", "西藏",
  "内蒙古", "新疆", "辽宁", "吉林", "黑龙江", "深圳", "广州", "杭州", "南京",
  "成都", "武汉", "西安", "苏州", "青岛", "宁波", "厦门", "大连", "东莞",
  "无锡", "佛山", "合肥", "长沙", "郑州", "济南", "福州", "沈阳", "哈尔滨",
  "昆明", "南昌", "南宁", "贵阳", "太原", "石家庄", "兰州", "海口",
];

// 由代码 + 名称派生「多维关联关键词」：代码、公司全称、去后缀核心词、去地理前缀简称。
function buildKeywords(code: string, name: string): string[] {
  const kw = new Set<string>();
  const c = (code || "").trim().toLowerCase();
  if (c) {
    kw.add(c); // 6 位代码（如 600519）
    const num = parseInt(c, 10);
    // 去前导零变体（如 002594→2594），但要求长度 >=4，避免 000001→1 这类过短串误伤
    if (!isNaN(num) && String(num).length >= 4) kw.add(String(num));
  }
  const nm = (name || "").trim().toLowerCase();
  if (nm) {
    kw.add(nm); // 公司全称 / 标准名（如 贵州茅台）
    let core = nm;
    for (const s of NAME_SUFFIXES) {
      // 去公司后缀 → 核心词（贵州茅台酒股份有限公司→贵州茅台；招商银行→招商）
      if (core.endsWith(s)) {
        core = core.slice(0, -s.length);
        break;
      }
    }
    if (core && core !== nm && core.length >= 2) kw.add(core);
    let shortN = core;
    for (const g of GEO_PREFIXES) {
      // 再去地理前缀 → 简称（贵州茅台→茅台；中国平安→平安；北京银行→北京）
      if (shortN.startsWith(g)) {
        shortN = shortN.slice(g.length);
        break;
      }
    }
    if (shortN && shortN !== core && shortN !== nm && shortN.length >= 2) kw.add(shortN);
  }
  return [...kw].filter((k) => k.length >= 2);
}

// 严格关联判定：任一关键词（>=2 字符）出现在标题或摘要中即视为相关。
function isRelated(it: NewsItem, kws: string[]): boolean {
  if (!kws.length) return true; // 无可判定身份时不误杀
  const hay = (it.title + " " + it.summary).toLowerCase();
  return kws.some((k) => hay.includes(k));
}

export function filterNews(items: NewsItem[], opts: NewsFilterOpts): NewsItem[] {
  const now = opts.now ?? Date.now();
  const maxDays = opts.maxDays ?? 3;
  const cut = now - maxDays * 86_400_000; // 窗口下界（含今日往前 maxDays 天）
  // 多维关联关键词：代码 / 全称 / 核心词 / 简称
  const kws = buildKeywords(opts.code, opts.name);
  const out: NewsItem[] = [];
  for (const it of items) {
    // 1) 有效性 + 时效：必须可解析时间，且在 [now-maxDays, now+1天] 窗口内
    //    （+1 天容忍少量时钟/时区偏差，避免把"今天"的资讯误判为超期）
    if (!it.ts || it.ts < cut || it.ts > now + 86_400_000) continue;
    // 2) 严格关联性：所有 scope 统一要求命中关联关键词，确保展示与情绪量化因子
    //    的每一条资讯都经过股票关联验证，避免无关资讯干扰因子计算。
    if (!isRelated(it, kws)) continue;
    out.push(it);
  }
  // 3) 时间倒序（保持原有排序逻辑与展示格式不变）
  out.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  return out;
}
