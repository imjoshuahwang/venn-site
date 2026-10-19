-- Share steps (venn-site #22). record_step takes the funnel steps, a trigger writes friend_applied, a sweeper
-- voids overdue pending_share rows, and two service-only views show progress. Safe to re-run.

-- One row per (ref_code, step), except friend_applied (bounded by real applications). The code is public, so this
-- keeps an anon-writable table from being flooded.
create unique index if not exists share_events_one_per_step on public.share_events (ref_code, step)
  where step <> 'friend_applied';

-- Copied from 20261019030000_referral_redteam.sql; the share-step branch is new.
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
      if clean !~* '^(https?://)?(www\.)?(linkedin\.com/(posts|feed/update)/|lnkd\.in/)[^\s]+$' then
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

revoke all on function public.record_step(text, text, text) from public;
grant execute on function public.record_step(text, text, text) to anon, authenticated;

-- friend_applied: a new application with another person's code. Uses the referral ledger's own rules, so a self
-- referral, a test row, a non-student and a duplicate person write nothing. Never blocks the insert.
create or replace function public.share_friend_applied() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.referred_by is not null and exists (
    select 1 from referral_ledger l where l.applicant_id = new.id and l.status in ('unconfirmed', 'verified')) then
    insert into share_events (ref_code, step) values (new.referred_by, 'friend_applied');
  end if;
  return null;
exception when others then
  return null;
end $$;
revoke all on function public.share_friend_applied() from public, anon, authenticated;

drop trigger if exists applications_share_friend_applied on public.applications;
create trigger applications_share_friend_applied after insert on public.applications
  for each row execute function public.share_friend_applied();

-- Sweeper: pending_share past share_due -> void, one 'void' event per row. Legacy (null) rows are never touched.
-- Scheduling is the owner's go-live step.
create or replace function public.void_overdue_shares() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  with v as (
    update applications set share_status = 'void'
    where share_status = 'pending_share' and share_due < now()
    returning ref_code)
  , e as (insert into share_events (ref_code, step) select ref_code, 'void' from v on conflict do nothing returning 1)
  select count(*) into n from v;
  return n;
end $$;
revoke all on function public.void_overdue_shares() from public, anon, authenticated;
grant execute on function public.void_overdue_shares() to service_role;

-- Step order (earlier to later): opened < post_copied < li_opened < url_pasted < no_linkedin < friend_applied
-- < submitted < void. Furthest step = the highest-order event the application's code has.
create or replace view public.v_share_funnel with (security_invoker = on) as
select s.step, s.ord, count(distinct a.id) as reached
from (values ('opened', 1), ('post_copied', 2), ('li_opened', 3), ('url_pasted', 4), ('no_linkedin', 5),
             ('friend_applied', 6), ('submitted', 7), ('void', 8)) as s(step, ord)
left join public.share_events e on e.step = s.step
left join public.applications a on a.ref_code = e.ref_code and a.role = 'student' and not a.is_test
group by s.step, s.ord;

create or replace view public.v_share_progress with (security_invoker = on) as
select a.id, a.name, a.ref_code, a.share_status, a.share_due, a.post_url,
  (select f.step from share_events e
     join (values ('opened', 1), ('post_copied', 2), ('li_opened', 3), ('url_pasted', 4), ('no_linkedin', 5),
                  ('friend_applied', 6), ('submitted', 7), ('void', 8)) as f(step, ord) on f.step = e.step
   where e.ref_code = a.ref_code order by f.ord desc limit 1) as furthest_step
from public.applications a
where a.role = 'student' and not a.is_test;

revoke all on public.v_share_funnel, public.v_share_progress from public, anon, authenticated;
grant select on public.v_share_funnel, public.v_share_progress to service_role;
