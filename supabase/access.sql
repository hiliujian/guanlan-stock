-- =====================================================================
-- 观澜 guanlan-stock · 页面白名单表 page_access（增量迁移，非破坏性）
-- ---------------------------------------------------------------------
-- 适用环境：Supabase 免费版（PostgreSQL 15+）
-- 执行位置：Supabase 控制台 → SQL Editor → 粘贴本文件 → Run
-- 重建策略：仅新建 page_access 表（若不存在）+ 幂等种子 + RLS 策略；
--         不 DROP 任何现有表，不影响 profiles / watchlists / 社区 等数据。
-- ⚠️ 与 deploy.sql 不同，本脚本可安全重复运行（on conflict do nothing）。
--
-- 设计要点（满足「可配置 + 可扩展」需求）：
--   ① path：路由标识。Tab 视图用 "market"/"watch"/"community"/"profile"；
--           真实页面用 "pages/xxx/yyy"（与前端 normalizeRoute 解析一致）。
--   ② open：是否对游客开放（白名单开关）。false + 未登录 → 前端拦截跳转登录页。
--   ③ show_in_menu：是否在导航 / 菜单中展示（底部 Tab 栏、各页菜单过滤用）。
--   ④ sort_weight：排序权重（预留，未来排序用）。
--   ⑤ extra：jsonb 扩展字段（预留角色权限 / 时间段开放等未来维度，不破坏表结构）。
--           例：extra = {"roles":["user","vip"], "open_from":"09:00", "open_to":"22:00"}
--   ⑥ is_tab：是否为底部 Tab 视图（与 TabKey 对应，便于未来按 Tab 维度查询）。
--   ⑦ updated_at：配置变更时间，便于审计。
-- 前端对应：src/store/access.ts（内置默认兜底）+ src/store/guard.ts（拦截器）。
-- =====================================================================

create table if not exists public.page_access (
  path         text primary key,
  open         boolean not null default false,
  show_in_menu boolean not null default false,
  sort_weight  integer not null default 0,
  extra        jsonb   not null default '{}'::jsonb,
  is_tab       boolean not null default false,
  updated_at   timestamptz not null default now()
);

comment on table  public.page_access is '页面访问白名单：open=游客可访问；show_in_menu=菜单展示；extra=预留角色/时段等扩展维度';
comment on column public.page_access.path is '路由标识：Tab 用 market/watch/community/profile；页面用 pages/xxx/yyy';
comment on column public.page_access.extra is '扩展字段 jsonb：预留 roles / open_from / open_to 等未来维度';

-- 种子：仅插入「默认所需」配置；已存在则保留现有配置（on conflict do nothing）。
-- 当前需求：market 开放，其余（watch/community/profile 及各二级页）默认拦截。
insert into public.page_access (path, open, show_in_menu, is_tab, sort_weight) values
  ('market',              true,  true,  true,  10),
  ('pages/auth/login',    true,  false, false, 0),
  ('pages/auth/register', true,  false, false, 0),
  ('pages/auth/reset',    true,  false, false, 0),
  ('pages/index/index',   true,  false, false, 0),
  ('watch',               false, true,  true,  20),
  ('community',           false, true,  true,  30),
  ('profile',             true,  true,  true,  40),
  ('pages/settings/settings',   false, false, false, 0),
  ('pages/profile/edit',       false, false, false, 0),
  ('pages/profile/security',   false, false, false, 0),
  ('pages/profile/level',      false, false, false, 0)
on conflict (path) do nothing;

-- RLS：公开可读（匿名 / 已登录均可 SELECT，供前端 anon key 拉取白名单）；
--      写入仅服务端（控制台 / service_role），与 app_config 表策略一致。
alter table public.page_access enable row level security;

drop policy if exists "page_access_public_read" on public.page_access;
create policy "page_access_public_read" on public.page_access
  for select using (true);

-- 未来若需后台管理写入，可另加 service_role 专用 policy（默认 service_role 绕过 RLS，无需额外策略）。
