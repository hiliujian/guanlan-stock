// 一次性验证脚本：核对「科技热点」组全部标的在东财 ulist（生产同 URL）的可达性与名称映射。
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

const CN_BOARDS = {
  "90.BK0917": "半导体(中国)",
  "90.BK1137": "存储芯片(中国)",
  "90.BK1128": "CPO(中国)",
  "90.BK1629": "AI应用(中国)",
  "90.BK0963": "商业航天(中国)",
  "90.BK1090": "机器人(中国)",
};

// 目录中的美股成员（与 src/api/globalIndices.ts 保持一致）
const US_BASKETS = {
  "bkt.us.semi": {
    display: "半导体(美国)",
    members: ["105.NVDA", "105.AVGO", "105.AMD", "106.TSM", "105.ASML", "105.INTC", "105.QCOM", "105.TXN", "105.ADI", "105.MRVL", "105.AMAT", "105.LRCX"],
  },
  "bkt.us.storage": { display: "存储芯片(美国)", members: ["105.MU", "105.SNDK", "105.STX", "105.WDC"] },
  "bkt.us.cpo": { display: "CPO(美国)", members: ["106.COHR", "105.LITE", "106.CIEN", "106.FN", "105.AAOI", "105.ALAB", "106.APH", "106.GLW"] },
  "bkt.us.aiapp": { display: "AI应用(美国)", members: ["105.PLTR", "105.MSFT", "105.GOOG", "105.META", "105.AMZN", "106.NOW", "106.CRM", "105.ADBE", "105.APP"] },
  "bkt.us.space": { display: "商业航天(美国)", members: ["105.RKLB", "105.ASTS", "105.LUNR", "106.RDW", "106.PL", "106.SPCE"] },
  "bkt.us.robot": { display: "机器人(美国)", members: ["105.ISRG", "105.TER", "106.ROK", "105.SYM", "105.SERV", "105.TSLA", "105.NVDA"] },
};

function flipPrefix(secid) {
  const [mkt, code] = secid.split(".");
  return `${mkt === "105" ? "106" : "105"}.${code}`;
}

const cnRows = fetchRows(Object.keys(CN_BOARDS));
console.log("== A股板块（东财官方板块指数）==");
for (const r of cnRows) {
  const secid = `${r.f13}.${r.f12}`;
  console.log(`${secid}  板块名=${r.f14}  price=${r.f2}  pct=${r.f3}  展示名=${CN_BOARDS[secid]}`);
}

const allUs = Object.values(US_BASKETS).flatMap((b) => b.members);
const usRows = fetchRows(allUs);
const got = new Map();
for (const r of usRows) got.set(`${r.f13}.${r.f12}`, r);
console.log("\n== 美股成员（配置前缀可达性）==");
const missing = [];
for (const secid of allUs) {
  const r = got.get(secid);
  if (!r) {
    missing.push(secid);
    console.log(`${secid}  !! 无数据`);
    continue;
  }
  console.log(`${secid}  ${r.f14}  price=${r.f2}  pct=${r.f3}`);
}
if (missing.length) {
  console.log("\n== 缺数据成员：试反向交易所前缀 ==");
  const alt = missing.map(flipPrefix);
  for (const r of fetchRows(alt)) {
    console.log(`${r.f13}.${r.f12}  ${r.f14}  price=${r.f2}  pct=${r.f3}  <-- 正确前缀应为这个`);
  }
}

console.log("\n== 篮子等权涨跌幅试算（与前端合成口径一致）==");
for (const [, b] of Object.entries(US_BASKETS)) {
  const rows = b.members.map((m) => got.get(m)).filter((r) => r && Number.isFinite(Number(r.f3)));
  const pct = rows.reduce((s, r) => s + Number(r.f3), 0) / rows.length;
  console.log(`${b.display}  成员${rows.length}/${b.members.length}  等权pct=${pct.toFixed(2)}%`);
}
