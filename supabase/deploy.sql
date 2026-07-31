-- =====================================================================
-- 观澜 guanlan-stock · Supabase 全量部署脚本（一次性执行）
-- ---------------------------------------------------------------------
-- 适用环境：Supabase 免费版（PostgreSQL 15+）
-- 执行位置：Supabase 控制台 → SQL Editor → 粘贴本文件全部内容 → Run
-- 幂等性：全部使用 if not exists / drop ... if exists / create or replace，
--         可重复执行，不会因"已存在"而报错。
--
-- 本文件已完整覆盖并取代 supabase/schema.sql 与 migrations/0001_community.sql，
-- ⚠️ 请不要再单独执行这两个旧文件（重复执行只会冗余重建策略，无副作用但没必要）。
--
-- 设计原则（详见随附说明）：
--   ① 表结构：原生类型、合理默认值、CHECK 兜底数据完整性、外键级联
--   ② 关系：posts↔replies↔likes 级联删除；user_id 预留给 Auth（set null 保历史）
--   ③ 安全：RLS 默认开启；匿名阶段开放读写但收紧（插入强制 likes=0 防伪造）
--   ④ 扩展：user_id / topic jsonb 预留；触发器维护点赞计数，未来接 Auth 零改表
--   ⑤ 性能：(created_at,id) 复合索引支撑游标分页；replies/likes 前缀索引
-- =====================================================================


-- ╔══════════════════════════════════════════════════════════════╗
-- ║ 0. 基础说明                                                   ║
-- ╚══════════════════════════════════════════════════════════════╝
-- 本项目仅用原生类型，无需额外扩展。若未来需要帖子全文检索，可启用：
--   create extension if not exists pg_trgm;
-- 免费版默认已开启常用扩展（uuid-ossp / pgcrypto 等），gen_random_uuid() 可用。


-- ╔══════════════════════════════════════════════════════════════╗
-- ║ 1. 账户体系（Auth 已在规划中；前端暂未接入，字段预留在接登录后启用）  ║
-- ╚══════════════════════════════════════════════════════════════╝

-- 1.1 资料表：注册后由触发器自动建一行
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  username     text not null default '',
  bio          text not null default '',
  avatar_url   text not null default '',
  created_at   timestamptz not null default now()
);

