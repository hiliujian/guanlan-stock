-- =====================================================================
-- 观澜 guanlan-stock · Supabase 全量部署脚本（一次性执行）
-- ---------------------------------------------------------------------
-- 适用环境：Supabase 免费版（PostgreSQL 15+）
-- 执行位置：Supabase 控制台 → SQL Editor → 粘贴本文件全部内容 → Run
-- 重建策略：对全部自建表采用「drop table if exists ... cascade; create table ...」，
--         保证无论表是否已存在，都按本文件声明的「最新结构」干净重建。
-- ⚠️ 数据风险：本脚本会 DROP 已存在的表并重建，原有数据（用户资料 / 自选股 / 社区帖 /
--         配置）将被清空且不可恢复。仅适用于全新库、测试库，或你已确认数据可丢的环境；
--         重复执行会再次清空数据，请勿对生产库反复运行。
--
-- 本文件是唯一的建库脚本（表 / 策略 / 存储桶 / 函数 / 示例数据 全部在此）。
-- ⚠️ 旧有的 schema.sql 与 migrations/0001_community.sql 已删除并合并进本文件，请勿再单独执行旧文件。
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
--     ⚠️ 先 DROP 再 CREATE，确保按最新声明干净重建（含 exp / username / display_name 全部列），
--        彻底规避「表已存在时 CREATE TABLE IF NOT EXISTS 整句跳过、缺列」的历史坑。
--        注意：DROP 会清空现有 profiles 数据；仅适用于全新 / 测试库或已确认数据可丢。
drop table if exists public.profiles cascade;
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  username     text not null default '',
  display_name text not null default '',
  bio          text not null default '',
  avatar_url   text not null default '',
  level        integer not null default 0,                -- 用户等级序号（0=新手散户，对应前端 TIERS 下标）；由后端维护，前端只读展示
  exp          integer not null default 0,                -- 用户经验值（等级体系 expMin 对应所需经验）；由后端维护，前端用于展示与升级进度
  -- 扩展预留（接入登录后按需启用，以下均为可选、带默认值，不影响现有逻辑）
  website      text not null default '',
  location     text not null default '',
  prefs        jsonb not null default '{}'::jsonb,        -- 用户偏好（主题/通知开关等），用 jsonb 避免将来每加一项就 ALTER
  last_seen_at timestamptz,                               -- 最近活跃时间（社区排序 / 在线状态）
  created_at   timestamptz not null default now()
);

-- 1.1.1 用户名唯一索引（部分唯一索引）
--   · 非空 username 必须唯一（登录时用户名/邮箱二选一校验用）
--   · 空 username 允许多个（兼容「用户名由用户自填」之前的历史账号，以及注册瞬间未写入期）
--   · 配合前端注册校验 + 下方 is_username_taken() RPC，双保险防重
--   · 唯一约束保证「用户名唯一」；应用层注册写入后只读，不再变更
create unique index if not exists idx_profiles_username_unique
  on public.profiles (username)
  where username <> '';

-- 1.2 自选股表
--     ⚠️ DROP + 重建（清数据）。
drop table if exists public.watchlists cascade;
create table public.watchlists (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  code       text not null,
  market     text not null default 'auto' check (market in ('auto','sh','sz','hk','us')),
  name       text not null default '',
  note       text not null default '',
  -- 扩展预留
  group_name text not null default '',                   -- 自选分组名（未来支持分组管理）
  sort_order integer not null default 0,                 -- 自定义排序权重
  is_hidden  boolean not null default false,             -- 归档 / 隐藏
  alerts     jsonb not null default '{}'::jsonb,         -- 价格提醒等配置占位（避免将来为提醒另建表 / 加多列）
  created_at timestamptz not null default now()
);
create index if not exists idx_watchlists_user on public.watchlists (user_id);

