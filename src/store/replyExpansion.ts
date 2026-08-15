import { ref } from "vue";

/**
 * 帖子评论区互斥展开：全局仅允许一个帖子处于「展开评论/回复」态。
 * 模块级单例 ref 记录当前展开评论的帖子 id；各 PostCard 通过比较自身 id
 * 决定 showReply。展开某帖时设置 activeReplyId 即可自动收起其它帖（互斥）。
 */
const activeReplyId = ref<string | null>(null);

export function useReplyExpansion() {
  /** 指定帖子是否处于展开评论态 */
  function isReplyOpen(id: string): boolean {
    return activeReplyId.value === id;
  }
  /** 展开指定帖子的评论区（互斥：自动收起其它） */
  function openReply(id: string): void {
    activeReplyId.value = id;
  }
  /** 收起当前展开的评论区 */
  function closeReply(): void {
    activeReplyId.value = null;
  }
  /** 切换指定帖子的评论区展开态（已展开则收起，否则展开并互斥其它） */
  function toggleReply(id: string): void {
    activeReplyId.value = activeReplyId.value === id ? null : id;
  }
  return { activeReplyId, isReplyOpen, openReply, closeReply, toggleReply };
}
