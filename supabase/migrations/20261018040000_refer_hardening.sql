-- Refer hardening (venn#254), from review. The site only writes through security-definer
-- submit_application, so anon needs no direct table access at all.
-- Safe to re-run.

-- 1. No direct table access for the public roles (RLS has no other policy, so reads were already empty).
drop policy if exists "anon can apply" on public.applications;
revoke all on public.applications from anon, authenticated;

-- 2. A caller (or any insert path) cannot choose confirmed_at, status, or is_test. is_test is null-safe.
create or replace function public.applications_before_insert() returns trigger language plpgsql as $$
begin
  new.email_key := public.email_key(new.email);
  new.referred_by := nullif(lower(trim(new.referred_by)), '');
  if new.ref_code is null then new.ref_code := public.new_ref_code(new.name); end if;
  new.confirmed_at := null;
  new.status := 'new';
  new.is_test := coalesce(new.source = 'test', false)
    or coalesce(split_part(lower(new.email), '@', 1) like '%+test%', false)
    or coalesce(new.ref_code = 'minji-wzmf', false);
  return new;
end $$;

-- 3. Internal helpers: only the trigger / security-definer functions (owner postgres) call them.
revoke execute on function public.new_ref_code(text), public.email_key(text) from public, anon, authenticated;
