-- =====================================================================
-- 用户持仓簿 user_holdings（2026-08-29）
-- ---------------------------------------------------------------------
-- 用途：发帖「添加持仓」的一键填入数据源 —— 记住用户添加过的持仓，
--       换设备 / 重新登录后仍可拉取，发帖时一键回填股票、成本价、数量。
--
-- 设计约束：
--   1) 一人一只股票一条记录：unique (user_id, code)，upsert 即「以最新为准」；
--   2) 只保留「数量 > 0」的持仓：check (shares > 0)，
--      数量为 0 / 为负在 DB 层即被拒绝，前端删除 / 置零时直接删行，
--      保证库内数据与用户当前持仓始终一致；
--   3) 账户注销级联清理：user_id → auth.users on delete cascade。
--
-- 幂等：全部 if not exists / drop policy if exists，可重复执行。
-- 不 DROP 任何现有表，不影响 community_posts / watchlists / profiles 等数据。
-- =====================================================================

create table if not exists public.user_holdings (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  code       text not null,                             -- 股票代码（如 600519）
  name       text not null default '',                  -- 股票名称快照（如 贵州茅台）
  cost       numeric not null default 0,                -- 持仓成本价
  shares     numeric not null default 0,                -- 持仓数量（> 0）
  updated_at timestamptz not null default now(),
  constraint user_holdings_user_code_key unique (user_id, code),
  constraint user_holdings_shares_positive check (shares > 0)
);

create index if not exists idx_user_holdings_user on public.user_holdings (user_id, updated_at desc);
create index if not exists idx_user_holdings_user_code on public.user_holdings (user_id, code);

-- RLS：仅本人可读写自己的持仓簿（读用于一键填入，写用于 upsert / 删除）
alter table public.user_holdings enable row level security;

drop policy if exists "user_holdings_select_self" on public.user_holdings;
create policy "user_holdings_select_self" on public.user_holdings
  for select using (auth.uid() = user_id);

drop policy if exists "user_holdings_insert_self" on public.user_holdings;
create policy "user_holdings_insert_self" on public.user_holdings
  for insert with check (auth.uid() = user_id);

drop policy if exists "user_holdings_update_self" on public.user_holdings;
create policy "user_holdings_update_self" on public.user_holdings
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "user_holdings_delete_self" on public.user_holdings;
create policy "user_holdings_delete_self" on public.user_holdings
  for delete using (auth.uid() = user_id);
