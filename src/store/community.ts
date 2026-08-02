// =====================================================================
// 社区 feed 响应式状态（模块级单例，跨 tab 切换保持，配合 keep-alive）
// UI 组件通过 useCommunity() 拿到 posts / loading 与一组 actions，
// 所有数据读写都经 communityRepo（模拟 Supabase 的 Service 层）。
// =====================================================================
import { ref } from "vue";
import { communityRepo, type CommunityPost, type PostCard, type Topic } from "@/api/community";

const posts = ref<CommunityPost[]>([]);
const loading = ref(false);

function replace(p: CommunityPost) {
  const i = posts.value.findIndex((x) => x.id === p.id);
  if (i >= 0) posts.value[i] = p;
}

export function useCommunity() {
  async function load() {
    loading.value = true;
    try {
      posts.value = await communityRepo.list();
    } finally {
      loading.value = false;
    }
  }

  async function publishText(content: string, topic?: Topic, images?: string[]): Promise<CommunityPost | null> {
    const trimmed = content.trim();
    if (!trimmed) return null;
    const p = await communityRepo.create({ type: "text", content: trimmed, topic, images });
    posts.value = [p, ...posts.value];
    return p;
  }

  async function publishCard(card: PostCard, images?: string[]): Promise<CommunityPost | null> {
    const p = await communityRepo.create({ type: "card", card, images });
    posts.value = [p, ...posts.value];
    return p;
  }

  async function like(id: string) {
    const p = await communityRepo.toggleLike(id);
    if (p) replace(p);
  }

  async function reply(id: string, content: string) {
    const trimmed = content.trim();
    if (!trimmed) return;
    const p = await communityRepo.addReply(id, trimmed);
    if (p) replace(p);
  }

  async function remove(id: string) {
    await communityRepo.remove(id);
    posts.value = posts.value.filter((x) => x.id !== id);
  }

  return { posts, loading, load, publishText, publishCard, like, reply, remove };
}
