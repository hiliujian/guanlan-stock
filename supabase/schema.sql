-- =====================================================================
-- 股票智能分析 · Supabase 初始化脚本
-- 在 Supabase 控制台 -> SQL Editor 中执行本文件即可完成建表 / 策略 / 存储桶。
-- 适用：PostgreSQL（Supabase 默认）。仅需执行一次。
-- =====================================================================

-- 1) 资料表：注册后自动创建一行（由触发器完成）
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text default '',
  username text default '',
  bio text default '',
  avatar_url text default '',
  created_at timestamptz default now()
);

-- 2) 自选股表
create table if not exists public.watchlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  code text not null,
  market text not null default 'auto',
  name text default '',
  note text default '',
  created_at timestamptz default now()
);
create index if not exists idx_watchlists_user on public.watchlists (user_id);

-- 3) 行级安全（RLS）：仅本人可读写自己的数据
alter table public.profiles enable row level security;
alter table public.watchlists enable row level security;

drop policy if exists "profiles_select_self" on public.profiles;
create policy "profiles_select_self" on public.profiles
  for select using (auth.uid() = id);
drop policy if exists "profiles_upsert_self" on public.profiles;
create policy "profiles_upsert_self" on public.profiles
  for insert with check (auth.uid() = id);
drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self" on public.profiles
  for update using (auth.uid() = id);

drop policy if exists "watchlists_select_self" on public.watchlists;
create policy "watchlists_select_self" on public.watchlists
  for select using (auth.uid() = user_id);
drop policy if exists "watchlists_insert_self" on public.watchlists;
create policy "watchlists_insert_self" on public.watchlists
  for insert with check (auth.uid() = user_id);
drop policy if exists "watchlists_update_self" on public.watchlists;
create policy "watchlists_update_self" on public.watchlists
  for update using (auth.uid() = user_id);
drop policy if exists "watchlists_delete_self" on public.watchlists;
create policy "watchlists_delete_self" on public.watchlists
  for delete using (auth.uid() = user_id);

-- 4) 注册即建 profile 的触发器
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

-- 5) 头像存储桶（限制 2MB，仅本人可传）
insert into storage.buckets (id, name, public, file_size_limit)
values ('avatars', 'avatars', true, 2097152)
on conflict (id) do nothing;

drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read" on storage.objects
  for select using (bucket_id = 'avatars');
drop policy if exists "avatars_auth_insert" on storage.objects;
create policy "avatars_auth_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'avatars' and owner = auth.uid());
drop policy if exists "avatars_owner_delete" on storage.objects;
create policy "avatars_owner_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'avatars' and owner = auth.uid());

-- 6) 开启 watchlists 表的 Realtime（自选变更实时同步）
alter publication supabase_realtime add table public.watchlists;
