import { ref } from "vue";

/**
 * 全局底部卡片栈：统一管理 PeekSheet（半屏窗体）与 BottomSheet（底部弹层）。
 *
 * 两条规则：
 * 1. 互斥：新卡片打开（pushSheet）时自动收起栈内其它卡片，杜绝多卡同屏；
 * 2. 置顶：层级增量（sheetLift）按栈内次序递增，即使旧卡片离场动画尚未播完，
 *    最新打开的卡片也一定压在旧卡片之上。
 *
 * 各卡片在自身基础 z-index（PeekSheet 40 / 消息类 940 / BottomSheet 950）上叠加增量，
 * 互斥下栈深通常为 1（增量 1），旧卡离场后深度回落到 1，增量永不累积、层级区间永不串档。
 */
interface SheetEntry {
  id: number;
  /** 互斥收起回调：由卡片提供（PeekSheet → collapse，BottomSheet → emit update:false） */
  close: () => void;
}

const stack = ref<SheetEntry[]>([]);
let seq = 0;

/** 注册为「最新打开」的卡片：先互斥收起其它卡片，再入栈。返回卡片 id。 */
export function pushSheet(close: () => void): number {
  for (const e of stack.value) e.close();
  const id = ++seq;
  stack.value = [...stack.value, { id, close }];
  return id;
}

/** 卡片已关闭 / 卸载：移出栈。 */
export function popSheet(id: number) {
  if (!id) return;
  stack.value = stack.value.filter((e) => e.id !== id);
}

/** 层级增量（1 起步，栈内越深越新）；id 已出栈时返回 0。 */
export function sheetLift(id: number): number {
  const i = stack.value.findIndex((e) => e.id === id);
  return i < 0 ? 0 : i + 1;
}
