-- =====================================================================
-- 头像框（avatar_frame）字段迁移
-- ---------------------------------------------------------------------
-- 非破坏性：仅给 profiles 加一列（带默认值 ''），不影响现有数据 / 逻辑。
-- 已存在的账号 avatar_frame 自动为空串（=「无边框」），前端回退到无边框渲染。
-- 幂等：ADD COLUMN IF NOT EXISTS 重复执行安全。
-- =====================================================================

alter table public.profiles
  add column if not exists avatar_frame text not null default '';

-- 给示例账号 higher（id = fc0cf8d1-7f5b-4fc5-a712-37024febbba9）佩戴「炫彩」头像框，
-- 用于演示头像框效果。按 username 定位，避免硬编码 id 在其它环境失效。
update public.profiles
  set avatar_frame = 'rainbow'
  where username = 'higher'
    and (avatar_frame is null or avatar_frame = '');
