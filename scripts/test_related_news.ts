// ============================================================================
// 关联资讯全链路真实数据审计（漏 / 误关联 / 去重 / 时效 / 情绪匹配）
//
// 与 App 同链路复现：getNews（代码+公司名双关键词，合并去重，时间倒序）
//   → filterNews（生产函数直接 import：时效3天 + 严格关联）→ scoreNews（生产函数）。
// 审计维度：
//   1) 解析漏：ts=0（时间解析失败被时效过滤误杀）的原始时间格式采样；
//   2) 去重漏：跨关键词批内「同一底层文章 id」被 getNews 的 id+_idx 去重漏掉的数量；
//   3) 漏关联：被「严格关联」丢弃、但标题实际提及本股（人工审阅清单）；
//   4) 误关联：保留条目中命中的关键词明细（人工审阅短词误命中）；
//   5) 情绪匹配：scoreNews 输出与保留条目多空词命中的对照。
// ============================================================================
import { filterNews, scoreNews, type NewsItem } from "../src/utils/newsSentiment";
import { fetchNewsKeyword, type N } from "./quote_fetch";

// ---- 审计用关键词派生（与 newsSentiment.ts buildKeywords 同口径复刻，仅用于归因）----
const NAME_SUFFIXES = [
  "股份有限公司", "有限责任公司", "有限公司", "集团公司", "集团",
  "银行", "证券", "保险", "地产", "置业", "科技", "技术", "控股", "实业",
  "制药", "电气", "能源", "化工", "传媒", "网络", "信息", "企业", "公司",
  "食品", "医药", "材料", "机械", "设备", "物流", "环保", "教育", "文化",
  "旅游", "航空", "汽车", "钢铁", "水泥", "电子", "软件", "半导体",
  "新能源", "生物医药", "股份",
];
const GEO_PREFIXES = [
  "中国", "北京", "上海", "天津", "重庆", "广东", "江苏", "浙江", "四川",
  "山东", "河南", "湖北", "湖南", "福建", "安徽", "河北", "陕西", "山西",
  "江西", "广西", "云南", "贵州", "甘肃", "海南", "宁夏", "青海", "西藏",
  "内蒙古", "新疆", "辽宁", "吉林", "黑龙江", "深圳", "广州", "杭州", "南京",
  "成都", "武汉", "西安", "苏州", "青岛", "宁波", "厦门", "大连", "东莞",
  "无锡", "佛山", "合肥", "长沙", "郑州", "济南", "福州", "沈阳", "哈尔滨",
  "昆明", "南昌", "南宁", "贵阳", "太原", "石家庄", "兰州", "海口",
];
function buildKeywords(code: string, name: string): string[] {
  const kw = new Set<string>();
  const c = (code || "").trim().toLowerCase();
  if (c) {
    kw.add(c);
    const num = parseInt(c, 10);
    if (!isNaN(num) && String(num).length >= 4) kw.add(String(num));
  }
  const nm = (name || "").trim().toLowerCase();
  if (nm) {
    kw.add(nm);
    let core = nm;
    for (const s of NAME_SUFFIXES) {
      if (core.endsWith(s)) { core = core.slice(0, -s.length); break; }
    }
    if (core && core !== nm && core.length >= 2) kw.add(core);
    let shortN = core;
    for (const g of GEO_PREFIXES) {
      if (shortN.startsWith(g)) { shortN = shortN.slice(g.length); break; }
    }
    if (shortN && shortN !== core && shortN !== nm && shortN.length >= 2) kw.add(shortN);
  }
  return [...kw].filter((k) => k.length >= 2);
}

const ok = (m: string) => console.log("  ✅ " + m);
const warn = (m: string) => console.log("  ⚠️ " + m);
const info = (m: string) => console.log("  · " + m);

interface StockCase { secid: string; code: string; name: string; industry: string }
const CASES: StockCase[] = [
  { secid: "1.600519", code: "600519", name: "贵州茅台", industry: "酿酒行业" },
  { secid: "0.000001", code: "000001", name: "平安银行", industry: "银行" },
  { secid: "1.601318", code: "601318", name: "中国平安", industry: "保险" },
  { secid: "1.600036", code: "600036", name: "招商银行", industry: "银行" },
  { secid: "1.688256", code: "688256", name: "寒武纪", industry: "半导体" },
  { secid: "1.601919", code: "601919", name: "中远海控", industry: "航运港口" },
];

// getNews 同口径复刻：代码/公司名（stock）+ 行业名（industry）并行 → 按 id 去重（保持批次顺序）→ 时间倒序
function mergeLikeApp(batches: N[][]): NewsItem[] {
  const seen = new Set<string>();
  const out: NewsItem[] = [];
  for (const arr of batches) {
    for (const it of arr) {
      if (it && it.id && !seen.has(it.id)) {
        seen.add(it.id);
        out.push(it as unknown as NewsItem);
      }
    }
  }
  out.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  return out;
}

// 跨批「同一底层文章」审计：剥掉 mapItem 追加的 _idx 后缀比对
function baseId(id: string): string {
  return id.replace(/_\d+$/, "");
}

