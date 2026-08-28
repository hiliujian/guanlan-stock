-- 删除与某人的私信会话（双向）：消息中心「删除会话」按钮调用。
-- community_dms 仅有 select/insert/update RLS，无 delete 策略，故用 security definer
-- 直接删除，并用 auth.uid() 校验调用者确为会话一方，避免越权删除他人消息。
-- 注意：本函数为 returns void（无出参），不会触发 plpgsql RETURNS TABLE 列名歧义（42702）。
create or replace function public.delete_dm_thread(p_other uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 空值或自己：直接返回，不报错（前端已禁用删自己）
  if p_other is null or p_other = auth.uid() then
    return;
  end if;
  delete from public.community_dms
  where (sender_id = auth.uid() and receiver_id = p_other)
     or (sender_id = p_other and receiver_id = auth.uid());
end;
$$;

grant execute on function public.delete_dm_thread(uuid) to anon, authenticated;
