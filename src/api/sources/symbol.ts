// 将东方财富 secid（如 "1.600519" / "0.000001" / "116.00700"）转换为
// 腾讯证券 / 新浪财经 使用的带市场前缀符号："sh600519" / "sz000001" / "hk00700" / "bj8xxxxx"。
// 腾讯、新浪的接口均以该形式标识标的。
import { marketFromSecid, codeFromSecid } from "@/utils/period";

export function toMarketSymbol(secid: string): string {
  const code = codeFromSecid(secid);
  const m = marketFromSecid(secid); // sh | sz | hk | bj
  if (m === "hk") return "hk" + code;
  if (m === "sh") return "sh" + code;
  if (m === "bj") return "bj" + code;
  return "sz" + code; // 深市 / 创业板 / 默认
}
