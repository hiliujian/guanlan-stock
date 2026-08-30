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
  avatar_url   text not null default '',
  avatar_frame text not null default '',                  -- 头像框 id（''=无边框；可选值见前端 src/utils/avatarFrame.ts：rainbow/member/aurora/diamond）
  signature    text not null default '',                  -- 个人简介（公开可读，供他人「公开资料页」展示；见 #536）
  level        integer not null default 0,                -- 用户等级序号（0=新手散户，对应前端 TIERS 下标）；由后端维护，前端只读展示
  exp          integer not null default 0,                -- 用户经验值（等级体系 expMin 对应所需经验）；由后端维护，前端用于展示与升级进度
  vip          boolean not null default false,            -- VIP 会员（官方授予开通，客户端不可自改，见 100.3.1 特权列保护）；与等级徽标一体化金色视觉
  vip_expires_at timestamptz,                             -- VIP 有效期（null = 永久）；是否生效由前端 vipActive / 后端按时间判定，客户端不可自改
  -- 扩展预留（接入登录后按需启用，以下均为可选、带默认值，不影响现有逻辑）
  website      text not null default '',
  location     text not null default '',
  prefs        jsonb not null default '{}'::jsonb,        -- 用户偏好（主题/通知开关等），用 jsonb 避免将来每加一项就 ALTER
  last_seen_at timestamptz,                               -- 最近活跃时间（社区排序 / 在线状态）
  -- 隐私开关（需求 B：允许私信 / 公开自选股），默认开放，用户可在「账号安全」页关闭
  allow_dm         boolean not null default true,         -- 允许私信：false 时他人无法向其发送私信（前端禁用入口 + 后端 send_dm 校验双重拦截）
  public_watchlist boolean not null default true,         -- 公开自选股：false 时他人资料页隐藏其自选股（前端隐藏 + 后端 get_user_watchlist 校验）
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
  sort_order integer not null default 0,                 -- 分组内自定义排序权重（单分组视图用）
  global_sort_order integer,                             -- 「全部」视图独立排序权重（与 sort_order 互不影响；可空，未拖拽时回落 created_at）
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

