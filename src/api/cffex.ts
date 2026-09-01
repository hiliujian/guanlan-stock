// =====================================================================
// 中金所（CFFEX）股指期货成交持仓排名 —— 最近已发布交易日的多空持仓变化
//
// 数据源：中金所官网日更 CSV（/sj/ccpm/YYYYMM/DD/{IF|IH|IC|IM}_1.csv，GBK 编码，
// 每交易日收盘后发布）。官网无 CORS 头，浏览器不能直连，统一经 Supabase 网关
// kind="cffex" 转发。
//
// 口径（覆盖 IF/IH/IC/IM 全部挂牌合约求和，已用 2026-09-01 官方数据精确核对：
// 中信净空变化 +67、前20合计净多变化 +5516，与主流期指持仓 App 一致）：
//   中信席位净空变化 = Σ(空单增减) − Σ(多单增减)
//   前20机构净多变化 = Σ(前20名多单增减) − Σ(前20名空单增减)
//
// 对冲解读（散户口径，数据本身无法证明）：中信席位常被视作机构现货对冲盘，
// 净空增加 ≈ 现货加仓倾向（偏多），净空减少 ≈ 现货减仓倾向（偏空）。
// =====================================================================
import { requestGateway } from "@/api/transport";

export interface CffexPositions {
  date: string; // 交易日 YYYYMMDD
  citNetShortChg: number; // 中信期货席位净空变化（手，正 = 净空增加）
  top20NetLongChg: number; // 前20名会员合计净多变化（手，正 = 净多增加）
}

const PRODUCTS = ["IF", "IH", "IC", "IM"] as const;
type Agg = { citBuy: number; citSell: number; top20Buy: number; top20Sell: number };

const pad2 = (n: number) => String(n).padStart(2, "0");

// 候选交易日：本机日期（用户群为中国，与全局时区口径一致）往前回溯，跳过周末，
// 最多取 4 个候选自然日（节假日 404 自动落到上一交易日）。
function candidateDates(): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = 0; i < 10 && out.length < 4; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const wd = d.getDay();
    if (wd === 0 || wd === 6) continue;
    out.push(`${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`);
  }
  return out;
}

// 解析单品种 CSV。行结构：
//   交易日,合约,排名,量名,量,量增减,多头名,多头量,多头增减,空头名,空头量,空头增减
// 对该品种 CSV 内全部挂牌合约行求和；无数据行（未发布/日期非法）返回 null。
function parseRankCsv(text: string, date: string, product: string): Agg | null {
  const agg: Agg = { citBuy: 0, citSell: 0, top20Buy: 0, top20Sell: 0 };
  let hit = 0;
  for (const line of text.split(/\r?\n/)) {
    const c = line.split(",");
    if (c.length < 12 || c[0] !== date || !c[1].startsWith(product)) continue;
    hit++;
    const buyChg = parseInt(c[8], 10) || 0;
    const sellChg = parseInt(c[11], 10) || 0;
    agg.top20Buy += buyChg;
    agg.top20Sell += sellChg;
    // 用 includes 匹配会员简称（带「(代客)」后缀）；「中信期货」不会误匹配「中信建投」
    if (c[6].includes("中信期货")) agg.citBuy += buyChg;
    if (c[9].includes("中信期货")) agg.citSell += sellChg;
  }
  return hit ? agg : null;
}

// 拉取最近已发布交易日的四品种持仓并汇总。
// 当日未发布（404）自动回溯上一交易日；同一交易日重试一次以抵御网关瞬时抖动。
// 全部失败返回 null，由上层降级为「暂无数据」。
export async function fetchCffexPositions(): Promise<CffexPositions | null> {
  for (const date of candidateDates()) {
    for (let round = 0; round < 2; round++) {
      const res = await Promise.all(
        PRODUCTS.map(async (product): Promise<Agg | null> => {
          try {
            const r = await requestGateway("cffex", { date, product });
            return parseRankCsv(r.text, date, product);
          } catch {
            return null;
          }
        })
      );
      if (res.every((x): x is Agg => x !== null)) {
        const sum = res.reduce(
          (a, x) => ({
            citBuy: a.citBuy + x.citBuy,
            citSell: a.citSell + x.citSell,
            top20Buy: a.top20Buy + x.top20Buy,
            top20Sell: a.top20Sell + x.top20Sell,
          }),
          { citBuy: 0, citSell: 0, top20Buy: 0, top20Sell: 0 }
        );
        return {
          date,
          citNetShortChg: sum.citSell - sum.citBuy,
          top20NetLongChg: sum.top20Buy - sum.top20Sell,
        };
      }
    }
  }
  return null;
}
