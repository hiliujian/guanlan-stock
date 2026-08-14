-- =====================================================================
-- 观澜 guanlan-stock · 放宽 profiles 读策略为公开可读（增量迁移，非破坏性）
-- ---------------------------------------------------------------------
-- 背景：deploy.sql 的 profiles_select_self 策略为「仅本人可读」
--       （using (auth.uid() = id)），但信息流设计上需要联表取所有作者的公开资料
--       （username / display_name / avatar_url / avatar_frame）来渲染头像与边框；
--       仅本人可读与这一设计意图冲突，是「他人帖子头像 / 边框缺失」的根因。
--
-- 调整：将 profiles 的 SELECT 策略改为公开可读（using (true)）。
--       profiles 仅含公开社交字段（不含 email 等敏感信息），与 page_access /
--       community_posts / announcements 等公开表策略一致，符合社区产品预期。
--       写入仍仅限本人（profiles_upsert_self / profiles_update_self 保持不变）。
--
-- 适用：Supabase 控制台 → SQL Editor 粘贴执行，或 Management API database/query。
-- 非破坏性：drop policy if exists + create，幂等可重复运行。
-- =====================================================================

drop policy if exists "profiles_select_self" on public.profiles;
create policy "profiles_select_self" on public.profiles for select using (true);
