-- F26 funnel events (venn-site #235). No PII: step, result_id, at. Written only through portal_event(); read only through portal_funnel (service role / SQL editor).
create table public.portal_events (
  step text not null,
  result_id bigint not null references public.results (id) on delete cascade,
  at timestamptz not null default now(),
  primary key (result_id, step)
);
alter table public.portal_events enable row level security;
revoke all on public.portal_events from public, anon, authenticated;

create function public.portal_event(p_step text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare rid bigint;
begin
  if p_step is null or p_step not in ('link_opened','password_set','profile_saved','org_confirmed','phone_saved','mou_signed','parent_signed',
      'reveal_started','reveal_finished','share_tapped','share_done','linkedin_opened','next_steps_opened','mentor_compose_opened') then
    raise exception 'unknown step';
  end if;
  if auth.uid() is null then raise exception 'no session'; end if;
  select r.id into rid from public.results r
    where r.season = 'fall-2026' and r.status = 'approved' and r.application_id in (select public.portal_my_application_ids())
    order by r.id limit 1;
  if rid is null then return; end if;
  insert into public.portal_events (step, result_id) values (p_step, rid) on conflict do nothing;
end $$;
revoke all on function public.portal_event(text) from public, anon;
grant execute on function public.portal_event(text) to authenticated, service_role;

-- Drop-off per step and partner; pct is the share of that partner's link_opened (100 at link_opened).
create view public.portal_funnel with (security_invoker = on) as
with ev as (
  select e.step, e.result_id, coalesce(c.company, 'none') as partner
  from public.portal_events e
  join public.results r on r.id = e.result_id
  left join public.cohorts c on c.id = r.cohort_id
), base as (select partner, count(*) as n from ev where step = 'link_opened' group by partner)
select ev.step, ev.partner, count(*)::int as count, round(100.0 * count(*) / nullif(b.n, 0), 1) as pct
from ev left join base b using (partner)
group by ev.step, ev.partner, b.n
order by ev.partner, array_position(array['link_opened','password_set','profile_saved','org_confirmed','phone_saved','mou_signed','parent_signed',
  'reveal_started','reveal_finished','share_tapped','share_done','linkedin_opened','next_steps_opened','mentor_compose_opened'], ev.step);
revoke all on public.portal_funnel from public, anon, authenticated;