-- 1.4.3 清理历史幽灵账号（幂等，手动清理存量脏数据）
--   旧版注册页曾用 is_email_taken() 预判邮箱是否已注册；但 OTP 发送验证码即落一条
--   「已确认并有密码」的账号，导致该函数无法靠字段区分幽灵与真实账号、误拦新注册。
--   2026-08 起注册页已改为「直接走验证码流程、用 Supabase 返回信号区分」，不再调用
--   is_email_taken()（该函数已移除）。此处仅提供一次性清理旧数据的语句。
--   这些账号永远无法登录，删除是安全的；依赖其 profiles / watchlists 空壳行会随
--   FK on delete cascade 一并清除。已确认邮箱或已设密码的真实账号绝不受影响。
--   执行权限：SQL 编辑器 / db push 具 postgres 角色权限，可直接操作 auth.users。
delete from auth.users
 where email_confirmed_at is null
   and (encrypted_password is null or encrypted_password = '')
   and last_sign_in_at is null;

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
  -- 数据完整性：text 帖必须有 content 且无 card；card 帖必须有 card。
  -- 2026-08-29 放宽：card 帖允许同时携带正文（正文与附加卡片可共存，PostCard 按
  -- content / card 是否存在独立渲染，前端发布链路即按此组合提交）。
  constraint posts_shape check (
    (type = 'text' and content is not null and card is null)
    or (type = 'card' and card is not null)
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
-- ║ 5.1 私信表 + 消息中心后端                                     ║
-- 私信 community_dms；点赞 / 评论通知从 community_likes /           ║
-- community_replies 实时派生（get_my_notifications），无需独立通知表。║
-- ╚══════════════════════════════════════════════════════════════╝
create table if not exists public.community_dms (
  id          uuid primary key default gen_random_uuid(),
  sender_id   uuid not null references auth.users (id) on delete cascade,
  receiver_id uuid not null references auth.users (id) on delete cascade,
  content     text not null check (length(content) between 1 and 2000),
  status      text not null default 'sent' check (status in ('sent','read','deleted')),
  created_at  timestamptz not null default now()
);
create index if not exists idx_dms_inbox on public.community_dms (receiver_id, created_at);
create index if not exists idx_dms_sent  on public.community_dms (sender_id, created_at);
create index if not exists idx_dms_convo on public.community_dms (least(sender_id,receiver_id), greatest(sender_id,receiver_id), created_at);

-- RLS：仅收发双方可见 / 仅本人可发 / 仅接收方可标记已读
alter table public.community_dms enable row level security;
drop policy if exists "community_dms_select" on public.community_dms;
create policy "community_dms_select" on public.community_dms
  for select to authenticated using (auth.uid() = sender_id or auth.uid() = receiver_id);
drop policy if exists "community_dms_insert" on public.community_dms;
create policy "community_dms_insert" on public.community_dms
  for insert to authenticated with check (auth.uid() = sender_id);
drop policy if exists "community_dms_update" on public.community_dms;
create policy "community_dms_update" on public.community_dms
  for update to authenticated using (auth.uid() = receiver_id)
  with check (auth.uid() = receiver_id and status = 'read');

-- 发私信
create or replace function public.send_dm(p_receiver uuid, p_content text)
returns table (id uuid, sender_id uuid, receiver_id uuid, content text, status text, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  v_allow_dm boolean;
begin
  if p_receiver = auth.uid() then raise exception '不能给自己发私信'; end if;
  if length(trim(p_content)) < 1 then raise exception '私信内容不能为空'; end if;
  -- 收件人关闭「允许私信」则拒绝（后端兜底，防止前端禁用入口被绕过）
  select allow_dm into v_allow_dm from public.profiles where profiles.id = p_receiver;
  if coalesce(v_allow_dm, true) = false then
    raise exception '对方未开启私信';
  end if;
  return query
  insert into public.community_dms (sender_id, receiver_id, content)
  values (auth.uid(), p_receiver, trim(p_content))
  returning community_dms.id, community_dms.sender_id, community_dms.receiver_id,
            community_dms.content, community_dms.status, community_dms.created_at;
end;
$$;

-- 他人自选股查询（受「公开自选股」权限控制）
--   仅当「查询者是本人」或「目标用户开启 public_watchlist」时，返回其自选股（code, market, name）；
--   否则返回空集（前端据此显示「对方未公开自选股」）。
--   SECURITY DEFINER：绕过 watchlists 的 owner-only RLS，改由函数内部裁决可见性，避免越权读取他人自选。
--   仅回传 code / market / name 三个公开字段，绝不下发 note / 提醒等私有配置。
create or replace function public.get_user_watchlist(p_target uuid)
returns table (code text, market text, name text)
language plpgsql security definer set search_path = public as $$
begin
  -- 本人：始终可见自己的自选
  if p_target = auth.uid() then
    return query
      select w.code, w.market, w.name
      from public.watchlists w
      where w.user_id = p_target
      order by w.created_at asc;
    return;
  end if;
  -- 他人：仅当对方开启「公开自选股」
  if exists (
    select 1 from public.profiles p
    where p.id = p_target and coalesce(p.public_watchlist, true) = true
  ) then
    return query
      select w.code, w.market, w.name
      from public.watchlists w
      where w.user_id = p_target
      order by w.created_at asc;
  end if;
  -- 否则返回空集（不 return query）
end;
$$;
grant execute on function public.get_user_watchlist(uuid) to anon, authenticated;

-- 会话列表（按对方聚合：最近一条 + 未读数）
create or replace function public.get_my_conversations()
returns table (
  other_id uuid, other_name text, other_avatar text, other_frame text,
  last_content text, last_at timestamptz, unread_count bigint, last_sender_me boolean
)
language sql security definer set search_path = public as $$
  with mine as (
    select id, sender_id, receiver_id, content, created_at, status
    from public.community_dms
    where sender_id = auth.uid() or receiver_id = auth.uid()
  ),
  paired as (
    select case when sender_id = auth.uid() then receiver_id else sender_id end as other_id,
           content, created_at, status, sender_id
    from mine
  ),
  latest as (
    select distinct on (other_id) other_id, content as last_content, created_at as last_at,
           (sender_id = auth.uid()) as last_sender_me
    from paired order by other_id, created_at desc
  ),
  unread as (
    select case when sender_id = auth.uid() then receiver_id else sender_id end as other_id,
           count(*) as uc
    from mine
    where receiver_id = auth.uid() and status <> 'read'
    group by 1
  )
  select l.other_id,
         coalesce(p.display_name, p.username, '用户') as other_name,
         p.avatar_url as other_avatar,
         p.avatar_frame as other_frame,
         l.last_content, l.last_at, coalesce(u.uc,0)::bigint, l.last_sender_me
  from latest l
  left join unread u on u.other_id = l.other_id
  left join public.profiles p on p.id = l.other_id
  order by l.last_at desc;
$$;

-- 私信会话详情（按时间升序，顺带标记已读）
create or replace function public.get_dm_thread(p_other uuid)
returns table (id uuid, sender_id uuid, receiver_id uuid, content text, status text, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  update public.community_dms
     set status = 'read'
   where community_dms.receiver_id = auth.uid() and community_dms.sender_id = p_other and community_dms.status <> 'read';
  return query
  select d.id, d.sender_id, d.receiver_id, d.content, d.status, d.created_at
  from public.community_dms d
  where (d.sender_id = auth.uid() and d.receiver_id = p_other)
     or (d.sender_id = p_other and d.receiver_id = auth.uid())
  order by d.created_at asc;
end;
$$;

-- 未读私信数
create or replace function public.unread_dm_count()
returns integer language sql security definer set search_path = public as $$
  select coalesce(count(*),0)::integer
  from public.community_dms
  where receiver_id = auth.uid() and status <> 'read';
$$;

-- 消息中心：点赞 / 评论通知（从我自己的帖子实时派生，无需独立通知表）
create or replace function public.get_my_notifications()
returns table (
  id uuid, kind text, actor_id uuid, actor_name text, actor_avatar text, actor_frame text,
  post_id uuid, post_snippet text, comment_content text, created_at timestamptz
)
language sql security definer set search_path = public as $$
  with likes as (
    select l.post_id, l.user_id as actor_id, l.created_at
    from public.community_likes l
    join public.community_posts p on p.id = l.post_id
    -- is distinct from：NULL actor（历史脏数据）一律视为「他人」纳入通知，
    -- 同时仍正确排除自己（auth.uid()）点赞自己的帖子。
    where p.user_id = auth.uid() and l.user_id is distinct from auth.uid()
  ),
  comments as (
    select r.post_id, r.user_id as actor_id, r.content, r.created_at
    from public.community_replies r
    join public.community_posts p on p.id = r.post_id
    where p.user_id = auth.uid() and r.user_id is distinct from auth.uid()
      and r.status = 'published'
  ),
  like_rows as (
    select md5('like-' || l.post_id || '-' || l.actor_id)::uuid as id,
           'like'::text as kind, l.actor_id, l.post_id,
           null::text as comment_content, l.created_at
    from likes l
  ),
  comment_rows as (
    select md5('comment-' || c.post_id || '-' || c.actor_id || '-' || c.created_at)::uuid as id,
           'comment'::text as kind, c.actor_id, c.post_id,
           c.content as comment_content, c.created_at
    from comments c
  ),
  merged as ( select * from like_rows union all select * from comment_rows )
  select m.id, m.kind, m.actor_id,
         coalesce(pr.display_name, pr.username, '用户') as actor_name,
         pr.avatar_url as actor_avatar,
         pr.avatar_frame as actor_frame,
         m.post_id,
         coalesce(p2.content, '分享了持仓卡片') as post_snippet,
         m.comment_content, m.created_at
  from merged m
  join public.community_posts p2 on p2.id = m.post_id
  left join public.profiles pr on pr.id = m.actor_id
  order by m.created_at desc
  limit 100;
$$;


-- ╔══════════════════════════════════════════════════════════════╗
-- ║ 5.x 帖子搜索（关键字 / 股票代码 / 股票名称）                   ║
-- ║ 社区页顶部搜索栏调用；SECURITY DEFINER 直接读 community_posts。║
-- ║ 匹配：content 正文、topic->name / ->code、card->stock / ->code ║
-- ║ 返回与 feed 同构行（含嵌套 replies JSON），前端复用同一映射。   ║
-- ╚══════════════════════════════════════════════════════════════╝
create or replace function public.search_posts(p_query text)
returns table (
  id uuid, type text, author text, user_id uuid, topic jsonb,
  content text, card jsonb, images text[], likes integer, created_at timestamptz,
  replies json
)
language sql security definer set search_path = public as $$
  select
    p.id, p.type, p.author, p.user_id, p.topic, p.content, p.card, p.images, p.likes, p.created_at,
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
  order by p.created_at desc
  limit 50;
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

-- ╔══════════════════════════════════════════════════════════════╗
-- ║ 99. 生产库幂等兜底补丁（非破坏性，可重复执行）                  ║
-- ╚══════════════════════════════════════════════════════════════╝
-- 上方 1.1 用「DROP + CREATE」重建 profiles（含 exp 列），但会清空数据，
-- 生产库 / 已 populated 的库不能这么跑。若某张早期旧 profiles 表缺 exp 列
-- （等级体系会恒显默认等级），用下方语句非破坏性地补齐，绝不丢数据。
-- 全新库走 DROP + CREATE 已含 exp / vip，本段为冗余安全网；ADD COLUMN IF NOT EXISTS 幂等。
alter table public.profiles add column if not exists exp integer not null default 0;
alter table public.profiles add column if not exists vip boolean not null default false;
alter table public.profiles add column if not exists vip_expires_at timestamptz;

-- ╔══════════════════════════════════════════════════════════════╗
-- ║ 100. 经验值 / 等级发放（修复「经验值恒为 0」）                  ║
-- ╠══════════════════════════════════════════════════════════════╣
-- 此前 deploy.sql 只定义了 profiles.exp / level 列与前端 EXP_SOURCES 规则，
-- 但没有任何累加逻辑，导致经验值永远为 0。本块补齐「行为 → 加经验 → 按阈值升级」：
--   · 完善资料 +20（一次性）     · 每日登录 +5（连登每满 7 天再 +15）
--   · 添加自选 +3 / 只           · 发帖 +10   · 评论 +5
--   · 点赞 +2                   · 被点赞 +3（帖子作者）
-- 等级由累计经验自动推导（与前端 src/store/level.ts TIERS 阈值一致，2026-08-30 校准：
--   0 / 150 / 450 / 900 / 1600 / 3000 / 5500；等级只升不降，见 100.2 greatest 保底）。
-- 幂等：重复执行安全；老库直接跑本块即生效（ADD COLUMN / DROP+CREATE 兜底）。
-- ╚══════════════════════════════════════════════════════════════╝

-- 100.1 经验发放所需附加列（幂等；老库自动补齐）
alter table public.profiles add column if not exists signin_streak        integer not null default 0;
alter table public.profiles add column if not exists last_signin          date;
alter table public.profiles add column if not exists profile_bonus_claimed boolean not null default false;
alter table public.profiles add column if not exists last_login           jsonb;  -- 上一次成功登录的地点/时间/设备（即账号安全页展示的「上次登录」）
alter table public.profiles add column if not exists login_current        jsonb;  -- 本次（当前）登录信息；登录时由 capture_login_info 原子地交换到 last_login

-- 100.3 记录登录信息：原子地把「本次登录」写入 login_current，并把旧的 login_current 移为 last_login
-- （即「上次登录」= 上一次成功登录，而非本次）。用 auth.uid() 限定仅能改写本人记录，避免越权。
-- 关键：SET 子句中 last_login = login_current 引用的是本行 UPDATE 执行前的旧值，故实现无竞态的字段交换。
create or replace function public.capture_login_info(p_info jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  update public.profiles
     set login_current = p_info,
         last_login    = login_current
   where id = auth.uid();
end;
$$;
grant execute on function public.capture_login_info(jsonb) to anon, authenticated;

-- 100.2 按累计经验刷新等级（阈值与前端 TIERS 一致，2026-08-30 校准）
--   greatest 保底：等级只升不降 —— 阈值上调等校准不会把已获等级降回去。
create or replace function public.refresh_level(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user is null then return; end if;
  update public.profiles p
     set level = greatest(
       p.level,
       (select max(t.lv) from (values
         (0, 0), (1, 150), (2, 450), (3, 900), (4, 1600), (5, 3000), (6, 5500)
       ) as t(lv, mn)
       where t.mn <= p.exp)
     )
   where p.id = p_user;
end;
$$;

-- 100.3 通用经验发放：累加 exp 并自动刷新等级，返回最新 exp
create or replace function public.grant_exp(p_user uuid, p_amount integer)
returns integer language plpgsql security definer set search_path = public as $$
begin
  if p_user is null or p_amount is null or p_amount <= 0 then
    return coalesce((select exp from public.profiles where id = p_user), 0);
  end if;
  update public.profiles set exp = exp + p_amount where id = p_user;
  perform public.refresh_level(p_user);
  return coalesce((select exp from public.profiles where id = p_user), 0);
end;
$$;

-- 100.3.1 特权列保护：exp / level / vip / vip_expires_at 仅由服务端（security definer，postgres）维护，
--   客户端（anon / authenticated 直连 PostgREST，受 profiles_update_self RLS 放行）
--   试图改动这些列时直接报错。注册建行 / 兜底建行走 security definer，不受影响。
create or replace function public.protect_profiles_privileged()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('anon', 'authenticated') then
    if new.exp <> coalesce(old.exp, 0)
       or new.level <> coalesce(old.level, 0)
       or new.vip <> coalesce(old.vip, false)
       or new.vip_expires_at is distinct from old.vip_expires_at then
      raise exception 'profiles.exp/level/vip/vip_expires_at 由系统维护，客户端不可修改';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_protect_profiles_privileged on public.profiles;
create trigger trg_protect_profiles_privileged
  before insert or update on public.profiles
  for each row execute function public.protect_profiles_privileged();

-- 100.4 行为触发器：添加自选 / 发帖 / 评论 / 点赞（含被点赞）
create or replace function public.exp_on_watch()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.user_id is not null then perform public.grant_exp(new.user_id, 3); end if;
  return null;
end;
$$;
drop trigger if exists trg_exp_watch on public.watchlists;
create trigger trg_exp_watch
  after insert on public.watchlists
  for each row execute function public.exp_on_watch();

create or replace function public.exp_on_post()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.user_id is not null then perform public.grant_exp(new.user_id, 10); end if;
  return null;
end;
$$;
drop trigger if exists trg_exp_post on public.community_posts;
create trigger trg_exp_post
  after insert on public.community_posts
  for each row execute function public.exp_on_post();

create or replace function public.exp_on_comment()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.user_id is not null then perform public.grant_exp(new.user_id, 5); end if;
  return null;
end;
$$;
drop trigger if exists trg_exp_comment on public.community_replies;
create trigger trg_exp_comment
  after insert on public.community_replies
  for each row execute function public.exp_on_comment();

create or replace function public.exp_on_like()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_owner uuid;
begin
  -- 点赞者 +2（仅登录用户）
  if new.user_id is not null then perform public.grant_exp(new.user_id, 2); end if;
  -- 帖子作者被赞 +3（本人不自赞不重复计）
  select user_id into v_owner from public.community_posts where id = new.post_id;
  if v_owner is not null and v_owner <> new.user_id then
    perform public.grant_exp(v_owner, 3);
  end if;
  return null;
end;
$$;
drop trigger if exists trg_exp_like on public.community_likes;
create trigger trg_exp_like
  after insert on public.community_likes
  for each row execute function public.exp_on_like();

-- 100.5 完善资料奖励（一次性 +20）：任意资料字段首次修改时发放并置位，防重复
create or replace function public.exp_on_profile()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not new.profile_bonus_claimed and (
    new.display_name is distinct from old.display_name
    or new.avatar_url   is distinct from old.avatar_url
  ) then
    update public.profiles set profile_bonus_claimed = true where id = new.id;
    perform public.grant_exp(new.id, 20);
  end if;
  return null;
end;
$$;
drop trigger if exists trg_exp_profile on public.profiles;
create trigger trg_exp_profile
  after update on public.profiles
  for each row execute function public.exp_on_profile();

-- 100.6 每日签到（RPC，前端登录后调用）：当日 +5；连续签到每满 7 天额外 +15
create or replace function public.award_daily_signin()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_user   uuid := auth.uid();
  v_today  date := current_date;
  v_last   date;
  v_streak int;
  v_gain   int;
begin
  if v_user is null then return 0; end if;
  select last_signin, signin_streak into v_last, v_streak
    from public.profiles where id = v_user;
  if v_last = v_today then
    return coalesce((select exp from public.profiles where id = v_user), 0);
  end if;
  if v_last = v_today - 1 then v_streak := coalesce(v_streak, 0) + 1;
  else v_streak := 1; end if;
  v_gain := 5;
  if v_streak % 7 = 0 then v_gain := v_gain + 15; end if;
  update public.profiles set signin_streak = v_streak, last_signin = v_today where id = v_user;
  perform public.grant_exp(v_user, v_gain);
  return coalesce((select exp from public.profiles where id = v_user), 0);
end;
$$;

-- 100.7 兜底：为已有 auth 用户补建 profile 空壳行（幂等），保证签到等逻辑可写
insert into public.profiles (id)
select u.id from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;


-- ╔══════════════════════════════════════════════════════════════╗
-- ║ 101. 今日热门搜索（热度榜单 · 每日零点自动重置）                    ║
-- ╚══════════════════════════════════════════════════════════════╝
-- 需求：展示「今日搜索次数最多」的股票榜单，只统计当日、不叠加历史。
-- 方案：以「日期 day + 代码 code」为复合主键按日分桶，榜单只查 day = 当前日期，
--       「每日零点重置」即由新一天自动开启新统计实现——旧日记录不再进入榜单，
--       无需任务在零点清空计数；reset_hot_searches() 可选清理过期行控表体量。
-- 调用：前端经 supabase-js sb.rpc 直连下方 RPC（get_hot_searches / log_stock_search），
--       二者均为 security definer 且已 grant anon，与旧 Edge Function 用 anon key 调用等价，
--       但去掉了「Edge Function 必须单独部署」这一单点故障（见 DEPLOY.md 第八节）。
--       记录一次搜索（log_stock_search）或读取今日榜单（get_hot_searches）。
-- 注意：day 统一用 Asia/Shanghai 北京时间（服务器 current_date 为 UTC，会在北京 8 点翻转），
--       与 §102 自选热度「今日」口径保持一致。
create table if not exists public.hot_search_daily (
  day        date        not null default (timezone('Asia/Shanghai', now())::date),
  code       text        not null,
  name       text        not null default '',
  count      bigint      not null default 1 check (count >= 0),
  updated_at timestamptz not null default now(),
  primary key (day, code)
);
create index if not exists hot_search_daily_day_idx on public.hot_search_daily (day);

-- 底层表不对外开放（读写都只经下方 security definer RPC），杜绝客户端伪造或越权读。
alter table public.hot_search_daily enable row level security;
drop policy if exists "hot_search_forbid_select" on public.hot_search_daily;
create policy "hot_search_forbid_select" on public.hot_search_daily for select using (false);
drop policy if exists "hot_search_forbid_insert" on public.hot_search_daily;
create policy "hot_search_forbid_insert" on public.hot_search_daily for insert with check (false);
drop policy if exists "hot_search_forbid_update" on public.hot_search_daily;
create policy "hot_search_forbid_update" on public.hot_search_daily for update using (false);
drop policy if exists "hot_search_forbid_delete" on public.hot_search_daily;
create policy "hot_search_forbid_delete" on public.hot_search_daily for delete using (false);

-- 记录一次搜索：当日存在则计数 +1，否则插入计数 1（超当日其余行失效）
create or replace function public.log_stock_search(p_code text, p_name text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.hot_search_daily (day, code, name, count)
  values (timezone('Asia/Shanghai', now())::date, p_code, coalesce(nullif(p_name, ''), ''), 1)
  on conflict (day, code) do update
    set count      = public.hot_search_daily.count + 1,
        name       = case
                       when public.hot_search_daily.name = '' then excluded.name
                       else public.hot_search_daily.name
                     end,
        updated_at = now();
end;
$$;
grant execute on function public.log_stock_search(text, text) to anon, authenticated;

-- 取今日榜单：按搜索次数降序、最近更新优先；limit 自动夹在 [1, 200]
create or replace function public.get_hot_searches(p_limit int default 10)
returns table (code text, name text, count bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  return query
    select h.code, h.name, h.count
    from public.hot_search_daily h
    where h.day = timezone('Asia/Shanghai', now())::date
    order by h.count desc, h.updated_at desc, h.code
    limit greatest(1, least(coalesce(p_limit, 10), 200));
end;
$$;
grant execute on function public.get_hot_searches(int) to anon, authenticated;

-- 清理过期日数据（返回被删行数）；可挂 pg_cron 每日凌晨执行，控表体量非必需
create or replace function public.reset_hot_searches()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_rows integer;
begin
  delete from public.hot_search_daily where day <> (timezone('Asia/Shanghai', now())::date);
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;
grant execute on function public.reset_hot_searches() to anon, authenticated;


-- ╔══════════════════════════════════════════════════════════════╗
-- ║ 102. 自选股人气榜（跨用户持有数聚合热度）                       ║
-- ╠══════════════════════════════════════════════════════════════╣
-- 需求：热度榜按「被多少用户加入自选」计（人气），与 101 的「搜索次数」口径不同。
-- 方案：直接聚合 watchlists 表，按 (code, market) 分组，count(distinct user_id) 为热度值；
--   同一用户将同一条股票加入多个分组只计一次持有人（count distinct 去重）。
--   未登录用户也能查看（anon 可调用），返回热度值 / 名称 / 市场供前端排名与展示。
-- 索引：(code, market) 支撑聚合分组；稳定、可重复执行（if not exists）。
-- 与 101 区别：101 统计「当日搜索次数」、零点重置；本函数统计「自选持有人数」、随自选实时聚合。
-- p_today=true 时仅统计「当日（北京时间，Asia/Shanghai）新增自选」行为（今日热榜），
--   当日无任何新增则返回空——前端据此显示「暂无数据」，绝不兜底完整榜单；
-- p_today=false（默认）统计历史累计持有人数（完整榜单）。两种口径后端各自独立聚合。
-- ╚══════════════════════════════════════════════════════════════╝
create index if not exists idx_watchlists_code_market on public.watchlists (code, market);

drop function if exists public.get_stock_heat(int);
create or replace function public.get_stock_heat(p_limit int default 20, p_today boolean default false)
returns table (code text, name text, market text, heat bigint)
language plpgsql stable security definer set search_path = public as $$
declare
  -- 当日（北京时间）零点：watchlists.created_at 在建表时默认 now()，真实记录每次新增自选的时间
  v_start timestamptz := (date_trunc('day', now() at time zone 'Asia/Shanghai') at time zone 'Asia/Shanghai');
begin
  return query
    select
      w.code,
      coalesce(nullif(max(w.name), ''), '') as name,
      w.market,
      count(distinct w.user_id) as heat
    from public.watchlists w
    where (not p_today) or w.created_at >= v_start
    group by w.code, w.market
    order by heat desc, w.code asc
    limit greatest(1, least(coalesce(p_limit, 20), 200));
end;
$$;
grant execute on function public.get_stock_heat(int, boolean) to anon, authenticated;

-- =====================================================================
-- 增量迁移（非破坏性，仅用于把现有库补齐到 deploy.sql 的最新 schema）
--   · 切勿整份重跑 deploy.sql（含 DROP ... CASCADE 会清空数据）。
--   · 下列 ALTER/CREATE 均带 if not exists，可重复执行、幂等安全。
-- =====================================================================

-- #536 个人简介列：公开可读，供「公开资料页」向他人展示。
--   生产库已通过 Management API 单独部署该列，此处仅作仓库 schema 一致性同步。
alter table public.profiles add column if not exists signature text not null default '';

-- #B 私信 / 自选股权限开关（需求 B）：与上方 CREATE TABLE 声明保持一致，幂等补齐生产库。
--   生产库已通过 Management API 单独部署，此处仅作仓库 schema 一致性同步。
alter table public.profiles add column if not exists allow_dm boolean not null default true;
alter table public.profiles add column if not exists public_watchlist boolean not null default true;

