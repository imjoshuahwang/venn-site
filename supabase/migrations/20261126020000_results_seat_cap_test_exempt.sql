-- The live results_seat_cap trigger was applied by hand and never committed; this brings it into the repo.
-- is_test applications (the fictional E2E applicants, #192) neither hit the cap nor count toward it.
create or replace function public.results_seat_cap() returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare n int; cap int;
begin
  if new.cohort_id is null then return new; end if;
  if tg_op = 'UPDATE' and new.cohort_id is not distinct from old.cohort_id then return new; end if;
  if exists (select 1 from public.applications a where a.id = new.application_id and a.is_test) then return new; end if;
  perform pg_advisory_xact_lock(hashtext('results_seat_cap'), new.cohort_id::int);
  select seat_cap into cap from public.cohorts where id = new.cohort_id;
  select count(*) into n from public.results r join public.applications a on a.id = r.application_id
    where r.cohort_id = new.cohort_id and r.id is distinct from new.id and not a.is_test;
  if n >= cap then raise exception 'cohort % is full (% seats)', new.cohort_id, cap using errcode = '23514'; end if;
  return new;
end $function$;
