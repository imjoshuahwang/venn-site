-- Referral red-team fixes. Additive and safe to re-run. Every code already emailed keeps working:
-- lookups are still by exact ref_code, only new codes get longer.
--
-- 1. New codes: 6 random chars instead of 4 (31^6 = 887M per first name, was 923k), so a share code
--    cannot be brute-forced through referral_status / record_step (venn#303).
-- 2. One person, one cap: a student who applies twice gets a second ref_code. Friends who use either code
--    now credit the person's first application (same email_key, same is_test), so re-applying no longer
--    opens a second 10-credit cap and /refer shows the same count under both codes.
-- 3. A friend whose confirmation email bounced or was marked spam (email_status, synced from Resend) is
--    'bounced', not verified: a made-up address no longer earns credit once the bounce is synced.
-- 4. referral_status no longer returns linkedin_url (the page never used it; anyone holding a share link
--    could read the referrer's LinkedIn post URL, which names them). record_step keeps the first saved URL:
--    a share-link holder can no longer replace it and clear verified_at (venn#303).

-- 1. Code generation.
create or replace function public.new_ref_code(full_name text) returns text
language plpgsql security definer set search_path = public as $$
declare
  base text := left(regexp_replace(lower(split_part(trim(coalesce(full_name, '')), ' ', 1)), '[^a-z]', '', 'g'), 12);
  alphabet text := 'abcdefghjkmnpqrstuvwxyz23456789';
  code text;
begin
  if base = '' then base := 'venn'; end if;
  loop
    code := base || '-' || (select string_agg(substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1), '')
                            from generate_series(1, 6));
    exit when not exists (select 1 from public.applications where ref_code = code);
  end loop;
  return code;
end $$;
revoke execute on function public.new_ref_code(text) from public, anon, authenticated;

-- 2 + 3. Ledger: referrer = the first application of the code holder's inbox; bounced friends rejected.
create or replace view public.referral_ledger with (security_invoker = on) as
select r.id as referrer_id, r.ref_code, a.id as applicant_id, a.created_at,
  case
    when a.email_key = r.email_key then 'self'
    when a.is_test or r.is_test then 'test'
    when a.role <> 'student' then 'not_student'
    when exists (select 1 from public.applications p where p.email_key = a.email_key and p.id < a.id) then 'duplicate'
    when split_part(a.email_key, '@', 2) in (select domain from public.disposable_domains) then 'disposable'
    when a.email_status is not null then 'bounced'
    when a.confirmed_at is null then 'unconfirmed'
    else 'verified'
  end as status
from public.applications a
join public.applications c on c.ref_code = a.referred_by
left join lateral (select p.id from public.applications p
                   where p.email_key = c.email_key and p.is_test = c.is_test order by p.id limit 1) k on true
join public.applications r on r.id = coalesce(k.id, c.id);

create or replace view public.referral_stats with (security_invoker = on) as
select r.id as referrer_id, r.ref_code, r.name, r.email,
  count(l.applicant_id) filter (where l.status = 'verified') as verified,
  count(l.applicant_id) filter (where l.status = 'unconfirmed') as pending,
  count(l.applicant_id) filter (where l.status in ('self', 'duplicate', 'disposable', 'not_student', 'bounced')) as rejected,
  least(count(l.applicant_id) filter (where l.status = 'verified'), 10) as credited,
  count(l.applicant_id) filter (where l.status = 'verified') > 10 as needs_review,
  exists (select 1 from public.referral_steps s where s.application_id = r.id and s.kind = 'linkedin') as linkedin_posted,
  exists (select 1 from public.referral_steps s where s.application_id = r.id and s.kind = 'linkedin' and s.verified_at is not null) as linkedin_verified
from public.applications r
left join public.referral_ledger l on l.referrer_id = r.id
where not r.is_test
group by r.id;

revoke all on public.referral_ledger, public.referral_stats from anon, authenticated;

-- 4. Site API. Counts come from the person's first application, so both of a re-applier's codes agree.
create or replace function public.referral_status(code text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'first_name', split_part(trim(a.name), ' ', 1),
    'ref_code', a.ref_code,
    'linkedin', exists (select 1 from referral_steps s where s.application_id = a.id and s.kind = 'linkedin'),
    'referrals', (select count(*) from referral_ledger l where l.referrer_id = coalesce(k.id, a.id) and l.status = 'verified'),
    'pending', (select count(*) from referral_ledger l where l.referrer_id = coalesce(k.id, a.id) and l.status = 'unconfirmed'))
  from applications a
  left join lateral (select p.id from applications p
                     where p.email_key = a.email_key and p.is_test = a.is_test order by p.id limit 1) k on true
  where a.ref_code = lower(trim(code))
$$;

create or replace function public.record_step(code text, kind text, url text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare app_id bigint; clean text := nullif(trim(coalesce(url, '')), '');
begin
  select id into app_id from applications where ref_code = lower(trim(code));
  if app_id is null then raise exception 'unknown code'; end if;
  if kind is null or kind not in ('linkedin', 'email') then raise exception 'unknown kind'; end if;
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

revoke all on function public.referral_status(text), public.record_step(text, text, text) from public;
grant execute on function public.referral_status(text), public.record_step(text, text, text) to anon, authenticated;
