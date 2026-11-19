-- #118: portal test addresses contact+portal-<slug>@joinvenn.org must stay distinct inboxes, so email_key keeps
-- the +tag for exactly that pattern. Everything else is unchanged (tags and gmail dots still stripped).
create or replace function public.email_key(e text) returns text language sql immutable as $$
  with p as (select split_part(lower(trim(e)), '@', 1) as u, split_part(lower(trim(e)), '@', 2) as d)
  select case
    when lower(trim(e)) ~ '^contact\+portal-[a-z0-9-]+@joinvenn\.org$' then lower(trim(e))
    when d in ('gmail.com', 'googlemail.com')
      then replace(split_part(u, '+', 1), '.', '') || '@gmail.com'
    else split_part(u, '+', 1) || '@' || d end
  from p
$$;

-- Re-key only rows matching the test pattern (no deletes).
update public.applications set email_key = public.email_key(email)
  where lower(trim(email)) ~ '^contact\+portal-[a-z0-9-]+@joinvenn\.org$'
    and email_key is distinct from public.email_key(email);