async function auditStock(c: StockCase) {
  console.log(`\n🔍 ${c.name}(${c.code})`);
  const keys = Array.from(new Set([c.code, c.name].filter((k) => k.trim().length >= 2)));
  const batches: N[][] = [];
  for (const k of keys) {
    try {
      const arr = await fetchNewsKeyword(k, "stock");
      batches.push(arr);
      info(`关键词「${k}」(stock)：${arr.length} 条`);
      await new Promise((r) => setTimeout(r, 250));
    } catch (e: any) {
      batches.push([]);
      warn(`关键词「${k}」抓取失败：${e?.message || e}`);
    }
  }
  // 板块资讯批（与 getNews 同口径：行业名有效且非公司名本身才抓）
  if (c.industry.trim().length >= 2 && c.industry.trim() !== c.name.trim()) {
    try {
      const arr = await fetchNewsKeyword(c.industry, "industry");
      batches.push(arr);
      info(`关键词「${c.industry}」(industry/板块)：${arr.length} 条`);
      await new Promise((r) => setTimeout(r, 250));
    } catch (e: any) {
      batches.push([]);
      warn(`关键词「${c.industry}」抓取失败：${e?.message || e}`);
    }
  }

  // 1) 解析漏：ts=0 的原始时间格式采样（会被时效过滤直接丢弃）
  const allRaw = batches.flat();
  const ts0 = allRaw.filter((x) => !x.ts);
  if (ts0.length) {
    const fmts = new Set(ts0.map((x) => x.time || "(空)"));
    warn(`ts=0 无法解析时间 ${ts0.length} 条（App 会直接丢弃），格式样本: ${[...fmts].slice(0, 5).join(" | ")}`);
  } else ok("时间解析：0 条 ts=0，无时效误杀");

  // 2) 去重漏：App 按 id(含 _idx) 去重；审计按底层 id 再去重对比
  const merged = mergeLikeApp(batches);
  const byBase = new Map<string, NewsItem[]>();
  for (const it of merged) {
    const b = baseId(it.id);
    if (!byBase.has(b)) byBase.set(b, []);
    byBase.get(b)!.push(it);
  }
  const dupGroups = [...byBase.values()].filter((g) => g.length > 1);
  if (dupGroups.length) {
    warn(`跨批去重漏：${dupGroups.length} 组同一文章被当成多条（App id+_idx 去重失效）`);
    dupGroups.slice(0, 3).forEach((g) =>
      info(`  重复组示例: [${g.map((x) => x._kw + "#" + x._idx).join(" / ")}] ${g[0].title.slice(0, 30)}`)
    );
  } else ok(`合并去重：${merged.length} 条无重复（底层 id 唯一）`);

  // 3) 时效 + 严格关联过滤（生产函数，板块资讯按行业名验证）
  const kept = filterNews(merged, { code: c.code, name: c.name, industry: c.industry });
  const keptSet = new Set(kept);
  const dropped = merged.filter((x) => !keptSet.has(x as NewsItem));
  const kws = buildKeywords(c.code, c.name);
  const indKw = c.industry.trim().toLowerCase();
  const now = Date.now();
  const cut = now - 3 * 86_400_000;
  const reasons = { ts0: 0, old: 0, future: 0, unrelated: 0 };
  const unrelated: NewsItem[] = [];
  for (const d of dropped) {
    if (!d.ts) reasons.ts0++;
    else if (d.ts < cut) reasons.old++;
    else if (d.ts > now + 86_400_000) reasons.future++;
    else { reasons.unrelated++; unrelated.push(d); }
  }
  const indKept = kept.filter((k) => (k as any).scope === "industry");
  info(`时效+关联过滤：${merged.length} → ${kept.length} 条（板块资讯 ${indKept.length} 条；丢弃：超期${reasons.old} 未来${reasons.future} 无时间${reasons.ts0} 不关联${reasons.unrelated}）`);

  // 4) 漏关联人工审阅清单：因「不关联」被丢弃的条目（标题需人工确认是否真无关）
  if (unrelated.length) {
    console.log("  ↓ 因「严格关联」丢弃的条目（审阅是否有漏）：");
    for (const u of unrelated.slice(0, 12)) info(`  [${u.time}] ${u.title.slice(0, 46)}`);
  }

  // 5) 误关联人工审阅清单：保留条目命中的关键词明细（板块条目按行业名归因）
  console.log("  ↓ 保留条目（时间倒序，含命中关键词）：");
  for (const k of kept.slice(0, 14)) {
    const hay = (k.title + " " + k.summary).toLowerCase();
    const hits = kws.filter((w) => hay.includes(w));
    if (!hits.length && (k as any).scope === "industry" && hay.includes(indKw)) hits.push(indKw);
    info(`  [${k.time}] (${hits.join("/") || "?"}) ${k.title.slice(0, 46)}`);
  }

  // 6) 情绪量化（生产函数）与保留条目对照
  const sig = scoreNews(kept);
  info(`情绪分 ${sig.score}（${sig.label}）偏多${sig.bullItems}/偏空${sig.bearItems} 催化[${sig.catalysts.join(",")}] 风险[${sig.risks.join(",")}]`);
  if (kept.length && sig.bullItems + sig.bearItems === 0) warn("保留条目全部中性，情绪因子未参与评分（需确认是否合理）");
  // 展示上限一致性：scoreNews.items 最多 12 条且 ⊆ kept
  const inKept = sig.items.every((x) => keptSet.has(x));
  if (!inKept) warn("scoreNews.items 存在不在保留集合中的条目（异常）");
}

async function main() {
  console.log("===== 关联资讯全链路审计（App 同链路：网关 → 东财搜索 → filterNews → scoreNews）=====");
  for (const c of CASES) {
    await auditStock(c);
  }
}
main();
