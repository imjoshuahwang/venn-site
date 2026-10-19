-- Referral keys (venn#329 G1, venn-site#40). Two loose strings become real keys:
--   1. applications.referred_by must name an existing ref_code. The trigger nulls an unmatched code on insert
--      (the raw ?ref= stays visible in source), and a foreign key keeps it that way.
--   2. share_events.ref_code references applications.ref_code, so a funnel event cannot orphan.
-- Only students owe a share, so share_status/share_due are set for role = 'student' and null otherwise.
-- Both foreign keys are NOT VALID: they bind new and updated rows now; old rows are not scanned.
-- Josh follow-ups (after this is applied to prod):
--   a. clean the one legacy applications row whose referred_by matches no ref_code
--      (select id, referred_by from applications a where referred_by is not null
--         and not exists (select 1 from applications r where r.ref_code = a.referred_by);)
--   b. alter table public.applications validate constraint applications_referred_by_fkey;
--      alter table public.share_events validate constraint share_events_ref_code_fkey;
-- Safe to re-run.

-- Copied from the latest applications_before_insert (20261019070000_share_status.sql); the unmatched-referrer
-- check and the student-only share lines are new.
create or replace function public.applications_before_insert() returns trigger language plpgsql as $$
begin
  new.email_key := public.email_key(new.email);
  new.referred_by := nullif(lower(trim(new.referred_by)), '');
  if new.referred_by is not null and not exists (select 1 from public.applications where ref_code = new.referred_by) then
    new.referred_by := null;
  end if;
  if new.ref_code is null then new.ref_code := public.new_ref_code(new.name); end if;
  new.confirmed_at := null;
  new.status := 'new';
  new.is_test := coalesce(new.source = 'test', false)
    or coalesce(split_part(lower(new.email), '@', 1) like '%+test%', false)
    or coalesce(new.ref_code = 'minji-wzmf', false);
  if new.role = 'student' then
    new.share_status := 'pending_share';
    new.share_due := now() + interval '24 hours';
  else
    new.share_status := null;
    new.share_due := null;
  end if;
  new.post_url := null;
  new.share_submitted_at := null;
  return new;
end $$;

alter table public.applications drop constraint if exists applications_referred_by_fkey;
alter table public.applications
  add constraint applications_referred_by_fkey
  foreign key (referred_by) references public.applications (ref_code) on delete set null not valid;

alter table public.share_events drop constraint if exists share_events_ref_code_fkey;
alter table public.share_events
  add constraint share_events_ref_code_fkey
  foreign key (ref_code) references public.applications (ref_code) on delete cascade not valid;

-- share_events_one_per_step is partial (step <> 'friend_applied'); this serves per-code reads over time.
create index if not exists share_events_ref_code_at on public.share_events (ref_code, at);
