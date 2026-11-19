-- Portal Text Josh stub (venn-site #132, epic #112). Additive: one new function. Depends on #126 (phone, whatsapp, text_code columns).
-- save_phone stores the lead's phone and WhatsApp flag and mints results.text_code (VENN-XXXX) once; later calls keep the same code.
-- No verification, no opt-in recording. Authenticated only; the caller must be the lead of an approved result.
create function public.save_phone(p_phone text, p_whatsapp boolean default false) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[\s().-]', '', 'g');
  v_id bigint; v_code text; i int := 0;
begin
  if v_phone !~ '^\+[1-9][0-9]{6,14}$' then
    raise exception 'phone must be in international format, like +14155550123' using errcode = '22023';
  end if;
  select r.id, r.text_code into v_id, v_code from public.results r
    where r.status = 'approved' and public.portal_is_lead(r.id)
    order by r.approved_at desc nulls last, r.id desc limit 1 for update;
  if v_id is null then raise exception 'result not found' using errcode = '42501'; end if;
  while v_code is null loop
    i := i + 1;
    if i > 50 then raise exception 'could not mint a text code' using errcode = '53000'; end if;
    v_code := 'VENN-' || (select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
                          from generate_series(1, 4));
    if exists (select 1 from public.results where text_code = v_code) then v_code := null; end if;
  end loop;
  update public.results set phone = v_phone, whatsapp = coalesce(p_whatsapp, false), text_code = v_code where id = v_id;
  return v_code;
end $$;

revoke execute on function public.save_phone(text, boolean) from public, anon;
grant execute on function public.save_phone(text, boolean) to authenticated;
