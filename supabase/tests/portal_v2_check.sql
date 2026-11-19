-- Portal v2 schema check for 20261119020000_portal_v2.sql (venn-site #126). LOCAL db only; all rolls back.
begin;

create function pg_temp.as_user(uid uuid, em text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'email', em, 'role', 'authenticated')::text, true);
$$;
grant execute on function pg_temp.as_user(uuid, text) to public;

do $$
declare
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid();
  um1 uuid := gen_random_uuid(); um2 uuid := gen_random_uuid();
  aa bigint; ab bigint; ad bigint; ra bigint; rb bigint; rd bigint; coh bigint;
  n int; ok boolean; t text;
begin
  insert into auth.users (id, email, email_confirmed_at) values
    (ua, 'maya@example.com', now()), (ub, 'bo@example.com', now()),
    (um1, 'm1@example.com', now()), (um2, 'm2@example.com', now());
  insert into public.applications (role, name, email, working_on, source) values ('student', 'Maya', 'maya@example.com', 'x', '/apply') returning id into aa;
  insert into public.applications (role, name, email, working_on, source) values ('student', 'Bo', 'bo@example.com', 'x', '/apply') returning id into ab;
  insert into public.applications (role, name, email, working_on, source) values ('student', 'Di', 'di@example.com', 'x', '/apply') returning id into ad;
  insert into public.cohorts (slug, name) values ('q', 'Quadron') returning id into coh;
  select seat_cap into n from public.cohorts where id = coh;
  if n is distinct from 6 then raise exception 'cohorts.seat_cap default is not 6'; end if;
  insert into public.results (application_id, outcome, cohort_id, status) values (aa, 'cohort', coh, 'approved') returning id into ra;
  insert into public.results (application_id, outcome, status) values (ab, 'peer', 'approved') returning id into rb;
  insert into public.results (application_id, outcome, cohort_id) values (ad, 'cohort', coh) returning id into rd; -- draft

  -- text_code unique and shaped VENN-XXXX
  update public.results set text_code = 'VENN-AB12' where id = ra;
  begin update public.results set text_code = 'VENN-AB12' where id = rb; ok := false; exception when unique_violation then ok := true; end;
  if not ok then raise exception 'duplicate text_code accepted'; end if;
  begin update public.results set text_code = 'venn-ab13' where id = rb; ok := false; exception when check_violation then ok := true; end;
  if not ok then raise exception 'malformed text_code accepted'; end if;

  -- team cap: 3 live per lead; a removed member frees a seat
  insert into public.team_members (lead_result_id, email_key, user_id) values (ra, 'm1@example.com', um1);
  insert into public.team_members (lead_result_id, email_key) values (ra, 'm2@example.com');
  insert into public.team_members (lead_result_id, email_key) values (ra, 'm3@example.com');
  begin insert into public.team_members (lead_result_id, email_key) values (ra, 'm4@example.com'); ok := false;
  exception when others then ok := true; end;
  if not ok then raise exception '4th live team member accepted'; end if;
  update public.team_members set removed_at = now() where lead_result_id = ra and email_key = 'm3@example.com';
  insert into public.team_members (lead_result_id, email_key) values (ra, 'm4@example.com');
  begin update public.team_members set removed_at = null where lead_result_id = ra and email_key = 'm3@example.com'; ok := false;
  exception when others then ok := true; end;
  if not ok then raise exception 'un-removing past the cap accepted'; end if;

  -- consents: one row per user+clause+version
  insert into public.consents (user_id, clause, accepted, version) values (ua, 'highlights', true, 'v1');
  insert into public.consents (user_id, clause, accepted, version) values (ua, 'highlights', true, 'v2');
  begin insert into public.consents (user_id, clause, accepted, version) values (ua, 'highlights', false, 'v1'); ok := false;
  exception when unique_violation then ok := true; end;
  if not ok then raise exception 'duplicate consent accepted'; end if;
  insert into public.consents (user_id, clause, accepted, version) values (ub, 'highlights', true, 'v1');

  insert into public.parent_consents (user_id, parent_email, token_hash, expires_at) values (ua, 'p@example.com', 'h1', now() + interval '3 days');
  insert into public.parent_consents (user_id, parent_email, token_hash, expires_at) values (ub, 'p2@example.com', 'h2', now() + interval '3 days');
  insert into public.guiding_answers (result_id, question, answer) values (ra, 'q1', 'a'), (rb, 'q1', 'b'), (rd, 'q1', 'c');
  begin insert into public.guiding_answers (result_id, question, answer) values (ra, 'q1', 'dup'); ok := false;
  exception when unique_violation then ok := true; end;
  if not ok then raise exception 'duplicate guiding answer accepted'; end if;
  insert into public.portal_links (user_id, token_hash) values (ua, 'l1'), (ub, 'l2');
  select (extract(epoch from expires_at - created_at)/3600)::int::text into t from public.portal_links where token_hash = 'l1';
  if t <> '72' then raise exception 'portal_links expiry default is not 72h (%)', t; end if;

  -- anon: no read, no write on any new table
  set local role anon;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  begin perform 1 from public.team_members; ok := false; exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'anon can select team_members'; end if;
  begin insert into public.consents (user_id, clause, accepted, version) values (ua, 'x', true, 'v1'); ok := false; exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'anon can insert consents'; end if;
  begin perform public.portal_owns_result(ra); ok := false; exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'anon can run portal_owns_result'; end if;
  reset role;

  -- user A (lead of ra): sees own approved result and its rows; nothing of B or drafts
  set local role authenticated;
  perform pg_temp.as_user(ua, 'maya@example.com');
  if not public.portal_owns_result(ra) then raise exception 'owner does not own own approved result'; end if;
  if public.portal_owns_result(rb) then raise exception 'A owns B result'; end if;
  select count(*) into n from public.team_members; if n <> 4 then raise exception 'A sees % team rows, want 4', n; end if;
  select count(*) into n from public.consents; if n <> 2 then raise exception 'A sees % consents', n; end if;
  select count(*) into n from public.consents where user_id = ub; if n <> 0 then raise exception 'A reads B consents'; end if;
  select count(*) into n from public.parent_consents; if n <> 1 then raise exception 'A sees % parent_consents', n; end if;
  select count(*) into n from public.guiding_answers; if n <> 1 then raise exception 'A sees % guiding_answers', n; end if;
  select count(*) into n from public.portal_links; if n <> 1 then raise exception 'A sees % portal_links', n; end if;
  begin perform token_hash from public.portal_links; ok := false; exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'A can read portal_links.token_hash'; end if;
  begin perform token_hash from public.parent_consents; ok := false; exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'A can read parent_consents.token_hash'; end if;
  -- direct writes denied
  begin insert into public.team_members (lead_result_id, email_key) values (ra, 'z@example.com'); ok := false; exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'authenticated can insert team_members'; end if;
  begin update public.consents set accepted = false; ok := false; exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'authenticated can update consents'; end if;
  begin delete from public.guiding_answers; ok := false; exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'authenticated can delete guiding_answers'; end if;
  begin insert into public.portal_links (user_id, token_hash) values (ua, 'x'); ok := false; exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'authenticated can insert portal_links'; end if;
  begin insert into public.parent_consents (user_id, parent_email, token_hash, expires_at) values (ua, 'x@y.z', 'x', now()); ok := false; exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'authenticated can insert parent_consents'; end if;
  begin update public.results set letter = 'x'; ok := false; exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'authenticated can update results.letter'; end if;
  reset role;

  -- user B: sees none of A's
  set local role authenticated;
  perform pg_temp.as_user(ub, 'bo@example.com');
  select count(*) into n from public.team_members; if n <> 0 then raise exception 'B sees A team_members'; end if;
  select count(*) into n from public.guiding_answers where result_id = ra; if n <> 0 then raise exception 'B reads A guiding_answers'; end if;
  select count(*) into n from public.consents where user_id = ua; if n <> 0 then raise exception 'B reads A consents'; end if;
  select count(*) into n from public.parent_consents where user_id = ua; if n <> 0 then raise exception 'B reads A parent_consents'; end if;
  select count(*) into n from public.portal_links where user_id = ua; if n <> 0 then raise exception 'B reads A portal_links'; end if;
  reset role;

  -- live team member m1 (by user_id) owns the lead result; a removed member does not
  set local role authenticated;
  perform pg_temp.as_user(um1, 'm1@example.com');
  if not public.portal_owns_result(ra) then raise exception 'live member does not own lead result'; end if;
  select count(*) into n from public.results where id = ra; if n <> 1 then raise exception 'live member cannot read lead result'; end if;
  select count(*) into n from public.team_members; if n <> 4 then raise exception 'member sees % team rows', n; end if;
  select count(*) into n from public.guiding_answers; if n <> 1 then raise exception 'member sees % guiding_answers', n; end if;
  reset role;
  update public.team_members set removed_at = now() where email_key = 'm1@example.com';
  set local role authenticated;
  perform pg_temp.as_user(um1, 'm1@example.com');
  if public.portal_owns_result(ra) then raise exception 'removed member still owns lead result'; end if;
  select count(*) into n from public.results where id = ra; if n <> 0 then raise exception 'removed member reads lead result'; end if;
  reset role;

  -- drafts invisible to owner and to team members; approved visible to both
  update public.results set status = 'draft' where id = ra;
  update public.team_members set removed_at = null where email_key = 'm1@example.com';
  set local role authenticated;
  perform pg_temp.as_user(ua, 'maya@example.com');
  if public.portal_owns_result(ra) then raise exception 'owner sees draft via helper'; end if;
  select count(*) into n from public.results where id = ra; if n <> 0 then raise exception 'owner reads draft result'; end if;
  select count(*) into n from public.guiding_answers; if n <> 0 then raise exception 'owner reads answers of a draft'; end if;
  select count(*) into n from public.team_members; if n <> 0 then raise exception 'owner reads team of a draft'; end if;
  perform pg_temp.as_user(um1, 'm1@example.com');
  select count(*) into n from public.results where id = ra; if n <> 0 then raise exception 'member reads draft result'; end if;
  reset role;
  update public.results set status = 'approved' where id = ra;
  set local role authenticated;
  perform pg_temp.as_user(ua, 'maya@example.com');
  select count(*) into n from public.results where id = ra; if n <> 1 then raise exception 'owner cannot read approved result'; end if;
  perform pg_temp.as_user(um1, 'm1@example.com');
  select count(*) into n from public.results where id = ra; if n <> 1 then raise exception 'member cannot read approved result'; end if;
  reset role;

  -- structural: RLS on, no write privileges, many null text_codes, link flags
  select count(*) into n from pg_class where oid in ('public.team_members'::regclass, 'public.consents'::regclass,
    'public.parent_consents'::regclass, 'public.guiding_answers'::regclass, 'public.portal_links'::regclass) and relrowsecurity;
  if n <> 5 then raise exception 'RLS not enabled on all new tables (%)', n; end if;
  select count(*) into n from unnest(array['team_members','consents','parent_consents','guiding_answers','portal_links']) tb,
    unnest(array['anon','authenticated']) r, unnest(array['insert','update','delete']) p
    where has_table_privilege(r, 'public.' || tb, p);
  if n <> 0 then raise exception 'direct write privilege on a new table (%)', n; end if;
  select count(*) into n from unnest(array['anon','authenticated']) r, unnest(array['team_members','consents','parent_consents','guiding_answers','portal_links']) tb
    where has_sequence_privilege(r, 'public.' || tb || '_id_seq', 'usage');
  if n <> 0 then raise exception 'sequence privilege granted (%)', n; end if;
  if has_column_privilege('authenticated', 'public.portal_links', 'token_hash', 'select')
     or has_column_privilege('authenticated', 'public.parent_consents', 'token_hash', 'select') then
    raise exception 'token_hash selectable'; end if;
  select count(*) into n from public.results where text_code is null; if n < 2 then raise exception 'null text_codes rejected'; end if;
  update public.portal_links set used_at = now() where token_hash = 'l1';
  update public.portal_links set expires_at = now() - interval '1 minute' where token_hash = 'l2';
  select count(*) into n from public.portal_links where used_at is null and expires_at > now();
  if n <> 0 then raise exception 'used or expired link not flagged'; end if;
end $$;

rollback;
