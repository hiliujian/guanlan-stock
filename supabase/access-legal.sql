-- 协议页加入页面白名单（游客可访问，不被全局访问拦截跳登录）。
-- 与前端 src/store/access.ts 的 BUILTIN_ACCESS 保持一致。
-- 幂等：仅插入不存在的行；若已存在则确保 open=true。
insert into page_access (path, open, show_in_menu, sort_weight, extra, is_tab)
values
  ('pages/legal/terms',  true, false, 0, '{}', false),
  ('pages/legal/privacy', true, false, 0, '{}', false)
on conflict (path) do update set open = excluded.open;
