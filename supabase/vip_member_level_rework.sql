-- =====================================================================
-- VIP 会员 + 等级校准（2026-08-30）幂等迁移
-- 适用：已在运行的现网库（在 Supabase Dashboard → SQL Editor 中执行，可重复执行）。
-- 内容：
--   1) profiles 增加 vip / vip_expires_at 列（官方授予，默认 false / null=永久）
--   2) refresh_level 更新为新阈值 + greatest 保底（等级只升不降）
--   3) 特权列保护触发器：客户端不可改 exp / level / vip / vip_expires_at
--   4) 一次性把全员等级同步到 exp 所对应档位（greatest 只升不降，安全）
-- 阈值与前端 src/store/level.ts TIERS 一致：0/150/450/900/1600/3000/5500。
-- VIP 有效期语义：vip=true 且 vip_expires_at 为空 = 永久；到期后前端视为未开通。
--
-- ⏱ 执行状态（2026-08-30）：1-4 步已在生产库执行完毕（Management API）；
--    higher 账号已充值 1 个月会员（vip_expires_at = 2026-09-30）。
-- =====================================================================

-- 1. VIP 列（幂等）
alter table public.profiles add column if not exists vip boolean not null default false;
alter table public.profiles add column if not exists vip_expires_at timestamptz;

-- 2. 等级刷新函数：新阈值 + 只升不降
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

-- 3. 特权列保护：exp / level / vip / vip_expires_at 仅服务端（security definer）可写
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

-- 4. 一次性同步全员等级到 exp 对应档位（greatest 保底，绝不会把任何人降级）
do $$
declare r record;
begin
  for r in select id from public.profiles loop
    perform public.refresh_level(r.id);
  end loop;
end;
$$;

-- 5. VIP 授予 / 回收（官方操作；把 username 换成实际账号后取消注释执行）
-- 限时会员（1 年）：
-- update public.profiles set vip = true, vip_expires_at = now() + interval '1 year' where username = '目标用户名';
-- 永久会员：
-- update public.profiles set vip = true, vip_expires_at = null where username = '目标用户名';
-- 回收 / 到期处理：
-- update public.profiles set vip = false, vip_expires_at = null where username = '目标用户名';

-- 6. 自检（执行后肉眼确认）：
-- select username, exp, level, vip, vip_expires_at from public.profiles order by exp desc limit 20;
