-- =====================================================================
-- 观澜 guanlan-stock · 帖子可见范围（增量迁移，非破坏性）
-- ---------------------------------------------------------------------
-- 新增 community_posts.visibility：
--   public    公开（默认，所有人含匿名可见）
--   followers 仅粉丝（follows 中存在 当前用户→作者 的关注关系才可见）
--   private   仅自己（仅作者本人可见）
--
-- 裁决口径（RLS 与 SECURITY DEFINER 函数必须同口径）：
--   可见 = visibility='public' or 作者本人
--          or (visibility='followers' and 调用者关注了作者)
--
-- 覆盖点：
--   1. 列 + CHECK（存量帖默认 public，不丢数据）
--   2. community_posts / community_replies / community_likes 的 RLS 策略
--      （回复、点赞的可见性随帖；直接表插入也无法对无权帖互动）
--   3. toggle_post_like（SECURITY DEFINER 绕过 RLS，函数内自行裁决）
--   4. search_posts（SECURITY DEFINER，函数内自行过滤；返回行增列 visibility，
--      RETURNS TABLE 类型变更必须先 drop 再建）
--
-- 适用：Supabase 控制台 → SQL Editor 粘贴执行，可重复执行（幂等）。
-- 前端配套：src/api/community.ts（visibility 读写）、PostComposer.vue（权限选择）、
--          PostCard.vue（权限角标）、store/community.ts（发布透传）。
-- =====================================================================

-- 0) 前置：关注关系表必须存在（通常 follows.sql 已建；此处兜底保证策略可创建）
create table if not exists public.follows (
  follower_id  uuid not null references auth.users (id) on delete cascade,
  following_id uuid not null references auth.users (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (follower_id, following_id)
);
create index if not exists idx_follows_follower on public.follows (follower_id);
create index if not exists idx_follows_following on public.follows (following_id);

-- 1) 列 + CHECK（幂等；旧行回填默认值 public）
alter table public.community_posts
  add column if not exists visibility text not null default 'public';
alter table public.community_posts drop constraint if exists community_posts_visibility_check;
alter table public.community_posts add constraint community_posts_visibility_check
  check (visibility in ('public','followers','private'));

-- 2) RLS：帖子读取按可见范围裁决
drop policy if exists "community_posts_select" on public.community_posts;
create policy "community_posts_select" on public.community_posts
  for select using (
    visibility = 'public'
    or user_id = auth.uid()
    or (
      visibility = 'followers'
      and exists (
        select 1 from public.follows f
        where f.follower_id = auth.uid() and f.following_id = community_posts.user_id
      )
    )
  );

-- 回复可见性随帖（子查询对 community_posts 的读取同样经过其 select RLS；
-- SECURITY DEFINER 函数内以属主身份执行，通知等派生数据不受影响）
drop policy if exists "community_replies_select" on public.community_replies;
create policy "community_replies_select" on public.community_replies
  for select using (
    exists (select 1 from public.community_posts p where p.id = community_replies.post_id)
  );

-- 回复 / 点赞写入：仅能对自己可见的帖互动（兼容匿名阶段与阶段二 authenticated 两种策略形态，
-- 全部 drop 后按当前生产形态重建为 to authenticated；若仍处匿名阶段，去掉 to authenticated 即可）
drop policy if exists "community_replies_insert" on public.community_replies;
create policy "community_replies_insert" on public.community_replies
  for insert to authenticated with check (
    exists (select 1 from public.community_posts p where p.id = community_replies.post_id)
  );

drop policy if exists "community_likes_insert" on public.community_likes;
create policy "community_likes_insert" on public.community_likes
  for insert to authenticated with check (
    exists (select 1 from public.community_posts p where p.id = community_likes.post_id)
  );

-- 3) toggle_post_like：函数内可见性裁决（definer 绕过 RLS）
create or replace function public.toggle_post_like(p_post_id uuid)
returns table (
  id uuid, type text, author text, topic jsonb,
  content text, card jsonb, likes integer, liked_by_me boolean, created_at timestamptz
)
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid);
  v_liked boolean;
begin
  -- 防猜 uuid 对「仅自己 / 仅粉丝」帖越权点赞：作者本人 / 公开帖 / 关注了作者的粉丝才放行
  if not exists (
    select 1 from public.community_posts p
    where p.id = p_post_id
      and (
        p.user_id = auth.uid()
        or p.visibility = 'public'
        or (
          p.visibility = 'followers'
          and exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.following_id = p.user_id)
        )
      )
  ) then
    raise exception '帖子不存在或无权操作' using errcode = 'check_violation';
  end if;
  delete from public.community_likes where post_id = p_post_id and user_id = v_user;
  if not found then
    insert into public.community_likes (post_id, user_id) values (p_post_id, v_user);
    v_liked := true;
  else
    v_liked := false;
  end if;
  return query
    select p.id, p.type, p.author, p.topic, p.content, p.card, p.likes, v_liked, p.created_at
    from public.community_posts p where p.id = p_post_id;
end;
$$;

-- 4) search_posts：函数内过滤 + 返回行增列 visibility（先 drop 解决 42P13 返回类型变更）
drop function if exists public.search_posts(text);
create or replace function public.search_posts(p_query text)
returns table (
  id uuid, type text, author text, user_id uuid, topic jsonb,
  content text, card jsonb, images text[], likes integer, created_at timestamptz,
  visibility text, replies json
)
language sql security definer set search_path = public as $$
  select
    p.id, p.type, p.author, p.user_id, p.topic, p.content, p.card, p.images, p.likes, p.created_at,
    p.visibility,
    coalesce(
      (
        select json_agg(
                 json_build_object('id', r.id, 'author', r.author, 'content', r.content, 'created_at', r.created_at)
                 order by r.created_at
               )
        from public.community_replies r
        where r.post_id = p.id and r.status = 'published'
      ),
      '[]'::json
    ) as replies
  from public.community_posts p
  where (
    p.content ilike '%' || p_query || '%'
    or p.topic->>'name' ilike '%' || p_query || '%'
    or p.topic->>'code' ilike '%' || p_query || '%'
    or p.card->>'stock' ilike '%' || p_query || '%'
    or p.card->>'code' ilike '%' || p_query || '%'
  )
  and (
    p.user_id = auth.uid()
    or p.visibility = 'public'
    or (
      p.visibility = 'followers'
      and exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.following_id = p.user_id)
    )
  )
  order by p.created_at desc
  limit 50;
$$;
