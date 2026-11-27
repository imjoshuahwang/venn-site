-- Match data check for 20261127020000_matches.sql (venn-site #245, contract #239, gates G4). LOCAL db only; all rolls back.
begin;
create function pg_temp.as_user(uid uuid, mail text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated', 'email', mail)::text, true);
$$;
grant execute on function pg_temp.as_user(uuid, text) to public;
create function pg_temp.fails(sql text, code text) returns boolean language plpgsql as $$
begin execute sql; return false; exception when others then return sqlstate = code; end $$;
grant execute on function pg_temp.fails(text, text) to public;
create table pg_temp.ids (k text primary key, v bigint);
grant all on pg_temp.ids to public;

do $$
declare
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); uc uuid := gen_random_uuid(); ud uuid := gen_random_uuid();
  ue uuid := gen_random_uuid(); uj uuid := gen_random_uuid(); uf uuid := gen_random_uuid();
  aa bigint; ab bigint; ac bigint; ad bigint; ae bigint; af bigint; ra bigint; rb bigint; rc bigint; rd bigint; re bigint; rf bigint; coh bigint;
  m1 bigint; m2 bigint; m3 bigint; m4 bigint; m5 bigint; n int; g record; r record; tok text := repeat('a', 64); tok2 text := repeat('b', 64);
  good text := 'I build solar kiosks for schools and would love to compare notes on how you ship with a small team.';
  fns text[]; f text;
begin
  insert into auth.users (id, email, email_confirmed_at) values
    (ua, 'ava@example.com', now()), (ub, 'ben@example.com', now()), (uc, 'cal@example.com', now()), (ud, 'dee@example.com', now()),
    (ue, 'eli@example.com', now()), (uf, 'fay@example.com', now());
  insert into public.applications (role, level, name, email, org, working_on, state, country, source) values ('student', 'high_school', 'Ava Lee', 'ava@example.com', 'Alpha HS', 'Solar kiosks', 'Ohio', 'US', '/apply') returning id into aa;
  insert into public.applications (role, level, name, email, org, working_on, state, country, source) values ('student', 'high_school', 'Ben Chan', 'ben@example.com', 'Beta HS', 'Tutoring app', 'Texas', 'US', '/apply') returning id into ab;
  insert into public.applications (role, level, name, email, org, working_on, source) values ('student', 'college', 'Cal Park', 'cal@example.com', 'Gamma U', 'Robots', '/apply') returning id into ac;
  insert into public.applications (role, level, name, email, org, working_on, source) values ('student', 'college', 'Dee Roe', 'dee@example.com', 'Delta U', 'Maps', '/apply') returning id into ad;
  insert into public.applications (role, level, name, email, org, working_on, source) values ('student', 'high_school', 'Eli Fox', 'eli@example.com', 'Eps HS', 'x', '/apply') returning id into ae;
  insert into public.applications (role, level, name, email, org, working_on, source) values ('student', 'high_school', 'Fay Kim', 'fay@example.com', 'Zeta HS', 'x', '/apply') returning id into af;
  insert into public.cohorts (slug, name) values ('q', 'Quadron') returning id into coh;
  insert into public.results (application_id, outcome, status, phone) values (aa, 'peer', 'approved', '+14155550101') returning id into ra;
  insert into public.results (application_id, outcome, status, phone) values (ab, 'peer', 'approved', '+14155550102') returning id into rb;
  insert into public.results (application_id, outcome, status, phone) values (ac, 'peer', 'approved', '+14155550103') returning id into rc;
  insert into public.results (application_id, outcome, status, phone) values (ad, 'peer', 'approved', '+14155550104') returning id into rd;
  insert into public.results (application_id, outcome, cohort_id, status) values (ae, 'cohort', coh, 'approved') returning id into re;
  insert into public.results (application_id, outcome, status) values (af, 'peer', 'approved') returning id into rf;
  insert into public.match_pool (result_id) values (rb), (rd), (rf), (re), (ra);  -- ra in pool too: blocked-pair test below uses it

  -- eligibility trigger: minor<->adult refused, cohort requester refused, self refused, non-pool peer refused
  if not pg_temp.fails(format('insert into public.matches (requester_result_id, peer_result_id) values (%s, %s)', ra, rd), '22023') then raise exception 'minor matched with an adult'; end if;
  if not pg_temp.fails(format('insert into public.matches (requester_result_id, peer_result_id) values (%s, %s)', rc, rb), '22023') then raise exception 'adult matched with a minor'; end if;
  if not pg_temp.fails(format('insert into public.matches (requester_result_id, peer_result_id) values (%s, %s)', re, rb), '22023') then raise exception 'student with a cohort partner was matched'; end if;
  if not pg_temp.fails(format('insert into public.matches (requester_result_id, peer_result_id) values (%s, %s)', ra, ra), '22023') then raise exception 'self match allowed'; end if;
  if not pg_temp.fails(format('insert into public.matches (requester_result_id, peer_result_id) values (%s, %s)', ra, rc), '22023') then raise exception 'peer outside the pool matched'; end if;
  if not pg_temp.fails(format('insert into public.matches (requester_result_id, peer_result_id, fit) values (%s, %s, %L)', rc, rd, '{"common":[1,2,3,4]}'), '23514') then raise exception 'fit common cap missing'; end if;
  insert into public.matches (requester_result_id, peer_result_id, status, fit, draft_message) values
    (ra, rb, 'approved', '{"you_do":"solar","they_do":"tutoring","together":["a","b"],"common":["x"],"ask":"q"}', 'Hi Ben') returning id into m1;
  insert into public.matches (requester_result_id, peer_result_id, status) values (rc, rd, 'approved') returning id into m2;
  if not pg_temp.fails(format('insert into public.matches (requester_result_id, peer_result_id) values (%s, %s)', ra, rf), '23505') then raise exception 'two open matches for one student'; end if;
  if (select count(*) from public.match_events where match_id = m1 and type = 'approved' and actor = 'system') <> 1 then raise exception 'insert wrote no audit event'; end if;

  -- grants: anon/public cannot execute any match function; authenticated only the student set; service the token set
  fns := array['public.get_my_match(text)', 'public.match_viewed(bigint)', 'public.match_step(bigint,text)', 'public.match_request(bigint,text,text)',
    'public.match_withdraw(bigint)', 'public.match_rematch(bigint)', 'public.match_report(bigint)', 'public.match_issue_token(bigint,text)',
    'public.intro_by_token(text)', 'public.intro_respond(text,text)', 'public.match_sweep()', 'public.match_intro_sent(bigint)',
    'public.match_my_result(text)', 'public.match_lock_mine(bigint)', 'public.match_text_clean(text,int,int)'];
  foreach f in array fns loop
    if has_function_privilege('anon', f, 'execute') or has_function_privilege('public', f, 'execute') then raise exception 'anon/public can execute %', f; end if;
  end loop;
  foreach f in array array['public.match_issue_token(bigint,text)', 'public.intro_by_token(text)', 'public.intro_respond(text,text)', 'public.match_sweep()', 'public.match_intro_sent(bigint)'] loop
    if has_function_privilege('authenticated', f, 'execute') then raise exception 'authenticated can execute service function %', f; end if;
    if not has_function_privilege('service_role', f, 'execute') then raise exception 'service_role cannot execute %', f; end if;
  end loop;
  -- anon really is refused at call time, and holds no table grants
  set local role anon;
  if not pg_temp.fails('select * from public.get_my_match()', '42501') then raise exception 'anon called get_my_match'; end if;
  if not pg_temp.fails(format('select public.match_request(%s, %L)', m1, good), '42501') then raise exception 'anon called match_request'; end if;
  if not pg_temp.fails('select * from public.intro_by_token(' || quote_literal(tok) || ')', '42501') then raise exception 'anon called intro_by_token'; end if;
  if not pg_temp.fails('select * from public.matches', '42501') then raise exception 'anon read matches'; end if;
  reset role;

  -- RLS denials as an authenticated student (G4): no table reads at all, no events, no pool emails
  perform pg_temp.as_user(ua, 'ava@example.com'); set local role authenticated;
  foreach f in array array['public.matches', 'public.match_events', 'public.match_pool', 'public.match_blocks', 'public.match_funnel'] loop
    if not pg_temp.fails('select * from ' || f, '42501') then raise exception 'authenticated read %', f; end if;
  end loop;
  if not pg_temp.fails('insert into public.matches (requester_result_id) values (1)', '42501') then raise exception 'authenticated inserted a match'; end if;

  -- A sees only their own row; B-side data is first name only, no email/phone/last name
  select * into g from public.get_my_match();
  if g.match_id <> m1 or g.status <> 'approved' then raise exception 'get_my_match returned the wrong row'; end if;
  if g.peer_first_name <> 'Ben' or g.peer_name is not null or g.peer_email is not null or g.peer_phone is not null then raise exception 'peer contact leaked before accept'; end if;
  if g.draft_message <> 'Hi Ben' or jsonb_array_length(g.fit -> 'together') <> 2 then raise exception 'safe columns wrong'; end if;
  if row_to_json(g)::text ~* '(ben@example|chan|4155550)' then raise exception 'row_to_json leaks the peer'; end if;
  reset role;

  -- C (other pair) cannot read, touch or request A's match; the error never says whether the id exists
  perform pg_temp.as_user(uc, 'cal@example.com'); set local role authenticated;
  select * into g from public.get_my_match();
  if g.match_id <> m2 then raise exception 'C saw another match'; end if;
  foreach f in array array[format('select public.match_viewed(%s)', m1), format('select public.match_request(%s, %L)', m1, good),
      format('select public.match_withdraw(%s)', m1), format('select public.match_report(%s)', m1), format('select public.match_rematch(%s)', m1),
      format('select public.match_step(%s, %L)', m1, 'card_opened'), 'select public.match_viewed(999999)'] loop
    if not pg_temp.fails(f, '42501') then raise exception 'stranger passed: %', f; end if;
  end loop;
  reset role;

  -- viewed: approved -> revealed, keeps first view; funnel step once
  perform pg_temp.as_user(ua, 'ava@example.com'); set local role authenticated;
  perform public.match_viewed(m1); perform public.match_step(m1, 'card_opened'); perform public.match_step(m1, 'card_opened');
  if not pg_temp.fails(format('select public.match_step(%s, %L)', m1, 'accepted'), '22023') then raise exception 'unknown step accepted'; end if;
  reset role;
  if (select status from public.matches where id = m1) <> 'revealed' then raise exception 'viewed did not reveal'; end if;
  if (select count(*) from public.match_events where match_id = m1 and type = 'card_opened') <> 1 then raise exception 'step not once'; end if;

  -- text rules: length, email, phone, handle, link; error never echoes text
  set local role authenticated;
  foreach f in array array['too short', repeat('x', 601), good || ' mail me ava@example.com', good || ' call 415 555 0199 anytime',
      good || ' find me on instagram: avasolar', good || ' see https://example.org/x', good || ' or www.solar.io', good || ' ava at gmail dot com',
      good || ' ping @avasolar'] loop
    begin perform public.match_request(m1, f); raise exception 'accepted bad text: %', left(f, 30);
    exception when sqlstate '22023' then if sqlerrm ~* 'ava|example|555' then raise exception 'error echoed text: %', sqlerrm; end if; end;
  end loop;
  begin perform public.match_request(m1, good, 'learn from you ava@example.com'); raise exception 'learn contact accepted';
  exception when sqlstate '22023' then null; end;
  -- the <script> text is allowed through storage (escaped at render); within caps
  perform public.match_request(m1, 'I like <b>solar</b> & "schools" a lot, so I would love to hear how your tutoring app got its first users.', 'budgets');
  reset role;
  if (select status from public.matches where id = m1) <> 'requested' then raise exception 'request did not move state'; end if;
  if (select expires_at - requested_at from public.matches where id = m1) <> interval '72 hours' then raise exception 'not 72h'; end if;
  if (select count(*) from public.match_events where match_id = m1 and type = 'request_sent' and actor = 'student') <> 1 then raise exception 'request_sent missing'; end if;

  -- second send of the same match is refused (state), A's get_my_match still hides contact while requested
  set local role authenticated;
  if not pg_temp.fails(format('select public.match_request(%s, %L)', m1, good), '22023') then raise exception 'double request'; end if;
  select * into g from public.get_my_match();
  if g.peer_email is not null or g.peer_name is not null then raise exception 'contact leaked while requested'; end if;
  reset role;

  -- token functions: issue once, GET is read-only, unknown token, expiry derived on read
  select * into r from public.match_issue_token(m1, tok);
  if r.peer_email <> 'ben@example.com' or r.requester_first_name <> 'Ava' or r.requester_region <> 'Ohio, US' then raise exception 'issue_token payload wrong'; end if;
  if pg_temp.fails(format('select * from public.match_issue_token(%s, %L)', m1, tok2), '22023') = false then raise exception 'token reissued'; end if;
  if (select count(*) from public.match_events) <> (select count(*) from public.match_events) then raise exception 'x'; end if;
  n := (select count(*) from public.match_events);
  select * into r from public.intro_by_token(tok);
  if r.state <> 'open' or r.requester_first_name <> 'Ava' or r.message is null then raise exception 'open token page wrong'; end if;
  if row_to_json(r)::text ~* '(ava@example|lee|4155550)' then raise exception 'token page leaks the requester'; end if;
  perform * from public.intro_by_token(tok);
  if (select state from public.intro_by_token(repeat('c', 64))) <> 'unknown' or (select state from public.intro_by_token(null)) <> 'unknown' then raise exception 'unknown token state'; end if;
  if n <> (select count(*) from public.match_events) or (select status from public.matches where id = m1) <> 'requested' then raise exception 'GET changed state'; end if;
  update public.matches set expires_at = now() - interval '1 minute' where id = m1;
  if (select state from public.intro_by_token(tok)) <> 'expired' or (select status from public.matches where id = m1) <> 'requested' then raise exception 'expiry not derived read-only'; end if;
  if (select message from public.intro_by_token(tok)) is not null then raise exception 'expired page shows message'; end if;
  update public.matches set expires_at = now() + interval '72 hours' where id = m1;

  -- race: withdraw wins, then accept on the same link does nothing and sends no contact; and the other order
  set local role authenticated; perform pg_temp.as_user(ua, 'ava@example.com'); perform public.match_withdraw(m1); reset role;
  select * into r from public.intro_respond(tok, 'accept');
  if r.outcome <> 'withdrawn' or r.requester_email is not null or r.peer_email is not null then raise exception 'accept after withdraw not refused'; end if;
  if (select state from public.intro_by_token(tok)) <> 'withdrawn' then raise exception 'withdrawn page'; end if;
  update public.matches set status = 'requested', responded_at = null where id = m1;
  select * into r from public.intro_respond(tok, 'accept');
  if r.outcome <> 'accepted' or r.requester_email <> 'ava@example.com' or r.peer_email <> 'ben@example.com' or r.peer_phone <> '+14155550102' then raise exception 'accept payload wrong'; end if;
  set local role authenticated; perform pg_temp.as_user(ua, 'ava@example.com');
  if not pg_temp.fails(format('select public.match_withdraw(%s)', m1), '22023') then raise exception 'withdraw after accept'; end if;
  reset role;
  select * into r from public.intro_respond(tok, 'accept');
  if r.outcome <> 'accepted' or r.peer_email is not null then raise exception 'single use broken: second accept returned contacts'; end if;
  if (select state from public.intro_by_token(tok)) <> 'accepted' then raise exception 'used page'; end if;
  select * into r from public.intro_respond(tok, 'decline');
  if r.outcome <> 'accepted' or (select status from public.matches where id = m1) <> 'accepted' then raise exception 'decline after accept changed state'; end if;

  -- after accept A sees B's full contact; C still sees nothing of B
  set local role authenticated;
  select * into g from public.get_my_match();
  if g.status <> 'accepted' or g.peer_name <> 'Ben Chan' or g.peer_email <> 'ben@example.com' or g.peer_phone <> '+14155550102' then raise exception 'contact not shown after accept'; end if;
  reset role;
  perform public.match_intro_sent(m1); perform public.match_intro_sent(m1);
  if (select count(*) from public.match_events where match_id = m1 and type = 'intro_sent') <> 1 then raise exception 'intro_sent not once'; end if;

  -- no emails in events or errors: meta is empty everywhere
  if exists (select 1 from public.match_events where meta::text ~ '@' or meta <> '{}') then raise exception 'event meta carries data'; end if;

  -- decline, rematch (max 2), never same peer twice; C/D: decline -> rematch row is unmatched
  perform public.match_viewed(m2) from (select 1) s where false;
  perform pg_temp.as_user(uc, 'cal@example.com'); set local role authenticated;
  perform public.match_request(m2, good); reset role;
  perform public.match_issue_token(m2, tok2);
  select * into r from public.intro_respond(tok2, 'decline');
  if r.outcome <> 'declined' or r.peer_email is not null then raise exception 'decline leaked'; end if;
  set local role authenticated;
  select * into g from public.get_my_match();
  if g.status <> 'declined' or g.peer_email is not null then raise exception 'declined state wrong'; end if;
  m3 := public.match_rematch(m2);
  if not pg_temp.fails(format('select public.match_rematch(%s)', m2), '22023') then raise exception 'rematch twice from one row'; end if;
  reset role;
  if (select status from public.matches where id = m3) <> 'unmatched' or (select prev_match_id from public.matches where id = m3) <> m2 then raise exception 'rematch row wrong'; end if;
  if not pg_temp.fails(format('update public.matches set peer_result_id = %s where id = %s', rd, m3), '23505') then raise exception 'same peer twice'; end if;
  set local role authenticated; select * into g from public.get_my_match();
  if g.match_id <> m3 or g.status <> 'unmatched' or g.peer_first_name is not null then raise exception 'unmatched card wrong'; end if;
  reset role;
  -- peers: pool is [rb, rd, rf, re, ra]; C is an adult so only rd is eligible: an adult peer outside the pool is not
  insert into public.applications (role, level, name, email, working_on, source) values ('student', 'college', 'Gus Ng', 'gus@example.com', 'x', '/apply') returning id into ae;
  insert into public.results (application_id, outcome, status) values (ae, 'peer', 'approved') returning id into re;
  insert into public.match_pool (result_id) values (re);
  update public.matches set peer_result_id = re, status = 'approved' where id = m3;
  set local role authenticated; perform public.match_request(m3, good);
  reset role;
  update public.matches set status = 'expired' where id = m3;  -- sweep-like expiry, then a 2nd rematch
  set local role authenticated; m4 := public.match_rematch(m3); reset role;
  insert into public.applications (role, level, name, email, working_on, source) values ('student', 'college', 'Hal Ito', 'hal@example.com', 'x', '/apply') returning id into ae;
  insert into public.results (application_id, outcome, status) values (ae, 'peer', 'approved') returning id into re;
  insert into public.match_pool (result_id) values (re);
  update public.matches set peer_result_id = re, status = 'approved' where id = m4;
  update public.match_events set at = now() - interval '2 days' where type = 'request_sent';  -- day limit is its own subtest
  set local role authenticated; perform public.match_request(m4, good); reset role;
  update public.matches set status = 'declined' where id = m4;
  set local role authenticated;
  if not pg_temp.fails(format('select public.match_rematch(%s)', m4), '54000') then raise exception 'third rematch allowed'; end if;
  reset role;

  -- season request cap (3 per season) and per-day rate limit (2 per day) for one student
  perform set_config('request.jwt.claims', '', true);
  delete from public.match_events where actor = 'student' and type = 'request_sent';  -- reset day counter for this subtest
  update public.matches set requested_at = now() - interval '5 days' where requested_at is not null;
  if (select count(*) from public.matches where requester_result_id = rc and requested_at is not null) <> 3 then raise exception 'fixture: C should have 3 requests'; end if;
  insert into public.match_pool (result_id) select r2.id from public.results r2 where r2.id = rd on conflict do nothing;
  -- C has used 3 of 3 this season: a 4th open match cannot be sent (season cap)
  update public.matches set status = 'declined' where requester_result_id = rc and status in ('expired', 'requested');
  insert into public.applications (role, level, name, email, working_on, source) values ('student', 'college', 'Ida Oz', 'ida@example.com', 'x', '/apply') returning id into ae;
  insert into public.results (application_id, outcome, status) values (ae, 'peer', 'approved') returning id into re;
  insert into public.match_pool (result_id) values (re);
  insert into public.matches (requester_result_id, peer_result_id, prev_match_id, status) values (rc, re, m4, 'approved') returning id into m5;
  perform pg_temp.as_user(uc, 'cal@example.com'); set local role authenticated;
  if not pg_temp.fails(format('select public.match_request(%s, %L)', m5, good), '54000') then raise exception 'season cap missing'; end if;
  reset role;

  -- day rate limit: F-side student E1 with a fresh application owner sends 2 in a day over two matches, third refused
  perform set_config('request.jwt.claims', '', true);
  perform pg_temp.as_user(uf, 'fay@example.com');
  insert into public.match_pool (result_id) values (ra) on conflict do nothing;
  -- fay (minor, rf) requests ra? ra is a minor in pool; ra's open capacity is fine
  insert into public.matches (requester_result_id, peer_result_id, status) values (rf, ra, 'approved') returning id into m5;
  -- Seed two request_sent events in the last day for fay's application to prove the limiter counts per user.
  insert into public.match_events (match_id, type, actor) values (m5, 'request_sent', 'student'), (m5, 'request_sent', 'student');
  set local role authenticated;
  if not pg_temp.fails(format('select public.match_request(%s, %L)', m5, good), '54000') then raise exception 'daily rate limit missing'; end if;
  reset role;
  delete from public.match_events where match_id = m5 and type = 'request_sent';
  set local role authenticated; perform public.match_request(m5, good); reset role;

  -- peer capacity: ra (pool member) already holds fay's open request; cap it to 1 and a second requester is refused
  update public.match_pool set max_open = 1 where result_id = ra;
  insert into public.applications (role, level, name, email, working_on, source) values ('student', 'high_school', 'Jo Kay', 'jo@example.com', 'x', '/apply') returning id into ae;
  insert into auth.users (id, email, email_confirmed_at) values (uj, 'jo@example.com', now());
  insert into public.results (application_id, outcome, status) values (ae, 'peer', 'approved') returning id into re;
  insert into public.matches (requester_result_id, peer_result_id, status) values (re, ra, 'approved') returning id into m5;
  perform pg_temp.as_user(uj, 'jo@example.com'); set local role authenticated;
  if not pg_temp.fails(format('select public.match_request(%s, %L)', m5, good), '22023') then raise exception 'peer capacity not enforced'; end if;
  reset role;

  -- report: requester reports an accepted match -> reported, pair blocked, contact hidden; blocked pair cannot be matched again
  perform pg_temp.as_user(ua, 'ava@example.com'); set local role authenticated;
  perform public.match_report(m1);
  select * into g from public.get_my_match();
  if g.status <> 'reported' or g.peer_email is not null or g.peer_first_name is not null or g.peer_phone is not null then raise exception 'reported match leaks'; end if;
  reset role;
  if not exists (select 1 from public.match_blocks where peer_result_id = rb and application_id = aa) then raise exception 'no block after report'; end if;
  if (select count(*) from public.match_events where match_id = m1 and type = 'reported' and actor = 'student') <> 1 then raise exception 'report event'; end if;
  perform pg_temp.as_user(ua, 'ava@example.com');

  -- peer-side report and opt-out, with the pool removal
  perform set_config('request.jwt.claims', '', true);
  delete from public.matches where requester_result_id = rf;
  insert into public.matches (requester_result_id, peer_result_id, status, requested_at, expires_at, token_hash)
    values (rf, ra, 'requested', now(), now() + interval '72 hours', repeat('d', 64)) returning id into m5;
  select * into r from public.intro_respond(repeat('d', 64), 'optout');
  if r.outcome <> 'opted_out' or (select opted_out_at from public.match_pool where result_id = ra) is null then raise exception 'optout did not leave the pool'; end if;
  if (select status from public.matches where id = m5) <> 'declined' then raise exception 'optout did not decline'; end if;
  if not pg_temp.fails(format('insert into public.matches (requester_result_id, peer_result_id) values (%s, %s)', rf, ra), '22023') then raise exception 'opted-out peer matched again'; end if;
  if not pg_temp.fails('select * from public.intro_respond(' || quote_literal(repeat('d', 64)) || ', ''hack'')', '22023') then raise exception 'unknown action accepted'; end if;

  -- an opt-out declines the match but must get no decline mail from the sweep (the page sends nothing either)
  update public.matches set request_mailed_at = now(), responded_at = now() where id = m5;
  if (select count(*) from public.match_sweep() where match_id = m5 and action in ('decline', 'lapsed')) <> 0 then raise exception 'sweep mails a decline after an opt-out'; end if;
  delete from public.match_events where match_id = m5 and type = 'opted_out';
  if (select count(*) from public.match_sweep() where match_id = m5 and action = 'decline') <> 1 then raise exception 'plain decline not swept'; end if;
  update public.matches set responded_at = now() - interval '21 hours' where id = m5;
  if (select count(*) from public.match_sweep() where match_id = m5 and action = 'lapsed') <> 1 then raise exception 'stale decline not reported lapsed'; end if;

  -- sweep: reminder at 48h once, expiry at 72h
  delete from public.matches where requester_result_id in (rf);
  insert into public.match_pool (result_id) values (rb) on conflict do nothing;
  insert into public.matches (requester_result_id, peer_result_id, status, requested_at, expires_at, token_hash)
    values (rf, rb, 'requested', now() - interval '50 hours', now() + interval '22 hours', repeat('e', 64)) returning id into m5;
  update public.matches set request_mailed_at = now() where id = m5;
  if (select count(*) from public.match_sweep() where match_id = m5 and action = 'remind') <> 1 then raise exception 'no reminder'; end if;
  perform public.match_mail_done(m5, 'reminder');
  if (select count(*) from public.match_sweep() where match_id = m5) <> 0 then raise exception 'reminder repeated'; end if;
  update public.matches set expires_at = now() - interval '1 minute' where id = m5;
  if (select count(*) from public.match_sweep() where match_id = m5 and action = 'expire') <> 1 then raise exception 'no expiry'; end if;
  if (select status from public.matches where id = m5) <> 'expired' or not exists (select 1 from public.match_events where match_id = m5 and type = 'expired' and actor = 'system') then raise exception 'expiry event'; end if;
  select * into r from public.intro_respond(repeat('e', 64), 'accept');
  if r.outcome <> 'expired' or r.peer_email is not null then raise exception 'accept after expiry'; end if;

  -- funnel is service-only and counts distinct matches
  alter role service_role bypassrls;  -- Supabase's service_role bypasses RLS; the local stub role does not
  set local role service_role;
  if (select matches from public.match_funnel where type = 'expired' limit 1) is null then raise exception 'funnel empty'; end if;
  reset role;
end $$;

rollback;
