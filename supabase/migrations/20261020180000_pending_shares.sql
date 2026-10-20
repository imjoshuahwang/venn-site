-- venn#329: one view of every student still owing a share, soonest void first, for Josh in the Supabase table editor.
-- furthest_step comes from v_share_progress (null = never opened /refer); friends = referrals that are not self or test.
-- Overdue rows the sweeper has not flipped yet stay out (they are void in every count).
create or replace view public.v_pending_shares with (security_invoker = on) as
select a.id, a.name, a.email, a.created_at, a.share_due,
  round(extract(epoch from a.share_due - now()) / 3600, 1) as hours_left,
  p.furthest_step,
  (select count(*) from public.referral_ledger l where l.referrer_id = a.id and l.status not in ('self', 'test')) as friends,
  a.confirmed_at is not null as confirmed, a.email_status, a.remind5_at, a.remind1_at
from public.applications a
join public.v_share_progress p on p.id = a.id
where a.share_status = 'pending_share' and a.share_due > now()
order by a.share_due, a.id;

revoke all on public.v_pending_shares from public, anon, authenticated;
