-- Portal team RPCs (venn-site #129, epic #112). Additive: new functions only. Lead = confirmed applicant of an approved result.
-- security definer, search_path = '', authenticated-only. Invite mail is sent by the server, not here (test addresses only during the build).

create function public.add_team_member(p_email text) returns public.team_members
language plpgsql security definer set search_path = '' as $$
declare rid bigint; m public.team_members;
begin
  select r.id into rid from public.results r
   where r.status = 'approved' and public.portal_is_lead(r.id) order by r.id limit 1;
  if rid is null then raise exception 'not the lead' using errcode = '42501'; end if;
  if p_email is null or p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(p_email) > 254 then
    raise exception 'invalid email' using errcode = '23514';
  end if;
  -- the cap trigger raises 23514 on a 4th live member; the unique index raises 23505 on a duplicate. Either way nothing is written.
  insert into public.team_members (lead_result_id, email_key) values (rid, p_email) returning * into m;
  return m;
end $$;

create function public.remove_team_member(p_member_id bigint) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare v timestamptz;
begin
  update public.team_members t set removed_at = now()
   where t.id = p_member_id and t.removed_at is null and public.portal_is_lead(t.lead_result_id)
   returning t.removed_at into v;
  if v is null then raise exception 'team member not found' using errcode = '42501'; end if;
  return v;
end $$;

-- Team of the caller's result (lead or live member). A lead with no members still gets one row with a null member_id, so lead_is_me never depends on member rows. State: invited, signed in, consented, waiting on parent.
create function public.get_my_team()
returns table (member_id bigint, email text, state text, is_me boolean, lead_is_me boolean)
language sql stable security definer set search_path = '' as $$
  with mine as (
    select r.id from public.results r where r.status = 'approved' and public.portal_owns_result(r.id) order by r.id limit 1
  ), tm as (
    select t.id, t.email_key, coalesce(t.user_id, (select u.id from auth.users u
             where public.email_key(u.email) = t.email_key and u.email_confirmed_at is not null limit 1)) as uid
    from public.team_members t join mine on t.lead_result_id = mine.id where t.removed_at is null
  )
  select tm.id, tm.email_key,
    case when tm.uid is null then 'invited'
         when exists (select 1 from public.parent_consents p where p.user_id = tm.uid and p.signed_at is null) then 'waiting on parent'
         when exists (select 1 from public.consents c where c.user_id = tm.uid and c.accepted) then 'consented'
         else 'signed in' end,
    tm.email_key = public.email_key(auth.jwt() ->> 'email'),
    public.portal_is_lead(mine.id)
  from mine left join tm on true order by tm.id
$$;

revoke execute on function public.add_team_member(text), public.remove_team_member(bigint), public.get_my_team() from public, anon;
grant execute on function public.add_team_member(text), public.remove_team_member(bigint), public.get_my_team() to authenticated, service_role;
