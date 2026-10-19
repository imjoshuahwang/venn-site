-- referral_status returns role so /refer can show the org/club state (no share step) (venn#329).
create or replace function public.referral_status(code text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'first_name', split_part(trim(a.name), ' ', 1),
    'ref_code', a.ref_code,
    'linkedin', exists (select 1 from referral_steps s where s.application_id = a.id and s.kind = 'linkedin'),
    'email', exists (select 1 from referral_steps s where s.application_id = a.id and s.kind = 'email'),
    'referrals', (select count(*) from referral_ledger l where l.referrer_id = coalesce(k.id, a.id) and l.status = 'verified'),
    'pending', (select count(*) from referral_ledger l where l.referrer_id = coalesce(k.id, a.id) and l.status = 'unconfirmed'),
    'share_status', case when a.share_status = 'pending_share' and now() > a.share_due then 'void' else a.share_status end,
    'share_due', a.share_due,
    'friends_submitted', (select count(*) from referral_ledger l
                          where l.referrer_id = coalesce(k.id, a.id) and l.status = 'verified'
                            and (a.share_due is null or l.created_at <= a.share_due)),
    'post_url_saved', a.post_url is not null,
    'role', a.role)
  from applications a
  left join lateral (select p.id from applications p
                     where p.email_key = a.email_key and p.is_test = a.is_test order by p.id limit 1) k on true
  where a.page_token = lower(trim(code))
$$;
