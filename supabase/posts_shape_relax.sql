-- =====================================================================
-- posts_shape 约束放宽（2026-08-29）
-- ---------------------------------------------------------------------
-- 背景：前端已支持「正文 + 附加持仓卡片」共存（PostCard 按 content / card
-- 是否存在独立渲染，发布链路按 type='card' + content + card 组合提交）。
-- 旧约束要求 card 帖 content IS NULL，组合提交必然违反 → HTTP 400 (23514)。
-- 本脚本将约束放宽为：text 帖必须有正文且无卡片；card 帖必须有卡片（正文可选）。
-- 在 Supabase SQL Editor 对线上库执行一次即可（幂等，可重复执行）。
-- =====================================================================

alter table public.community_posts drop constraint if exists posts_shape;

alter table public.community_posts add constraint posts_shape check (
  (type = 'text' and content is not null and card is null)
  or (type = 'card' and card is not null)
);
