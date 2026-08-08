// 登录地点展示归一化：把存储的登录地点整理为「中文城市名」。
//
// 服务端 Edge Function（guanlan-login-geo）现以 lang=zh-CN 请求地理定位服务，
// 返回形如「广州市, 广东省, 中国」的中文串；历史数据可能为英文（如
// 「Guangzhou, Guangdong Sheng, China」）。本函数两种都兼容：
//   · 含中文 → 取首个逗号分段（城市），去除行政区划后缀（省/市/自治区…）；
//   · 纯英文（旧数据）→ 经内置少量映射转中文，未知则原样保留该分段。
// 缺失/空 → 返回「未知」，交由上层降级展示。

const ADMIN_SUFFIX = /(省|市|自治区|特别行政区|自治州|地区|自治县|县|区)$/;

// 仅覆盖高频城市与省级/国家名，作为旧英文数据的兜底；新数据已为中文，不经此映射。
const EN_TO_CN: Record<string, string> = {
  Guangzhou: "广州",
  Beijing: "北京",
  Shanghai: "上海",
  Shenzhen: "深圳",
  Hangzhou: "杭州",
  Chengdu: "成都",
  Wuhan: "武汉",
  Nanjing: "南京",
  Suzhou: "苏州",
  Xian: "西安",
  Chongqing: "重庆",
  Tianjin: "天津",
  Guangdong: "广东",
  "Guangdong Sheng": "广东",
  "Beijing Shi": "北京",
  "Shanghai Shi": "上海",
  China: "中国",
};

const HAS_CJK = /[一-鿿]/;

export function formatLoginCity(loc?: string | null): string {
  if (!loc || !loc.trim()) return "未知";
  const segs = loc
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const city = segs[0] || "";
  if (!city) return "未知";
  if (HAS_CJK.test(city)) return city.replace(ADMIN_SUFFIX, "") || "未知";
  return EN_TO_CN[city] ?? city;
}
