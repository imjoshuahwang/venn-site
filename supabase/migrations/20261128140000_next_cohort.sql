-- Rejected journey (venn-site #279): one tap to be considered for the next cohort, from a no-account link in the results mail.
-- The link token is random and only its sha-256 hex is stored. Both functions are service-role only (the page runs server side),
-- so anon and authenticated never touch the table. Only a not_this_season Result can hold a token.
alter table public.results
  add column next_token_hash text unique check (next_token_hash ~ '^[0-9a-f]{64}$'),
  add column next_token_expires_at timestamptz,
  add column next_opt_in_at timestamptz,
  add constraint results_next_token_outcome check (next_token_hash is null or outcome = 'not_this_season');

-- GET side, read only. state is open, done, expired or unknown; first_name only while the link is usable or already used.
-- A tapped link stays "done" after it expires, so a second visit is never an error.
create function public.next_cohort_by_token(p_token_hash text)
returns table (state text, first_name text)
language sql stable security definer set search_path = '' as $$
  select case when r.id is null then 'unknown'
              when r.next_opt_in_at is not null then 'done'
              when r.next_token_expires_at <= now() then 'expired'
              else 'open' end,
         case when r.id is not null and (r.next_opt_in_at is not null or r.next_token_expires_at > now())
              then nullif(split_part(btrim(a.name), ' ', 1), '') end
  from (select 1) one
  left join public.results r on r.next_token_hash = p_token_hash and p_token_hash is not null and r.outcome = 'not_this_season' and r.status = 'approved'
  left join public.applications a on a.id = r.application_id
$$;

-- POST side. One row lock, so a double tap resolves once; the second call gets done and changes nothing.
create function public.next_cohort_opt_in(p_token_hash text)
returns table (state text, first_name text)
language plpgsql security definer set search_path = '' as $$
declare r public.results; nm text;
begin
  select * into r from public.results
    where next_token_hash = p_token_hash and p_token_hash is not null and outcome = 'not_this_season' and status = 'approved' for update;
  if r.id is null then state := 'unknown'; return next; return; end if;
  select nullif(split_part(btrim(a.name), ' ', 1), '') into nm from public.applications a where a.id = r.application_id;
  if r.next_opt_in_at is null then
    if r.next_token_expires_at <= now() then state := 'expired'; return next; return; end if;
    update public.results set next_opt_in_at = now() where id = r.id;
  end if;
  state := 'done'; first_name := nm; return next;
end $$;

revoke all on function public.next_cohort_by_token(text), public.next_cohort_opt_in(text) from public, anon, authenticated;
grant execute on function public.next_cohort_by_token(text), public.next_cohort_opt_in(text) to service_role;
