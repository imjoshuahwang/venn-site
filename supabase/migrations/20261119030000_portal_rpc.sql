-- Portal RPCs (venn-site #116, epic #112). Additive: new functions only. Depends on #113 and #126 (hence the 1119 timestamp).
-- All security definer, search_path = '' (everything schema-qualified), approved results only, authenticated-only execute.
-- Ownership: portal_owns_result (applicant or live team member) for reads; the lead (applicant) only for peer_down, sign_mou, finish_ceremony.

-- Lead = the confirmed applicant of an approved result (team members are not leads).
create function public.portal_is_lead(p_result_id bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.results r
    where r.id = p_result_id and r.status = 'approved'
      and r.application_id in (select public.portal_my_application_ids())
  )
$$;

create function public.mark_viewed(p_result_id bigint) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare v timestamptz;
begin
  if not public.portal_owns_result(p_result_id) then
    raise exception 'result not found' using errcode = '42501';
  end if;
  update public.results set viewed_at = coalesce(viewed_at, now()) where id = p_result_id returning viewed_at into v;
  return v;
end $$;

create function public.finish_ceremony(p_result_id bigint) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare v timestamptz;
begin
  if not public.portal_is_lead(p_result_id) then
    raise exception 'result not found' using errcode = '42501';
  end if;
  update public.results set ceremony_done_at = coalesce(ceremony_done_at, now()) where id = p_result_id returning ceremony_done_at into v;
  return v;
end $$;

-- Peer card. Zero rows when the caller has no approved peer match (or the partner side is not approved).
-- Before both tapped: first name, org, one-line project, why-you-two only. After: full name and partner_email.
create function public.get_my_peer(p_season text default 'fall-2026')
returns table (match_id bigint, partner_name text, partner_org text, partner_project text, why_matched text,
               i_am_down boolean, they_are_down boolean, partner_email text)
language sql stable security definer set search_path = '' as $$
  with mine as (
    select m.id, m.why_matched,
           case when m.result_a = r.id then m.result_b else m.result_a end as partner_result,
           case when m.result_a = r.id then m.a_down_at else m.b_down_at end as my_down,
           case when m.result_a = r.id then m.b_down_at else m.a_down_at end as their_down
    from public.results r
    join public.peer_matches m on r.id in (m.result_a, m.result_b)
    where r.season = p_season and r.status = 'approved' and public.portal_owns_result(r.id)
    limit 1
  )
  select mine.id,
         case when mine.my_down is not null and mine.their_down is not null then a.name else split_part(btrim(a.name), ' ', 1) end,
         a.org,
         left(split_part(btrim(a.working_on), E'\n', 1), 160),
         mine.why_matched,
         mine.my_down is not null,
         mine.their_down is not null,
         case when mine.my_down is not null and mine.their_down is not null then a.email end
  from mine
  join public.results pr on pr.id = mine.partner_result and pr.status = 'approved'
  join public.applications a on a.id = pr.application_id
$$;

create function public.peer_down(p_match_id bigint)
returns table (match_id bigint, partner_name text, partner_org text, partner_project text, why_matched text,
               i_am_down boolean, they_are_down boolean, partner_email text)
language plpgsql security definer set search_path = '' as $$
declare m public.peer_matches%rowtype;
begin
  select * into m from public.peer_matches where id = p_match_id;
  if not found
     or not (public.portal_is_lead(m.result_a) or public.portal_is_lead(m.result_b))
     or not exists (select 1 from public.results r where r.id = m.result_a and r.status = 'approved')
     or not exists (select 1 from public.results r where r.id = m.result_b and r.status = 'approved') then
    raise exception 'peer match not found' using errcode = '42501';
  end if;
  if public.portal_is_lead(m.result_a) then
    update public.peer_matches set a_down_at = coalesce(a_down_at, now()) where id = m.id;
  else
    update public.peer_matches set b_down_at = coalesce(b_down_at, now()) where id = m.id;
  end if;
  return query select g.* from public.get_my_peer(m.season) g where g.match_id = m.id;
end $$;

-- One signature per result, Cohort outcome only. user_id and cohort_id never come from the client.
-- Seats: each signed result takes 1 + its live team members; the cohort's seat_cap is a hard stop (all-or-none for a team).
create function public.sign_mou(p_result_id bigint, p_typed_name text, p_agreed boolean)
returns public.mou_signatures
language plpgsql security definer set search_path = '' as $$
declare r public.results%rowtype; c public.cohorts%rowtype; v_name text := btrim(coalesce(p_typed_name, ''));
        need int; used int; sig public.mou_signatures;
begin
  if not public.portal_is_lead(p_result_id) then
    raise exception 'result not found' using errcode = '42501';
  end if;
  select * into r from public.results where id = p_result_id;
  if r.outcome <> 'cohort' or r.cohort_id is null then
    raise exception 'only a cohort result can sign the MOU' using errcode = '22023';
  end if;
  if v_name = '' then raise exception 'typed name is required' using errcode = '22023'; end if;
  if p_agreed is distinct from true then raise exception 'you must agree to sign' using errcode = '22023'; end if;
  select * into c from public.cohorts where id = r.cohort_id for update;  -- serializes seat counting per cohort
  if exists (select 1 from public.mou_signatures where result_id = r.id) then
    raise exception 'already signed' using errcode = '23505';
  end if;
  select 1 + count(*) into need from public.team_members t where t.lead_result_id = r.id and t.removed_at is null;
  select coalesce(sum(1 + (select count(*) from public.team_members t where t.lead_result_id = s.result_id and t.removed_at is null)), 0)
    into used from public.mou_signatures s where s.cohort_id = c.id;
  if used + need > c.seat_cap then
    raise exception 'cohort is full' using errcode = '53400';
  end if;
  insert into public.mou_signatures (result_id, cohort_id, typed_name, agreed, user_id)
    values (r.id, c.id, v_name, true, auth.uid()) returning * into sig;
  return sig;
end $$;

revoke execute on function public.portal_is_lead(bigint), public.mark_viewed(bigint), public.finish_ceremony(bigint),
  public.get_my_peer(text), public.peer_down(bigint), public.sign_mou(bigint, text, boolean) from public, anon;
grant execute on function public.portal_is_lead(bigint), public.mark_viewed(bigint), public.finish_ceremony(bigint),
  public.get_my_peer(text), public.peer_down(bigint), public.sign_mou(bigint, text, boolean) to authenticated;
