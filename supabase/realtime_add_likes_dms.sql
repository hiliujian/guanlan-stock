-- 实时发布补充（2026-08-15）：把点赞与私信表纳入 supabase_realtime 发布，
-- 使前端能订阅 INSERT 事件，铃铛徽标随新点赞/评论/私信实时刷新。
-- 注意：community_posts / community_replies / watchlists 已在发布中，勿重复添加。
alter publication supabase_realtime add table public.community_likes;
alter publication supabase_realtime add table public.community_dms;
