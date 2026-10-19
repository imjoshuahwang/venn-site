-- LinkedIn step: the student just confirms they posted; Josh's team checks the tag by hand.
-- record_step('linkedin') now works with no URL. A URL, if sent, is still validated.
-- Re-recording with no URL never clears verified_at or the stored URL.
create or replace function public.record_step(code text, kind text, url text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare app_id bigint; clean text := nullif(trim(coalesce(url, '')), '');
begin
  select id into app_id from applications where ref_code = lower(trim(code));
  if app_id is null then raise exception 'unknown code'; end if;
  if kind not in ('linkedin', 'email') then raise exception 'unknown kind'; end if;
  if kind = 'linkedin' then
    if clean is not null then
      if clean !~* '^(https?://)?(www\.)?(linkedin\.com/(posts|feed/update)/|lnkd\.in/)[^\s]+$' then
        raise exception 'need a linkedin post link';
      end if;
      if clean !~* '^https?://' then clean := 'https://' || clean; end if;
    end if;
  else
    clean := null;
  end if;
  insert into referral_steps (application_id, kind, url) values (app_id, record_step.kind, clean)
  on conflict on constraint referral_steps_application_id_kind_key do update
    set url = coalesce(excluded.url, referral_steps.url),
        verified_at = case when excluded.url is not null and excluded.url is distinct from referral_steps.url
                           then null else referral_steps.verified_at end;
  return referral_status(code);
end $$;

revoke all on function public.record_step(text, text, text) from public;
grant execute on function public.record_step(text, text, text) to anon, authenticated;
