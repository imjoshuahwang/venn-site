-- SQL audit (venn#329): one post in any URL form, messy ?ref= values, no share state for non-students.
-- LOCAL only; rolls back. Run: bash supabase/tests/run_local.sh
begin;

create function pg_temp.ok(cond boolean, what text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FAIL: %', what; end if;
end $$;
create function pg_temp.tok(e text) returns text language sql as $$
  select page_token from applications where email = e;
$$;
create function pg_temp.refused(code text, url text) returns boolean language plpgsql as $$
begin
  perform submit_share(code, url);
  return false;
exception when others then
  return sqlerrm = 'post already used';
end $$;

-- post_key: the /posts/ slug and the feed/update urn of one activity are one post, on any host or query string.
select pg_temp.ok(post_key('https://www.linkedin.com/posts/ana_venn-activity-7123456789012345678-AbCd?utm_source=share')
                  = post_key('m.linkedin.com/feed/update/urn:li:activity:7123456789012345678/'), 'posts slug = feed urn');
select pg_temp.ok(post_key('https://www.linkedin.com/embed/feed/update/urn:li:activity:7123456789012345678')
                  = post_key('https://uk.linkedin.com/feed/update/urn:li:activity:7123456789012345678?x=1#y'), 'embed = country host');
select pg_temp.ok(post_key('https://lnkd.in/gAbC12/') <> post_key('https://lnkd.in/gabc12'), 'lnkd.in stays case-sensitive');
select pg_temp.ok(post_key('https://lnkd.in/gAbC12/?trk=x') = post_key('lnkd.in/gAbC12'), 'lnkd.in query and slash');
select pg_temp.ok(post_key('https://www.linkedin.com/feed/update/urn:li:share:7000000000000000001')
                  <> post_key('https://www.linkedin.com/feed/update/urn:li:activity:7000000000000000001'), 'share urn is not an activity');

insert into applications (role, name, email, working_on)
  values ('student', 'Ana', 'ana@example.org', 'x'), ('student', 'Cy', 'cy@example.org', 'x'),
         ('college_club', 'Club', 'club@example.edu', 'x');
select pg_temp.ok(submit_share(pg_temp.tok('ana@example.org'),
                  'linkedin.com/feed/update/urn:li:activity:7123456789012345678/?utm_source=share')->>'share_status' = 'submitted',
                  'first post saved');
select pg_temp.ok(pg_temp.refused(pg_temp.tok('cy@example.org'),
                  'https://www.linkedin.com/posts/ana_venn-activity-7123456789012345678-AbCd?utm_medium=member_ios'),
                  'same post in the /posts/ form is refused for another inbox');

-- Non-students have no share rule: submit_share must not mark them submitted.
select submit_share(pg_temp.tok('club@example.edu'), 'https://www.linkedin.com/posts/club-1');
select pg_temp.ok((select share_status is null and post_url is null from applications where email = 'club@example.edu'),
                  'non-student stays out of the share flow');

-- ?ref= is credited even with stray whitespace/control characters around it (hand-made or pasted requests).
insert into applications (role, name, email, working_on, referred_by)
  select 'student', 'Bo', 'bo@example.org', 'x', E'\t ' || upper(ref_code) || E' \n' from applications where email = 'ana@example.org';
select pg_temp.ok((select b.referred_by = a.ref_code from applications a, applications b
                   where a.email = 'ana@example.org' and b.email = 'bo@example.org'), 'ref with tab/newline still credits');

-- Proof of a post is a saved post_url; the legacy self-reported referral_steps 'linkedin' row proves nothing.
insert into referral_steps (application_id, kind) select id, 'linkedin' from applications where email = 'cy@example.org';
select pg_temp.ok((select not linkedin_posted and not share_submitted from referral_stats r join applications a on a.id = r.referrer_id
                   where a.email = 'cy@example.org'), 'self-reported click is not posted');
select pg_temp.ok((select linkedin_posted and share_submitted from referral_stats r join applications a on a.id = r.referrer_id
                   where a.email = 'ana@example.org'), 'saved post url is posted and submitted');
select pg_temp.ok((select not linkedin and score = 0 from application_score s join applications a on a.id = s.application_id
                   where a.email = 'cy@example.org'), 'no +5 for the unproven flag');
select pg_temp.ok((select linkedin and score = 5 from application_score s join applications a on a.id = s.application_id
                   where a.email = 'ana@example.org'), '+5 for a saved post url');
select pg_temp.ok((select count(*) = 3 and bool_and(id <> (select id from applications where email = 'club@example.edu'))
                   from v_shares), 'v_shares: students only');
select pg_temp.ok(not has_table_privilege('anon', 'public.v_shares', 'select')
                  and has_table_privilege('service_role', 'public.v_shares', 'select')
                  and not has_table_privilege('anon', 'public.referral_stats', 'select'), 'v_shares/referral_stats grants');

-- referral_status returns role (org/club /refer state, venn#329)
do $$ declare r jsonb; begin
  select public.referral_status(page_token) into r from applications where page_token is not null limit 1;
  if r is null or not (r ? 'role') then raise exception 'referral_status missing role'; end if;
end $$;

rollback;
select 'audit_check ok';
