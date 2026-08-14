-- =====================================================================
-- 观澜 guanlan-stock · 社区帖冗余作者展示字段（增量迁移，非破坏性）
-- ---------------------------------------------------------------------
-- 背景：信息流通过 loadProfilesForPosts 联表 profiles 取作者头像 / 头像框，
-- 但 profiles RLS 仅本人可读（deploy.sql 的 profiles_select_self: auth.uid()=id），
-- 导致「其他用户」的帖子在信息流中头像 / 边框被 RLS 过滤为空（回退默认头像 + 无边框）。
-- 社交信息流本应展示作者公开资料，故在帖子行快照作者的头像URL / 头像框 / 用户名，
-- 使展示自包含、不再依赖跨表读 profiles；同时为修复 addReplyRemote 回查丢失作者
-- 资料的问题提供数据来源。
--
-- 适用：Supabase 控制台 → SQL Editor 粘贴执行，或 Management API database/query。
-- 非破坏性：仅 add column if not exists（带默认值），不影响现有数据与逻辑。
-- 前端配套：src/api/community.ts 写入 / 读取这些字段；src/components/PostCard.vue
--          用 authorUsername 作为默认头像种子，与「个人资料」页保持一致。
-- =====================================================================

alter table public.community_posts
  add column if not exists author_avatar_url text not null default '',
  add column if not exists author_frame       text not null default '',
  add column if not exists author_username     text not null default '';
