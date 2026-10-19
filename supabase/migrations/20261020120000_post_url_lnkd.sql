-- Hotfix: accept lnkd.in short links (the LinkedIn app's "Copy link to post") and mobile / country-subdomain
-- post links. Only the post-URL regex changes in submit_share and record_step; bodies are copied from
-- 20261019070000_share_status.sql and 20261019080000_share_steps.sql. Mirrors isLinkedInPostUrl in
-- src/scripts/share-copy.ts: keep them equivalent. Safe to re-run.

create or replace function public.submit_share(code text, post_url text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  a applications%rowtype;
  clean text := nullif(trim(coalesce(post_url, '')), '');
  friends int;
begin
  select * into a from applications where ref_code = lower(trim(code)) for update;
  if a.id is null then raise exception 'unknown code'; end if;
  if a.share_status = 'submitted' then return referral_status(code); end if;
  if a.share_status = 'void' or (a.share_status = 'pending_share' and now() > a.share_due) then
    raise exception 'void';
  end if;
  if clean is not null and clean !~* '^(https?://)?((www|m|[a-z]{2})\.)?(linkedin\.com/(posts|feed/update|pulse|embed/feed/update|mwlite/feed/update)/|lnkd\.in/)[^\s]+$' then
    clean := null;
    if (referral_status(code)->>'friends_submitted')::int < 2 then raise exception 'need a linkedin post link'; end if;
  end if;
  if clean is null and (referral_status(code)->>'friends_submitted')::int < 2 then
    raise exception 'need a linkedin post link';
  end if;
  if clean is not null and clean !~* '^https?://' then clean := 'https://' || clean; end if;
  update applications set share_status = 'submitted', share_submitted_at = now(), post_url = clean where id = a.id;
  insert into share_events (ref_code, step) values (a.ref_code, 'submitted');
  return referral_status(code);
end $$;

create or replace function public.record_step(code text, kind text, url text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare app_id bigint; clean text := nullif(trim(coalesce(url, '')), '');
begin
  select id into app_id from applications where ref_code = lower(trim(code));
  if app_id is null then raise exception 'unknown code'; end if;
  if kind is null or kind not in ('linkedin', 'email', 'opened', 'post_copied', 'li_opened', 'url_pasted', 'no_linkedin') then
    raise exception 'unknown kind';
  end if;
  if kind in ('opened', 'post_copied', 'li_opened', 'url_pasted', 'no_linkedin') then
    insert into share_events (ref_code, step) values (lower(trim(code)), record_step.kind) on conflict do nothing;
    return referral_status(code);
  end if;
  if kind = 'linkedin' then
    if clean is not null then
      if clean !~* '^(https?://)?((www|m|[a-z]{2})\.)?(linkedin\.com/(posts|feed/update|pulse|embed/feed/update|mwlite/feed/update)/|lnkd\.in/)[^\s]+$' then
        raise exception 'need a linkedin post link';
      end if;
      if clean !~* '^https?://' then clean := 'https://' || clean; end if;
    end if;
  else
    clean := null;
  end if;
  -- The first saved URL wins and verified_at is never cleared here: the code is also a public share code.
  insert into referral_steps (application_id, kind, url) values (app_id, record_step.kind, clean)
  on conflict on constraint referral_steps_application_id_kind_key do update
    set url = coalesce(referral_steps.url, excluded.url);
  return referral_status(code);
end $$;

revoke all on function public.submit_share(text, text) from public;
grant execute on function public.submit_share(text, text) to anon, authenticated;
revoke all on function public.record_step(text, text, text) from public;
grant execute on function public.record_step(text, text, text) to anon, authenticated;
