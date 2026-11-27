-- #192: the results E2E test applicants imjoshuahwang+<slug>@gmail.com must stay distinct portal accounts, or every journey
-- resolves to the same application. Same exception as #118: email_key keeps the +tag for exactly this pattern, nothing else changes.
create or replace function public.email_key(e text) returns text language sql immutable as $$
  with p as (select split_part(lower(trim(e)), '@', 1) as u, split_part(lower(trim(e)), '@', 2) as d)
  select case
    when lower(trim(e)) ~ '^contact\+portal-[a-z0-9-]+@joinvenn\.org$' then lower(trim(e))
    when lower(trim(e)) ~ '^imjoshuahwang\+(aws|quadron|peer|peer2|nts)@gmail\.com$' then lower(trim(e))
    when d in ('gmail.com', 'googlemail.com')
      then replace(split_part(u, '+', 1), '.', '') || '@gmail.com'
    else split_part(u, '+', 1) || '@' || d end
  from p
$$;

update public.applications set email_key = public.email_key(email)
  where lower(trim(email)) ~ '^imjoshuahwang\+(aws|quadron|peer|peer2|nts)@gmail\.com$'
    and email_key is distinct from public.email_key(email);
