// =====================================================================
// 跨实例「陈旧数据保留」缓存（stale-while-revalidate 的展示层）：
//   数据首次加载成功后 staleSet；实例重建 / 切换页面回来时先 staleGet 旧数据上屏
//   （不显示 "--" / 「暂无数据」空态），新数据成功返回后再覆盖。
// 仅内存级：整页刷新后清空（此时由各请求自身的 TTL 缓存 / 本地持久化兜底）。
// 适用：全球指数面板、大盘指数卡、期指持仓、自选行情快照、关联资讯等「刷新型」数据。
// =====================================================================

const mem = new Map<string, unknown>();

export function staleGet<T>(key: string): T | null {
  return (mem.get(key) as T) ?? null;
}

export function staleSet(key: string, v: unknown): void {
  mem.set(key, v);
}
