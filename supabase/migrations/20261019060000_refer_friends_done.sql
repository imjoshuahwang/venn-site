-- /refer friends step gets a Done button (venn-site #14). Done calls record_step(code, 'email'), which already
-- exists; referral_status now returns 'email' so the finished state survives a refresh or a new device.
-- The page no longer records 'email' when a link is merely sent, so the row means "tapped Done"
-- (older rows came from Email-a-friend taps and read as done too).
-- Copied from the latest definition (20261019030000_referral_redteam.sql: counts from the first application,
-- no linkedin_url); only the 'email' key is new.
create or replace function public.referral_status(code text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'first_name', split_part(trim(a.name), ' ', 1),
    'ref_code', a.ref_code,
    'linkedin', exists (select 1 from referral_steps s where s.application_id = a.id and s.kind = 'linkedin'),
    'email', exists (select 1 from referral_steps s where s.application_id = a.id and s.kind = 'email'),
    'referrals', (select count(*) from referral_ledger l where l.referrer_id = coalesce(k.id, a.id) and l.status = 'verified'),
    'pending', (select count(*) from referral_ledger l where l.referrer_id = coalesce(k.id, a.id) and l.status = 'unconfirmed'))
  from applications a
  left join lateral (select p.id from applications p
                     where p.email_key = a.email_key and p.is_test = a.is_test order by p.id limit 1) k on true
  where a.ref_code = lower(trim(code))
$$;

revoke all on function public.referral_status(text) from public;
grant execute on function public.referral_status(text) to anon, authenticated;