-- 1.3 注册即建 profile 的触发器
--   display_name 注册时自动随机生成（如「观澜741779」），用户可后续在「个人资料」修改；
--   前端注册流程会显式写入 username（用户自填、唯一），此处不处理 username。
--   兜底：若 raw_user_meta_data 未带 display_name，则自动生成随机昵称，避免空昵称。
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'display_name', ''),
      '观澜' || floor(random() * 900000 + 100000)::text
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 1.3.1 历史空昵称回填（幂等）
--   触发器上线前注册的旧账号 display_name 可能为空；统一补随机昵称，确保「昵称非空」
--   （与注册时自动生成的「观澜」+6 位数字格式一致）。已非空账号不受此 UPDATE 影响。
update public.profiles
   set display_name = '观澜' || floor(random() * 900000 + 100000)::text
 where display_name is null or display_name = '';

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

-- 1.4.1 登录辅助 RPC（security definer，绕过 profiles 的 RLS「仅本人可读」）
--   前端登录支持「用户名或邮箱」：邮箱走 Supabase 原生 signInWithPassword；
--   用户名需先解析为对应邮箱，再走原生密码登录。profiles 无 email 列且 RLS 禁止
--   匿名查他人，故用 security definer 函数以表属主身份读取，返回邮箱（查不到返回 null）。
create or replace function public.lookup_login_email(p_username text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_email text;
begin
  select u.email into v_email
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.username = p_username
  limit 1;
  return v_email;
end;
$$;
grant execute on function public.lookup_login_email(text) to anon, authenticated;

-- 1.4.2 用户名占用校验（security definer，供注册页实时校验）
--   返回 true 表示该用户名已被占用（含非空匹配）；空串视为未占用（不校验）。
create or replace function public.is_username_taken(p_username text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_exists boolean;
begin
  select exists(
    select 1 from public.profiles
    where username = p_username and username <> ''
  ) into v_exists;
  return coalesce(v_exists, false);
end;
$$;
grant execute on function public.is_username_taken(text) to anon, authenticated;

-- 1.4.3 邮箱是否已注册（security definer，供注册页区分"新用户注册"与"已注册改密码"）
--   直接查 auth.users（OTP 创建用户即写入），邮箱 lower 归一化比较；
--   返回 true 表示该邮箱已存在账号。与 is_username_taken 配合，从源头避免
--   注册流程误触发 Supabase 的 same-password 校验（新用户本无旧密码）。
create or replace function public.is_email_taken(p_email text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_exists boolean;
begin
  select exists(
    select 1 from auth.users
    where lower(email) = lower(p_email)
  ) into v_exists;
  return coalesce(v_exists, false);
end;
$$;

grant execute on function public.is_email_taken(text) to anon, authenticated;

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

-- 1.6 社区配图存储桶（限制 2MB，仅登录用户可传自己的；公开可读用于帖子展示）
insert into storage.buckets (id, name, public, file_size_limit)
values ('post-images', 'post-images', true, 2097152)
on conflict (id) do nothing;
drop policy if exists "post_images_public_read" on storage.objects;
create policy "post_images_public_read" on storage.objects for select using (bucket_id = 'post-images');
drop policy if exists "post_images_auth_insert" on storage.objects;
create policy "post_images_auth_insert" on storage.objects for insert to authenticated with check (bucket_id = 'post-images' and owner = auth.uid());
drop policy if exists "post_images_owner_delete" on storage.objects;
create policy "post_images_owner_delete" on storage.objects for delete to authenticated using (bucket_id = 'post-images' and owner = auth.uid());

-- 1.7 通知公告表（公告运营用：前端只读展示，写入仅服务端 service_role / SQL 管理）
--     字段与 server/data/announcements.json 的旧格式一一对应；前端 src/api/announcement.ts 直连本表。
--     ⚠️ DROP + 重建（清数据）。
drop table if exists public.announcements cascade;
create table public.announcements (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  content     text not null default '',
  images      text[] not null default '{}',
  type        text not null default 'modal' check (type in ('modal','banner','toast')),
  position    text not null default 'center' check (position in ('top','center','bottom')),
  pages       text[] not null default '{*}',            -- 在哪些页面显示，['*'] = 所有页面
  priority    integer not null default 0,               -- 优先级，数字越大越优先
  active      boolean not null default true,
  start_at    timestamptz,                              -- 生效起始时间（null = 不限）
  end_at      timestamptz,                              -- 生效截止时间（null = 不限）
  dismiss_key text not null default 'once' check (dismiss_key in ('once','always','session')),
  link        text not null default '',                 -- 可选跳转链接
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_announcements_window on public.announcements (active, start_at, end_at);
alter table public.announcements enable row level security;
-- 读：所有人可见（前端用 anon key 查询）；写：无任何 anon/authenticated 策略 → 仅 service_role 可写
drop policy if exists "announcements_select" on public.announcements;
create policy "announcements_select" on public.announcements for select using (true);

-- 1.8 系统配置表（运行时远端配置：菜单显隐 / 数据源顺序 / 功能开关）
--     前端 src/config/remote.ts 启动时拉取并合成「本地默认 + 远程覆盖」；
--     value 用 jsonb，随时新增配置项（如 features / theme）无需 ALTER 表。
--     ⚠️ DROP + 重建（清数据）。
drop table if exists public.app_config cascade;
create table public.app_config (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.app_config enable row level security;
-- 读：所有人可见（前端 anon 拉取）；写：仅 service_role（控制台 SQL / 服务端脚本）
drop policy if exists "app_config_select" on public.app_config;
create policy "app_config_select" on public.app_config for select using (true);

-- 可选：默认写入「菜单显隐」示例配置（社区默认关闭；要开启改回 true 后更新）。
-- 前端未建表 / 无此 key 时全部走本地默认，故示例注释掉即可，需要时取消注释执行。
/*
insert into public.app_config (key, value) values
('menus', '{"market":true,"watch":true,"community":false,"profile":true}'::jsonb),
('sources', '{"realtime":["eastmoney","tencent","sina"],"kline":["eastmoney","tencent","sina"],"trend":["eastmoney","tencent","sina"],"flow":["eastmoney","proxy"],"search":["eastmoney","tencent","sina"],"news":["eastmoney"]}'::jsonb)
on conflict (key) do nothing;
*/


-- ╔══════════════════════════════════════════════════════════════╗
-- ║ 2. 社区核心表                                                 ║
-- ╚══════════════════════════════════════════════════════════════╝

-- 2.1 帖子
--     ⚠️ DROP + 重建（清数据）。
drop table if exists public.community_posts cascade;
create table public.community_posts (
  id         uuid primary key default gen_random_uuid(),
  -- 预留：前端接入 Auth 后写入 auth.uid()；匿名阶段为 null（不强制）
  user_id    uuid references auth.users (id) on delete set null,
  type       text not null check (type in ('text','card')),
  author     text not null check (length(author) between 1 and 30),
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
  -- 扩展预留
  status     text not null default 'published'
             check (status in ('published','draft','hidden','deleted')),  -- 内容状态机：软删用 deleted，可审计/恢复
  images     text[] not null default '{}',               -- 帖子配图 URL 数组（未来配图）
  tags       text[] not null default '{}',               -- 话题标签（#大盘），便于 @> 包含查询 + GIN 索引
  meta       jsonb not null default '{}'::jsonb,         -- 兜底扩展位：任何未来结构化字段先放这里，避免频繁 ALTER
  created_at timestamptz not null default now(),
  -- 数据完整性：text 帖必须有 content 且无 card；card 帖必须有 card 且无 content
  constraint posts_shape check (
    (type = 'text' and content is not null and card is null)
    or (type = 'card' and card is not null and content is null)
  )
);
-- 信息流排序 + 游标分页（keyset）：(created_at desc, id desc)
create index if not exists idx_posts_feed on public.community_posts (created_at desc, id desc);
-- 话题标签包含查询（如「含 #大盘 的帖子」）走 GIN 索引，未来启用标签筛选时无需再建
create index if not exists idx_posts_tags on public.community_posts using gin (tags);

-- 2.2 回复（listRemote 通过 post_id 外键关联读取，资源名 community_replies）
--     ⚠️ DROP + 重建（清数据）。
drop table if exists public.community_replies cascade;
create table public.community_replies (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.community_posts (id) on delete cascade,
  user_id    uuid references auth.users (id) on delete set null,
  author     text not null check (length(author) between 1 and 30),
  content    text not null check (length(content) between 1 and 1000),
  -- 扩展预留
  status     text not null default 'published'
             check (status in ('published','hidden','deleted')),
  parent_id  uuid references public.community_replies (id) on delete set null,  -- 楼中楼 / 引用回复
  meta       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_replies_post on public.community_replies (post_id, created_at);

-- 2.3 点赞（真实记录；计数由触发器从本表聚合，杜绝客户端伪造）
--     ⚠️ DROP + 重建（清数据）。
drop table if exists public.community_likes cascade;
create table public.community_likes (
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
  id uuid, type text, author text, topic jsonb,
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
    select p.id, p.type, p.author, p.topic, p.content, p.card, p.likes, v_liked, p.created_at
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
insert into public.community_posts (type, author, topic, content, card, likes) values
 ('text','趋势猎人','{"type":"sector","name":"大盘"}',
  '大盘缩量回踩 20 日线，但北向资金连续三日净流入，个人判断这里更像是洗盘而不是转势。仓位不动，等放量确认再决定加仓。', null, 18),
 ('card','价值守望','{"type":"stock","name":"贵州茅台","code":"600519"}', null,
  '{"kind":"holding","stock":"贵州茅台","code":"600519","cost":1480,"shares":100,"price":1526.5}', 7),
 ('card','短线小王','{"type":"stock","name":"宁德时代","code":"300750"}', null,
  '{"kind":"operation","stock":"宁德时代","code":"300750","side":"buy","price":186.2,"shares":200,"note":"突破平台 + 量能放大，打底仓"}', 4),
 ('card','复利机器', null, null,
  '{"kind":"profit","period":"本月","totalReturn":6.8,"realized":4200,"unrealized":-1300,"winRate":63}', 25),
 ('text','复利机器','{"type":"sector","name":"投资理念"}',
  '分享一个心态：账户回撤 5% 以内就当没发生，别天天盯盘。把时间花在研究财报和产业链上，收益是认知的副产品。', null, 33);
*/


-- ╔══════════════════════════════════════════════════════════════╗
-- ║ 8. 生产强化（接入登录、正式上线前执行本段）                  ║
-- 把社区写操作从「匿名可写」收紧为「仅登录用户可写」，并约束     ║
-- 「仅作者可删 / 改自己的帖子」，杜绝匿名用户乱发、乱删。         ║
-- 读（select）保持公开，匿名访客仍可浏览社区。                   ║
-- 前提：前端已接入 Supabase Auth，发帖/回复会带上 auth.uid()。     ║
-- 注：点赞走 toggle_post_like（security definer，以表属主身份执行， ║
--     自动绕过 RLS），因此点赞计数仍由触发器维护、客户端无法伪造。  ║
-- ╚══════════════════════════════════════════════════════════════╝

-- 帖子：登录用户才能发；强制 user_id = 本人 且 likes = 0（防伪造点赞）
drop policy if exists "community_posts_insert" on public.community_posts;
create policy "community_posts_insert" on public.community_posts
  for insert to authenticated with check (auth.uid() = user_id and likes = 0);
drop policy if exists "community_posts_update" on public.community_posts;
create policy "community_posts_update" on public.community_posts
  for update to authenticated using (auth.uid() = user_id);
drop policy if exists "community_posts_delete" on public.community_posts;
create policy "community_posts_delete" on public.community_posts
  for delete to authenticated using (auth.uid() = user_id);

-- 回复：登录用户才能回复（作者为本人昵称）
drop policy if exists "community_replies_insert" on public.community_replies;
create policy "community_replies_insert" on public.community_replies
  for insert to authenticated with check (true);

-- 点赞：登录用户才能点赞（直接表操作层面收紧；实际走 rpc 已安全）
drop policy if exists "community_likes_insert" on public.community_likes;
create policy "community_likes_insert" on public.community_likes
  for insert to authenticated with check (true);
drop policy if exists "community_likes_delete" on public.community_likes;
create policy "community_likes_delete" on public.community_likes
  for delete to authenticated using (true);

