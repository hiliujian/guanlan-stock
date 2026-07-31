-- =====================================================================
-- 社区模块 · Supabase 增量迁移
-- 配合已有的 supabase/schema.sql（profiles / watchlists / auth）使用。
-- 执行方式二选一：
--   A. Supabase 控制台 -> SQL Editor 直接粘贴执行；
--   B. 放在 supabase/migrations/ 下，由 Supabase CLI 版本化管理。
-- 字段严格对齐前端 src/api/community.ts 的远程 stub（listRemote / createRemote ...），
-- 切换远程（填 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY）后 UI 一行不改。
-- =====================================================================

-- 1) 帖子表
create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('text','card')),
  author text not null,            -- 当前为前端昵称（localStorage），未绑定 auth user
  avatar text,                     -- 头像 emoji
  topic jsonb,                     -- 关联标的 {type:'stock'|'sector', name, code?}
  content text,                    -- 纯文字帖内容
  card jsonb,                      -- 持仓 / 操作 / 收益 特殊卡片
  likes integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_community_posts_created_at
  on public.community_posts (created_at desc);

-- 2) 回复表（listRemote 通过 post_id 外键关联读取）
create table if not exists public.community_replies (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts (id) on delete cascade,
  author text not null,
  content text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_community_replies_post_id
  on public.community_replies (post_id);

-- 3) 点赞表（真实追踪；前端用本地集合缓存 likedByMe 视觉态）
create table if not exists public.community_likes (
  post_id uuid not null references public.community_posts (id) on delete cascade,
  user_id uuid not null,
  primary key (post_id, user_id)
);

-- 4) 行级安全（RLS）
alter table public.community_posts   enable row level security;
alter table public.community_replies enable row level security;
alter table public.community_likes   enable row level security;

-- 读：所有人可见
drop policy if exists "community_posts_select" on public.community_posts;
create policy "community_posts_select" on public.community_posts
  for select using (true);
drop policy if exists "community_replies_select" on public.community_replies;
create policy "community_replies_select" on public.community_replies
  for select using (true);
drop policy if exists "community_likes_select" on public.community_likes;
create policy "community_likes_select" on public.community_likes
  for select using (true);

-- 写：原型阶段匿名可发帖 / 回复 / 点赞（author 为昵称，未绑定 auth user）
-- 注意：删除策略当前对匿名开放，服务端无法校验"仅作者可删"。
-- 待前端接入 Supabase Auth（项目 schema.sql 已含 profiles / 触发器）后，
-- 建议给 community_posts 增加 user_id 列（references auth.users），
-- 并将下方删除策略改为 using (auth.uid() = user_id)。
drop policy if exists "community_posts_insert" on public.community_posts;
create policy "community_posts_insert" on public.community_posts
  for insert with check (true);
drop policy if exists "community_replies_insert" on public.community_replies;
create policy "community_replies_insert" on public.community_replies
  for insert with check (true);
drop policy if exists "community_likes_insert" on public.community_likes;
create policy "community_likes_insert" on public.community_likes
  for insert with check (true);
drop policy if exists "community_likes_delete" on public.community_likes;
create policy "community_likes_delete" on public.community_likes
  for delete using (true);
drop policy if exists "community_posts_delete" on public.community_posts;
create policy "community_posts_delete" on public.community_posts
  for delete using (true);

-- 5) 点赞切换函数（toggle_post_like）
-- 返回更新后的帖子行；liked_by_me 基于调用者身份（未登录时用固定占位 uuid）。
create or replace function public.toggle_post_like(p_post_id uuid)
returns table (
  id uuid, type text, author text, content text, card jsonb,
  likes integer, liked_by_me boolean, created_at timestamptz
)
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid);
  v_liked boolean;
begin
  delete from public.community_likes where post_id = p_post_id and user_id = v_user;
  if not found then
    insert into public.community_likes (post_id, user_id) values (p_post_id, v_user);
    v_liked := true;
  else
    v_liked := false;
  end if;
  update public.community_posts
     set likes = (select count(*) from public.community_likes where post_id = p_post_id)
   where id = p_post_id;
  return query
    select p.id, p.type, p.author, p.content, p.card, p.likes, v_liked, p.created_at
    from public.community_posts p where p.id = p_post_id;
end;
$$;

-- 6) 实时同步（可选）：取消注释即可让发帖 / 点赞经 Realtime 推送。
--    注意：重复 add table 会报错（PostgreSQL 限制），仅首次执行即可。
-- alter publication supabase_realtime add table public.community_posts;
-- alter publication supabase_realtime add table public.community_replies;
