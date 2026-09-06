import { ref, nextTick, type Ref } from "vue";

// 常用表情精选（表情 / 手势 / 炒股常用符号），8 列网格滚动展示。
// 集中维护，发帖 / 回复 / 私信三处表情面板共用同一份数据，避免散落重复。
export const EMOJIS: string[] = [
  "😀","😄","😆","😂","🤣","😊","😇","🙂",
  "😉","😍","🥰","😋","😜","🤪","😎","🥳",
  "😏","🥺","😢","😭","😤","😠","😡","🤯",
  "😳","😔","😞","🥱","😴","🤤","🤔","🫡",
  "🤗","🫢","🤫","🤐","😐","😶","😷","🤒",
  "🤕","🥴","😵","🥵","🥶","😱","👀","🙏",
  "👍","👎","👌","✌️","🤞","🤘","🤙","👏",
  "🙌","🫶","🤝","💪","🫰","✍️","🤳","🤲",
  "❤️","💔","💕","💖","💯","🔥","✨","⭐",
  "🎉","🎊","🎁","🧧","📈","📉","💰","🤑",
];

export interface UseEmojiOptions {
  maxLength?: number;
  /** 插入 / 退格后回调（如发帖需同步 # 联想解析），参数为最新文本 */
  onAfterInsert?: (text: string) => void;
}

/**
 * 表情面板通用逻辑：在给定输入框（input/textarea 原生元素）的光标处插入表情，
 * 退格按 Unicode 码点（而非 UTF-16 单元）删除，避免 emoji 被截半。
 *
 * resolveEl 由各调用方按自身结构提供：uni-h5 下 <input>/<textarea> 的 ref 可能是
 * 组件实例，需解析出原生元素才能读 / 写光标（selectionStart / setSelectionRange）。
 */
export function useEmoji(
  resolveEl: () => HTMLInputElement | HTMLTextAreaElement | null,
  text: Ref<string>,
  opts: UseEmojiOptions = {}
) {
  const emojiOpen = ref(false);

  function toggleEmoji() {
    emojiOpen.value = !emojiOpen.value;
  }

  /** 点选表情：插入到当前光标处并让光标落在表情之后 */
  function insertEmoji(em: string) {
    const el = resolveEl();
    const pos = el ? (el.selectionStart ?? text.value.length) : text.value.length;
    const next = text.value.slice(0, pos) + em + text.value.slice(pos);
    if (opts.maxLength && next.length > opts.maxLength) {
      uni.showToast({ title: `最多 ${opts.maxLength} 字`, icon: "none" });
      return;
    }
    text.value = next;
    opts.onAfterInsert?.(next);
    nextTick(() => {
      const t = resolveEl();
      if (t) {
        t.focus();
        const p = pos + em.length;
        t.setSelectionRange(p, p);
      }
    });
  }

  /** 表情面板退格：按 Unicode 码点（而非 UTF-16 单元）删除光标前一个字符 */
  function backspaceEmoji() {
    if (!text.value.length) return;
    const el = resolveEl();
    const pos = el ? (el.selectionStart ?? text.value.length) : text.value.length;
    if (pos === 0) return;
    const before = Array.from(text.value.slice(0, pos));
    before.pop();
    const head = before.join("");
    const next = head + text.value.slice(pos);
    text.value = next;
    opts.onAfterInsert?.(next);
    nextTick(() => {
      const t = resolveEl();
      if (t) {
        t.focus();
        t.setSelectionRange(head.length, head.length);
      }
    });
  }

  return { emojiOpen, toggleEmoji, insertEmoji, backspaceEmoji };
}
