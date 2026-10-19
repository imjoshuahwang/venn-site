-- /refer friends step gets a Done button (venn-site #14). Done calls record_step(code, 'email'), which already
-- exists; referral_status now returns 'email' so the finished state survives a refresh or a new device.
-- The page no longer records 'email' when a link is merely sent, so the row means "tapped Done"
-- (older rows came from Email-a-friend taps and read as done too).
-- Copied from the latest definition (20261018020000_refer.sql); only the 'email' key is new.
create or replace function public.referral_status(code text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'first_name', split_part(trim(a.name), ' ', 1),
    'ref_code', a.ref_code,
    'linkedin', exists (select 1 from referral_steps s where s.application_id = a.id and s.kind = 'linkedin'),
    'linkedin_url', (select s.url from referral_steps s where s.application_id = a.id and s.kind = 'linkedin'),
    'email', exists (select 1 from referral_steps s where s.application_id = a.id and s.kind = 'email'),
    'referrals', (select count(*) from referral_ledger l where l.referrer_id = a.id and l.status = 'verified'),
    'pending', (select count(*) from referral_ledger l where l.referrer_id = a.id and l.status = 'unconfirmed'))
  from applications a where a.ref_code = lower(trim(code))
$$;

revoke all on function public.referral_status(text) from public;
grant execute on function public.referral_status(text) to anon, authenticated;
