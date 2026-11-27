-- Check for 20261128180000_match_invitee.sql (venn-site #307): the asked student reads and answers. LOCAL db only; rolls back.
begin;
create function pg_temp.as_user(uid uuid, mail text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated', 'email', mail)::text, true);
$$;
grant execute on function pg_temp.as_user(uuid, text) to public;
create function pg_temp.fails(sql text, code text) returns boolean language plpgsql as $$
begin execute sql; return false; exception when others then return sqlstate = code; end $$;
grant execute on function pg_temp.fails(text, text) to public;

do $$
declare
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); uc uuid := gen_random_uuid();
  aa bigint; ab bigint; ac bigint; ra bigint; rb bigint; rc bigint; m1 bigint; g record; o text; f text;
  good text := 'I build solar kiosks for schools and would love to compare notes on how you ship with a small team.';
begin
  insert into auth.users (id, email, email_confirmed_at) values (ua, 'ava@example.com', now()), (ub, 'ben@example.com', now()), (uc, 'cal@example.com', now());
  insert into public.applications (role, level, name, email, org, working_on, state, country, source) values ('student', 'high_school', 'Ava Lee', 'ava@example.com', 'Alpha HS', 'Solar kiosks', 'Ohio', 'US', '/apply') returning id into aa;
  insert into public.applications (role, level, name, email, org, working_on, state, country, source) values ('student', 'high_school', 'Ben Chan', 'ben@example.com', 'Beta HS', 'Tutoring app', 'Texas', 'US', '/apply') returning id into ab;
  insert into public.applications (role, level, name, email, org, working_on, source) values ('student', 'high_school', 'Cal Park', 'cal@example.com', 'Gamma HS', 'Robots', '/apply') returning id into ac;
  insert into public.results (application_id, outcome, status, phone) values (aa, 'peer', 'approved', '+14155550101') returning id into ra;
  insert into public.results (application_id, outcome, status, phone) values (ab, 'peer', 'approved', '+14155550102') returning id into rb;
  insert into public.results (application_id, outcome, status) values (ac, 'peer', 'approved') returning id into rc;
  insert into public.match_pool (result_id) values (rb), (ra), (rc);
  insert into public.matches (requester_result_id, peer_result_id, status, fit, draft_message) values (ra, rb, 'approved', '{"you_do":"a","they_do":"b","together":["a","b"],"common":["x"],"ask":"q"}', 'Hi') returning id into m1;

  foreach f in array array['public.match_answer(bigint,text)', 'public.get_my_incoming(text)'] loop
    if has_function_privilege('anon', f, 'execute') or has_function_privilege('public', f, 'execute') or not has_function_privilege('authenticated', f, 'execute') then raise exception 'grants wrong for %', f; end if;
  end loop;
  foreach f in array array['public.match_answer_core(bigint,text)'] loop
    if has_function_privilege('anon', f, 'execute') or has_function_privilege('authenticated', f, 'execute') then raise exception 'core callable by clients'; end if;
  end loop;

  -- before the ask is sent the invitee sees nothing
  set local role authenticated; perform pg_temp.as_user(ub, 'ben@example.com');
  if exists (select 1 from public.get_my_incoming()) then raise exception 'invitee saw an unsent ask'; end if;
  perform pg_temp.as_user(ua, 'ava@example.com'); perform public.match_request(m1, good);

  -- the invitee sees who asked and what was said, first name only, no contact
  perform pg_temp.as_user(ub, 'ben@example.com');
  select * into g from public.get_my_incoming();
  if g.match_id <> m1 or g.state <> 'requested' or g.requester_first_name <> 'Ava' or g.requester_org <> 'Alpha HS' or g.requester_region <> 'Ohio, US'
     or g.message <> good or g.own_region <> 'Texas, US' then raise exception 'incoming view wrong'; end if;
  -- a stranger and the asker cannot answer or read it
  perform pg_temp.as_user(uc, 'cal@example.com');
  if exists (select 1 from public.get_my_incoming()) then raise exception 'stranger saw the ask'; end if;
  if not pg_temp.fails(format('select public.match_answer(%s, ''accept'')', m1), '42501') then raise exception 'stranger answered'; end if;
  perform pg_temp.as_user(ua, 'ava@example.com');
  if not pg_temp.fails(format('select public.match_answer(%s, ''accept'')', m1), '42501') then raise exception 'asker answered own ask'; end if;
  if exists (select 1 from public.get_my_incoming()) then raise exception 'asker saw an incoming'; end if;
  perform pg_temp.as_user(ub, 'ben@example.com');
  if not pg_temp.fails(format('select public.match_answer(%s, ''report'')', m1), '22023') then raise exception 'report via session allowed'; end if;
  if not pg_temp.fails(format('select public.match_answer(%s, null)', m1), '22023') then raise exception 'null action allowed'; end if;

  -- accept: outcome word only, state accepted, single use, intro owed to the sweep
  o := public.match_answer(m1, 'accept');
  if o <> 'accepted' then raise exception 'accept failed'; end if;
  if public.match_answer(m1, 'decline') <> 'accepted' then raise exception 'decline after accept changed state'; end if;
  select * into g from public.get_my_incoming();
  if g.state <> 'accepted' or g.requester_first_name is not null or g.message is not null then raise exception 'answered view leaks detail'; end if;
  reset role;
  if (select status from public.matches where id = m1) <> 'accepted' then raise exception 'status not accepted'; end if;
  if (select count(*) from public.match_events where match_id = m1 and type = 'accepted' and actor = 'peer') <> 1 then raise exception 'accept audit wrong'; end if;
  if not exists (select 1 from public.match_sweep() where match_id = m1 and action = 'intro') then raise exception 'sweep will not send the intro'; end if;

  -- decline path and expiry on a fresh pair
  update public.matches set status = 'declined' where id = m1;
  update public.matches set status = 'approved', responded_at = null where id = m1;
  set local role authenticated; perform pg_temp.as_user(ua, 'ava@example.com'); perform public.match_request(m1, good);
  perform pg_temp.as_user(ub, 'ben@example.com');
  if public.match_answer(m1, 'decline') <> 'declined' then raise exception 'decline failed'; end if;
  reset role;
  if (select status from public.matches where id = m1) <> 'declined' then raise exception 'status not declined'; end if;
  update public.matches set status = 'requested', responded_at = null, expires_at = now() - interval '1 minute' where id = m1;
  set local role authenticated; perform pg_temp.as_user(ub, 'ben@example.com');
  select * into g from public.get_my_incoming();
  if g.state <> 'expired' or g.message is not null then raise exception 'expired view wrong'; end if;
  if public.match_answer(m1, 'accept') <> 'expired' then raise exception 'accepted an expired ask'; end if;
  reset role;
end $$;

rollback;