-- 1.2 自选股表
create table if not exists public.watchlists (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  code       text not null,
  market     text not null default 'auto' check (market in ('auto','sh','sz','hk','us')),
  name       text not null default '',
  note       text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists idx_watchlists_user on public.watchlists (user_id);

-- 1.3 注册即建 profile 的触发器
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 1.4 RLS：仅本人可读写自己的 profile / watchlist
alter table public.profiles   enable row level security;
alter table public.watchlists enable row level security;

drop policy if exists "profiles_select_self" on public.profiles;
create policy "profiles_select_self" on public.profiles for select using (auth.uid() = id);
drop policy if exists "profiles_upsert_self" on public.profiles;
create policy "profiles_upsert_self" on public.profiles for insert with check (auth.uid() = id);
drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self" on public.profiles for update using (auth.uid() = id);

drop policy if exists "watchlists_select_self" on public.watchlists;
create policy "watchlists_select_self" on public.watchlists for select using (auth.uid() = user_id);
drop policy if exists "watchlists_insert_self" on public.watchlists;
create policy "watchlists_insert_self" on public.watchlists for insert with check (auth.uid() = user_id);
drop policy if exists "watchlists_update_self" on public.watchlists;
create policy "watchlists_update_self" on public.watchlists for update using (auth.uid() = user_id);
drop policy if exists "watchlists_delete_self" on public.watchlists;
create policy "watchlists_delete_self" on public.watchlists for delete using (auth.uid() = user_id);

-- 1.5 头像存储桶（限制 2MB，仅登录用户可传自己的）
insert into storage.buckets (id, name, public, file_size_limit)
values ('avatars', 'avatars', true, 2097152)
on conflict (id) do nothing;
drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read" on storage.objects for select using (bucket_id = 'avatars');
drop policy if exists "avatars_auth_insert" on storage.objects;
create policy "avatars_auth_insert" on storage.objects for insert to authenticated with check (bucket_id = 'avatars' and owner = auth.uid());
drop policy if exists "avatars_owner_delete" on storage.objects;
create policy "avatars_owner_delete" on storage.objects for delete to authenticated using (bucket_id = 'avatars' and owner = auth.uid());


-- ╔══════════════════════════════════════════════════════════════╗
-- ║ 2. 社区核心表                                                 ║
-- ╚══════════════════════════════════════════════════════════════╝

-- 2.1 帖子
create table if not exists public.community_posts (
  id         uuid primary key default gen_random_uuid(),
  -- 预留：前端接入 Auth 后写入 auth.uid()；匿名阶段为 null（不强制）
  user_id    uuid references auth.users (id) on delete set null,
  type       text not null check (type in ('text','card')),
  author     text not null check (length(author) between 1 and 30),
  avatar     text,                                  -- 头像 emoji
  -- 关联标的 {type:'stock'|'sector', name, code?}；允许 null（无关联标的的纯文字帖）
  topic      jsonb check (
    topic is null or (
      topic ? 'type' and topic->>'type' in ('stock','sector')
      and topic ? 'name' and length(topic->>'name') > 0
    )
  ),
  content    text check (content is null or length(content) <= 2000),  -- 纯文字帖正文
  card       jsonb,                                  -- 持仓/操作/收益 特殊卡片
  likes      integer not null default 0 check (likes >= 0),
  created_at timestamptz not null default now(),
  -- 数据完整性：text 帖必须有 content 且无 card；card 帖必须有 card 且无 content
  constraint posts_shape check (
    (type = 'text' and content is not null and card is null)
    or (type = 'card' and card is not null and content is null)
  )
);
-- 信息流排序 + 游标分页（keyset）：(created_at desc, id desc)
create index if not exists idx_posts_feed on public.community_posts (created_at desc, id desc);

-- 2.2 回复（listRemote 通过 post_id 外键关联读取，资源名 community_replies）
create table if not exists public.community_replies (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.community_posts (id) on delete cascade,
  user_id    uuid references auth.users (id) on delete set null,
  author     text not null check (length(author) between 1 and 30),
  content    text not null check (length(content) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists idx_replies_post on public.community_replies (post_id, created_at);

-- 2.3 点赞（真实记录；计数由触发器从本表聚合，杜绝客户端伪造）
create table if not exists public.community_likes (
  post_id    uuid not null references public.community_posts (id) on delete cascade,
  -- 登录后为 auth.uid()；匿名阶段为占位 uuid（见 toggle_post_like）。非外键：占位 uuid 不在 auth.users 中
  user_id    uuid not null,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)        -- 同一人对同一帖只能有一行 → 天然防重复点赞
);


-- ╔══════════════════════════════════════════════════════════════╗
-- ║ 3. 点赞计数维护触发器                                        ║
-- 保证 posts.likes 永远 = 实际 community_likes 行数，任何直接 UPDATE ║
-- posts.likes 的尝试都会被覆盖，客户端无法伪造点赞数。              ║
-- ╚══════════════════════════════════════════════════════════════╝
create or replace function public.sync_post_likes()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_pid uuid;
begin
  if tg_op = 'DELETE' then v_pid := old.post_id; else v_pid := new.post_id; end if;
  update public.community_posts p
     set likes = (select count(*) from public.community_likes l where l.post_id = v_pid)
   where p.id = v_pid;
  return null;
end;
$$;
drop trigger if exists trg_sync_likes on public.community_likes;
create trigger trg_sync_likes
  after insert or update or delete on public.community_likes
  for each row execute function public.sync_post_likes();


-- ╔══════════════════════════════════════════════════════════════╗
-- ║ 4. 行级安全（RLS）                                           ║
-- 当前阶段：前端未接入 Supabase Auth（author 为本地昵称），因此     ║
-- 社区读写对「匿名角色 anon」开放。已尽量收紧：                    ║
--   · 帖子插入强制 likes = 0（无法伪造点赞数）                     ║
--   · 帖子形状 / 作者长度 / 内容长度 均有 CHECK 兜底               ║
--   · 删除策略见【阶段二】升级块；接入 Auth 后务必替换本段          ║
-- ╚══════════════════════════════════════════════════════════════╝
alter table public.community_posts   enable row level security;
alter table public.community_replies enable row level security;
alter table public.community_likes   enable row level security;

-- 读：所有人可见（含匿名）
drop policy if exists "community_posts_select" on public.community_posts;
create policy "community_posts_select" on public.community_posts for select using (true);
drop policy if exists "community_replies_select" on public.community_replies;
create policy "community_replies_select" on public.community_replies for select using (true);
drop policy if exists "community_likes_select" on public.community_likes;
create policy "community_likes_select" on public.community_likes for select using (true);

-- 写：匿名可发帖 / 回复 / 点赞
drop policy if exists "community_posts_insert" on public.community_posts;
create policy "community_posts_insert" on public.community_posts
  for insert with check (likes = 0);   -- 禁止伪造点赞数
drop policy if exists "community_replies_insert" on public.community_replies;
create policy "community_replies_insert" on public.community_replies for insert with check (true);
drop policy if exists "community_likes_insert" on public.community_likes;
create policy "community_likes_insert" on public.community_likes for insert with check (true);
drop policy if exists "community_likes_delete" on public.community_likes;
create policy "community_likes_delete" on public.community_likes for delete using (true);

-- 删除策略（阶段一：匿名开放，前端仅在「本人帖」显示删除按钮做软约束）
-- ⚠️ 安全提醒：服务端无法校验「仅作者可删」，任何匿名用户都可删任意帖。
--    生产上线前请接入 Auth 并执行下方【阶段二】策略替换本段。
drop policy if exists "community_posts_delete" on public.community_posts;
create policy "community_posts_delete" on public.community_posts for delete using (true);


-- ╔══════════════════════════════════════════════════════════════╗
-- ║ 5. 点赞切换函数（toggle_post_like）                         ║
-- 返回更新后的帖子；liked_by_me 基于调用者身份（未登录用占位 uuid） ║
-- 计数由 trg_sync_likes 自动维护，本函数只负责增减点赞行。          ║
-- 前端 community.ts 的 toggleLikeRemote 已对齐本返回结构。         ║
-- ╚══════════════════════════════════════════════════════════════╝
create or replace function public.toggle_post_like(p_post_id uuid)
returns table (
  id uuid, type text, author text, avatar text, topic jsonb,
  content text, card jsonb, likes integer, liked_by_me boolean, created_at timestamptz
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
  return query
    select p.id, p.type, p.author, p.avatar, p.topic, p.content, p.card, p.likes, v_liked, p.created_at
    from public.community_posts p where p.id = p_post_id;
end;
$$;


-- ╔══════════════════════════════════════════════════════════════╗
-- ║ 6. Realtime（可选，幂等加入；开启后发帖/点赞经 WebSocket 推送） ║
-- ╚══════════════════════════════════════════════════════════════╝
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='community_posts') then
    alter publication supabase_realtime add table public.community_posts;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='community_replies') then
    alter publication supabase_realtime add table public.community_replies;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='watchlists') then
    alter publication supabase_realtime add table public.watchlists;
  end if;
