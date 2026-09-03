-- =====================================================================
-- 关注关系 + 粉丝数统计（增量迁移，非破坏性）
-- 配套前端：src/store/follow.ts（服务端 uid 维度，替代原 localStorage 昵称集合）
--          src/api/user.ts（lookupUserByUsername）
--          src/components/UserCard.vue（社区搜索用户名片）
-- =====================================================================

-- 1) 关注关系表：follower 关注 following，联合主键保证「一对关注」唯一
create table if not exists public.follows (
  follower_id  uuid not null references auth.users (id) on delete cascade,
  following_id uuid not null references auth.users (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (follower_id, following_id)
);
create index if not exists idx_follows_follower on public.follows (follower_id);
create index if not exists idx_follows_following on public.follows (following_id);

alter table public.follows enable row level security;

-- 读取：公开可读（用于计算粉丝数 / 关注数）；写入 / 删除：仅本人作为 follower
drop policy if exists "follows_select" on public.follows;
create policy "follows_select" on public.follows for select using (true);

drop policy if exists "follows_insert" on public.follows;
create policy "follows_insert" on public.follows
  for insert with check (auth.uid() = follower_id);

drop policy if exists "follows_delete" on public.follows;
create policy "follows_delete" on public.follows
  for delete using (auth.uid() = follower_id);

-- 2) 粉丝数统计（security definer，避免 RLS 干扰计数）
create or replace function public.count_followers(p_user_id uuid)
returns integer
language sql
security definer
set search_path = public
as $$
  select count(*)::integer from public.follows where following_id = p_user_id;
$$;
grant execute on function public.count_followers(uuid) to anon, authenticated;

-- 3) 关注数统计
create or replace function public.count_following(p_user_id uuid)
returns integer
language sql
security definer
set search_path = public
as $$
  select count(*)::integer from public.follows where follower_id = p_user_id;
$$;
grant execute on function public.count_following(uuid) to anon, authenticated;
