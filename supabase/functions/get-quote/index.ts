// =====================================================================
// Supabase Edge Function：行情代理（可选）
// 用途：微信小程序端 wx.request 有域名白名单限制，且服务端可规避跨域。
// 配置 src/config/app.ts 的 USE_EDGE_FUNCTIONS=true 后，H5 与小程序统一
// 经由本函数请求东方财富，业务层无感知。
// 部署：supabase functions deploy get-quote
// =====================================================================
import "https://deno.land/std@0.196.0/dotenv/mod.ts";

const EM_KLINE =
  "https://push2his.eastmoney.com/api/qt/stock/kline/get";
const EM_FLOW =
  "https://push2his.eastmoney.com/api/qt/stock/fflow/kline/get";

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function parseKline(s: string) {
  const a = s.split(",");
  return {
    date: a[0],
    open: +a[1],
    close: +a[2],
    high: +a[3],
    low: +a[4],
    vol: +a[5],
    amount: +a[6],
    amp: +a[7],
    pct: +a[8],
    chg: +a[9],
    turnover: +a[10],
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors() });
  try {
    const { secid, klt, beg } = await req.json();
    const kUrl =
      `${EM_KLINE}?fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61` +
      `&ut=fa5fd1943c7b386f172d6893dbfba10b&klt=${klt}&fqt=1&secid=${secid}` +
      `&beg=${beg}&end=20500101`;
    const kRes = await fetch(kUrl);
    const kJson = await kRes.json();
    const kd: any = kJson?.data;
    const klines = kd?.klines ? kd.klines.map(parseKline) : [];

    // 资金流（主力净流入）
    const fUrl =
      `${EM_FLOW}?lmt=120&klt=101&secid=${secid}` +
      `&fields1=f1,f2,f3,f4&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61`;
    const fRes = await fetch(fUrl);
    const fJson = await fRes.json();
    const fd: any = fJson?.data;
    const flowMap: Record<string, number> = {};
    if (fd?.klines) {
      fd.klines.forEach((s: string) => {
        const a = s.split(",");
        flowMap[a[0]] = parseFloat(a[1]) || 0;
      });
    }

    return new Response(
      JSON.stringify({
        klines,
        name: kd?.name || "",
        code: kd?.code || secid,
        flowMap,
        preClose: klines.length ? klines[klines.length - 1].close : 0,
      }),
      { headers: { ...cors(), "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...cors(), "Content-Type": "application/json" },
    });
  }
});