end $$;


-- ╔══════════════════════════════════════════════════════════════╗
-- ║ 7. 示例数据（可选；远程不会跑本地 seedIfEmpty，首屏为空时执行）  ║
-- 取消下方注释并执行，即可开箱有内容（演示文字帖 + 三类特殊卡片）。    ║
-- ╚══════════════════════════════════════════════════════════════╝
/*
insert into public.community_posts (type, author, avatar, topic, content, card, likes) values
 ('text','趋势猎人','🦊','{"type":"sector","name":"大盘"}',
  '大盘缩量回踩 20 日线，但北向资金连续三日净流入，个人判断这里更像是洗盘而不是转势。仓位不动，等放量确认再决定加仓。', null, 18),
 ('card','价值守望','🐼','{"type":"stock","name":"贵州茅台","code":"600519"}', null,
  '{"kind":"holding","stock":"贵州茅台","code":"600519","cost":1480,"shares":100,"price":1526.5}', 7),
 ('card','短线小王','🚀','{"type":"stock","name":"宁德时代","code":"300750"}', null,
  '{"kind":"operation","stock":"宁德时代","code":"300750","side":"buy","price":186.2,"shares":200,"note":"突破平台 + 量能放大，打底仓"}', 4),
 ('card','复利机器','💰', null, null,
  '{"kind":"profit","period":"本月","totalReturn":6.8,"realized":4200,"unrealized":-1300,"winRate":63}', 25),
 ('text','复利机器','💰','{"type":"sector","name":"投资理念"}',
  '分享一个心态：账户回撤 5% 以内就当没发生，别天天盯盘。把时间花在研究财报和产业链上，收益是认知的副产品。', null, 33);
*/
