// 一次性验证脚本：核对「科技热点」组全部篮子成员在东财 ulist（生产同 URL）的可达性 + 等权涨跌幅试算。
// 与 src/api/globalIndices.ts 的科技热点篮子成员保持一致；新增/更换成员后必须重跑本脚本。
// 用法：node scripts/verify-tech-hotspots.mjs
import { execFileSync } from "node:child_process";

const FIELDS = "f2,f3,f4,f12,f13,f14";
const HOSTS = ["push2.eastmoney.com", "push2delay.eastmoney.com"]; // 实时主机，延迟主机兜底
const buildUrl = (host, secids) =>
  `https://${host}/api/qt/ulist.np/get?fltt=2&secids=${secids.join(",")}&fields=${FIELDS}`;

// 东财对无 UA 请求偶发断连（反爬）：带浏览器 UA/Referer、实时主机失败回退延迟主机、重试 3 轮
function fetchRows(secids, tries = 3) {
  for (let i = 0; i < tries; i++) {
    for (const host of HOSTS) {
      const args = [
        "-s", "-m", "10",
        "-H", "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "-H", "Referer: https://quote.eastmoney.com/",
        buildUrl(host, secids),
      ];
      let out = "";
      try {
        out = execFileSync("curl", args, { encoding: "utf-8" });
      } catch (e) {
        out = String(e.stdout || "");
      }
      if (out) {
        try {
          const j = JSON.parse(out);
          const diff = j?.data?.diff;
          if (diff) return Array.isArray(diff) ? diff : Object.values(diff);
        } catch { /* 非 JSON，换下一主机 */ }
      }
    }
    execFileSync("ping", ["-n", "2", "127.0.0.1"], { stdio: "ignore" });
  }
  return [];
}

// 全部篮子（与 src/api/globalIndices.ts 保持一致）。东财 A 股 secid 规则：
// 沪市（60x/68x）用 1. 前缀，深市（00x/30x）用 0. 前缀；韩 177=KOSPI，日 176=东证；
// 美股 105=NASDAQ，106=NYSE。
const BASKETS = {
  // ---- 中国 ----
  "半导体(中国)": ["1.688981", "1.688256", "1.688041", "0.002371", "1.688012", "1.688072", "1.688347", "1.600584", "1.603501"],
  "存储芯片(中国)": ["1.688008", "1.603986", "0.300223", "0.301308", "1.688525", "1.688110"],
  "CPO(中国)": ["0.300308", "0.300502", "1.601138", "0.300394", "0.002281", "1.688498", "0.000988"],
  "PCB(中国)": ["0.002463", "0.300476", "0.002916", "0.002384", "1.600183", "0.002938"],
  "MLCC(中国)": ["0.300408", "0.000636", "0.002138", "1.600563", "0.002484", "1.603678"],
  "AI应用(中国)": ["0.002230", "0.002415", "0.300033", "1.688111", "1.601360", "1.600570", "1.688777", "1.600845"],
  "商业航天(中国)": ["1.601698", "1.600118", "1.600879", "0.002025", "1.688568", "1.688333"],
  "机器人(中国)": ["0.002050", "1.601689", "0.300124", "0.002920", "0.002747", "1.603728", "1.688017", "1.688169", "1.601231", "0.300679", "0.300735"],
  // ---- 韩日 ----
  "半导体(韩国)": ["177.005930", "177.000660"],
  "半导体(日本)": ["176.8035", "176.6857", "176.6146", "176.4063", "176.6920"],
  // ---- 美国 ----
  "半导体(美国)": ["105.NVDA", "105.AVGO", "105.AMD", "106.TSM", "105.ASML", "105.INTC", "105.QCOM", "105.TXN", "105.ADI", "105.MRVL", "105.AMAT", "105.LRCX", "105.KLAC"],
  "存储芯片(美国)": ["105.MU", "105.SNDK", "105.STX", "105.WDC"],
  "CPO(美国)": ["106.ANET", "106.COHR", "105.CRDO", "105.ALAB", "106.CIEN", "105.LITE", "105.CSCO", "106.APH", "106.GLW", "106.FN", "105.AAOI"],
  "AI应用(美国)": ["105.PLTR", "105.MSFT", "105.GOOG", "105.META", "105.AMZN", "106.ORCL", "106.NOW", "106.CRM", "105.ADBE", "105.APP", "106.SNOW"],
  "商业航天(美国)": ["105.RKLB", "105.ASTS", "105.LUNR", "106.RDW", "106.PL", "106.SPCE"],
  "机器人(美国)": ["105.TSLA", "105.NVDA", "105.ISRG", "105.PRCT", "105.TER", "105.HON", "106.EMR", "105.SYM", "106.ROK"],
};

function flipPrefix(secid) {
  const [mkt, code] = secid.split(".");
  if (mkt !== "105" && mkt !== "106") return null;
  return `${mkt === "105" ? "106" : "105"}.${code}`;
}

const all = [...new Set(Object.values(BASKETS).flat())];
const rows = fetchRows(all);
const got = new Map(rows.map((r) => [`${r.f13}.${r.f12}`, r]));
console.log(`TOTAL ${rows.length}/${all.length}`);
const missing = all.filter((s) => !got.has(s));
console.log("MISSING:", missing.join(",") || "none");
if (missing.length) {
  console.log("\n== 缺数据成员：试反向交易所前缀（仅美股）==");
  const alt = missing.map(flipPrefix).filter(Boolean);
  if (alt.length) {
    for (const r of fetchRows(alt)) {
      console.log(`${r.f13}.${r.f12}  ${r.f14}  pct=${r.f3}  <-- 正确前缀应为这个`);
    }
  }
}

console.log("\n== 篮子等权涨跌幅试算（与前端合成口径一致）==");
for (const [name, secids] of Object.entries(BASKETS)) {
  const rs = secids.map((s) => got.get(s)).filter((r) => r && Number.isFinite(Number(r.f3)));
  const pct = rs.reduce((s, r) => s + Number(r.f3), 0) / rs.length;
  const detail = rs.map((r) => `${r.f14}${Number(r.f3) > 0 ? "+" : ""}${r.f3}%`).join(" | ");
  console.log(`${name}  成员${rs.length}/${secids.length}  等权pct=${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%\n   ${detail}`);
}
