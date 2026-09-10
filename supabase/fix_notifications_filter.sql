-- 修复 get_my_notifications 过滤逻辑（2026-08-15）
-- 问题：原用 `<> auth.uid()` 排除自己；但 community_replies.user_id 在旧前端
-- 写入时为 NULL，NULL <> uid 结果为 unknown → 所有历史评论通知被整批剔除，
-- 导致消息中心评论类永远为空。改用 `is distinct from`：NULL 视为他人（纳入），
-- 同时仍正确排除自己点赞/评论自己的帖子。
--
-- 2026-08 更新：与 deploy.sql 保持同一定义，增补 actor_vip / actor_vip_expires_at
-- （VIP 金框展示）与 comment_id（评论通知点击后定位/高亮具体楼层），
-- 避免按序执行旧补丁把函数签名降级。
create or replace function public.get_my_notifications()
returns table (
  id uuid, kind text, actor_id uuid, actor_name text, actor_avatar text, actor_frame text,
  actor_vip boolean, actor_vip_expires_at timestamptz,
  post_id uuid, post_snippet text, comment_content text, comment_id uuid, created_at timestamptz
)
language sql security definer set search_path = public as $$
  with likes as (
    select l.post_id, l.user_id as actor_id, l.created_at
    from public.community_likes l
    join public.community_posts p on p.id = l.post_id
    where p.user_id = auth.uid() and l.user_id is distinct from auth.uid()
  ),
  comments as (
    select r.post_id, r.user_id as actor_id, r.content, r.id as comment_id, r.created_at
    from public.community_replies r
    join public.community_posts p on p.id = r.post_id
    where p.user_id = auth.uid() and r.user_id is distinct from auth.uid()
      and r.status = 'published'
  ),
  like_rows as (
    select md5('like-' || l.post_id || '-' || l.actor_id)::uuid as id,
           'like'::text as kind, l.actor_id, l.post_id,
           null::text as comment_content, null::uuid as comment_id, l.created_at
    from likes l
  ),
  comment_rows as (
    select md5('comment-' || c.post_id || '-' || c.actor_id || '-' || c.created_at)::uuid as id,
           'comment'::text as kind, c.actor_id, c.post_id,
           c.content as comment_content, c.comment_id, c.created_at
    from comments c
  ),
  merged as ( select * from like_rows union all select * from comment_rows )
  select m.id, m.kind, m.actor_id,
         coalesce(pr.display_name, pr.username, '用户') as actor_name,
         pr.avatar_url as actor_avatar,
         pr.avatar_frame as actor_frame,
         pr.vip as actor_vip,
         pr.vip_expires_at as actor_vip_expires_at,
         m.post_id,
         coalesce(p2.content, '分享了持仓卡片') as post_snippet,
         m.comment_content, m.comment_id, m.created_at
  from merged m
  join public.community_posts p2 on p2.id = m.post_id
  left join public.profiles pr on pr.id = m.actor_id
  order by m.created_at desc
  limit 100;
$$;
