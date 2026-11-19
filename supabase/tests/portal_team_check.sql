-- Team RPC check for 20261122000000_portal_team_rpc.sql (venn-site #129). LOCAL db only; all rolls back.
begin;
create function pg_temp.as_user(uid uuid, em text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'email', em, 'role', 'authenticated')::text, true);
$$;
grant execute on function pg_temp.as_user(uuid, text) to public;
do $$
declare
  ul uuid := gen_random_uuid(); um uuid := gen_random_uuid(); ux uuid := gen_random_uuid();
  al bigint; ax bigint; rl bigint; rx bigint; m1 public.team_members; m2 public.team_members; m3 public.team_members;
  n int; ok boolean; st text; mid bigint;
begin
  insert into auth.users (id, email, email_confirmed_at) values
    (ul, 'lead@example.com', now()), (um, 'm1@example.com', now()), (ux, 'x@example.com', now());
  insert into public.applications (role, name, email, working_on, source) values ('student', 'Lead', 'lead@example.com', 'x', '/apply') returning id into al;
  insert into public.applications (role, name, email, working_on, source) values ('student', 'Ex', 'x@example.com', 'x', '/apply') returning id into ax;
  insert into public.results (application_id, outcome, status) values (al, 'cohort', 'approved') returning id into rl;
  insert into public.results (application_id, outcome, status) values (ax, 'cohort', 'approved') returning id into rx;
  perform set_config('role', 'authenticated', true);

  -- anon/public cannot execute
  if has_function_privilege('anon', 'public.add_team_member(text)', 'execute')
     or has_function_privilege('anon', 'public.remove_team_member(bigint)', 'execute')
     or has_function_privilege('anon', 'public.get_my_team()', 'execute') then raise exception 'anon can execute a team RPC'; end if;

  perform pg_temp.as_user(ul, 'lead@example.com');
  m1 := public.add_team_member('m1@example.com');
  m2 := public.add_team_member('m2@example.com');
  m3 := public.add_team_member('m3@example.com');
  -- 4th refused, and nothing is written
  begin perform public.add_team_member('m4@example.com'); raise exception 'fourth member was accepted';
  exception when check_violation then null; end;
  select count(*) into n from public.team_members where lead_result_id = rl and removed_at is null;
  if n <> 3 then raise exception 'expected 3 live members, got %', n; end if;
  -- duplicate email refused
  begin perform public.add_team_member('M1@example.com'); raise exception 'duplicate accepted';
  exception when unique_violation or check_violation then null; end;
  -- bad email refused
  begin perform public.add_team_member('not an email'); raise exception 'bad email accepted';
  exception when check_violation then null; end;

  -- state words: m1 invited until it has a confirmed auth user
  select state into st from public.get_my_team() where member_id = m1.id;
  if st <> 'signed in' then raise exception 'm1 should be signed in, got %', st; end if;
  select state into st from public.get_my_team() where member_id = m2.id;
  if st <> 'invited' then raise exception 'm2 should be invited, got %', st; end if;

  -- a non-lead (live member) cannot add or remove
  perform pg_temp.as_user(um, 'm1@example.com');
  begin perform public.add_team_member('m9@example.com'); raise exception 'member added';
  exception when insufficient_privilege then null; end;
  begin perform public.remove_team_member(m2.id); raise exception 'member removed';
  exception when insufficient_privilege then null; end;
  -- but a member sees the team and the lead's result
  select count(*) into n from public.get_my_team();
  if n <> 3 then raise exception 'member should see 3 rows, saw %', n; end if;
  select count(*) into n from public.results where id = rl;
  if n <> 1 then raise exception 'member cannot read lead result'; end if;
  -- an unrelated lead cannot remove someone else's member
  perform pg_temp.as_user(ux, 'x@example.com');
  begin perform public.remove_team_member(m1.id); raise exception 'stranger removed';
  exception when insufficient_privilege then null; end;

  -- lead removes m1: soft, and m1 loses access on the next request
  perform pg_temp.as_user(ul, 'lead@example.com');
  perform public.remove_team_member(m1.id);
  select count(*) into n from public.team_members where id = m1.id and removed_at is not null;
  if n <> 1 then raise exception 'soft remove did not set removed_at'; end if;
  perform pg_temp.as_user(um, 'm1@example.com');
  select count(*) into n from public.results where id = rl;
  if n <> 0 then raise exception 'removed member still reads result'; end if;
  select count(*) into n from public.get_my_team();
  if n <> 0 then raise exception 'removed member still sees team'; end if;
  -- a seat is free again
  perform pg_temp.as_user(ul, 'lead@example.com');
  perform public.add_team_member('m5@example.com');
end $$;
rollback;
