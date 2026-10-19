-- Share status checks (venn-site #22). Run against a LOCAL database with all migrations applied (never production).
--   bash supabase/tests/run_local.sh
-- Fake people only (example.com / example.org). Raises on the first failure; rolls back.
begin;

create function pg_temp.ok(cond boolean, what text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FAIL: %', what; end if;
end $$;

create function pg_temp.fails(sql text, expect text) returns void language plpgsql as $$
begin
  execute sql;
  raise exception 'FAIL: expected error "%" from %', expect, sql;
exception when others then
  if sqlerrm like 'FAIL:%' or sqlerrm <> expect then raise exception 'FAIL: wanted "%" got "%"', expect, sqlerrm; end if;
end $$;

-- Test people: Sam (referrer), Una (url), Vic (void), Lee (legacy), friends.
insert into applications (role, name, email, working_on) values
  ('student', 'Sam Test', 'sam@example.com', 'x'), ('student', 'Una Test', 'una@example.com', 'x'),
  ('student', 'Vic Test', 'vic@example.com', 'x'), ('student', 'Lee Test', 'lee@example.com', 'x');
create temp table c as select split_part(email, '@', 1) as who, ref_code from applications;

select pg_temp.ok((select bool_and(share_status = 'pending_share' and share_due between now() + interval '23 hours 59 minutes' and now() + interval '24 hours 1 minute'
                   and post_url is null and share_submitted_at is null) from applications), 'new rows pending, due in 24h');
select pg_temp.ok((select referral_status(ref_code)->>'share_status' = 'pending_share' and (referral_status(ref_code)->>'friends_submitted')::int = 0
                   and (referral_status(ref_code)->>'post_url_saved')::boolean is false and referral_status(ref_code) ? 'share_due'
                   from c where who = 'una'), 'status keys');

-- Callers cannot choose the share columns.
insert into applications (role, name, email, working_on, share_status, share_due, post_url, share_submitted_at)
  values ('student', 'Cheat Test', 'cheat@example.com', 'x', 'submitted', now() - interval '1 day', 'https://linkedin.com/posts/x', now());
select pg_temp.ok((select share_status = 'pending_share' and share_due > now() and post_url is null and share_submitted_at is null
                   from applications where email = 'cheat@example.com'), 'caller cannot insert submitted');

-- URL path.
select pg_temp.fails($$select submit_share((select ref_code from c where who='una'), 'https://example.com/posts/1')$$, 'need a linkedin post link');
select pg_temp.fails($$select submit_share((select ref_code from c where who='una'), 'https://lnkd.in/abc')$$, 'need a linkedin post link');
select pg_temp.fails($$select submit_share((select ref_code from c where who='una'))$$, 'need a linkedin post link');
select pg_temp.fails($$select submit_share('nope-zzzzzz', 'linkedin.com/posts/a')$$, 'unknown code');
select pg_temp.ok((select share_status = 'pending_share' from applications where email = 'una@example.com'), 'failed submits change nothing');
select pg_temp.ok((select submit_share(ref_code, 'www.linkedin.com/feed/update/urn:li:activity:1') ->> 'share_status' = 'submitted' from c where who = 'una'), 'feed/update submits');
select pg_temp.ok((select post_url = 'https://www.linkedin.com/feed/update/urn:li:activity:1' and share_submitted_at is not null
                   from applications where email = 'una@example.com'), 'normalized https url stored');
select pg_temp.ok((select (referral_status(ref_code)->>'post_url_saved')::boolean from c where who = 'una'), 'post_url_saved');
-- Idempotent; first URL wins.
select submit_share(ref_code, 'https://linkedin.com/posts/second') from c where who = 'una';
select pg_temp.ok((select post_url like '%feed/update%' from applications where email = 'una@example.com'), 'first url wins');
select pg_temp.ok((select count(*) = 1 from share_events where step = 'submitted' and ref_code = (select ref_code from c where who = 'una')), 'one submitted event');
select pg_temp.ok((select submit_share(ref_code, 'https://linkedin.com/posts/ann-1') ->> 'share_status' = 'submitted' from c where who = 'lee'), 'posts/ url submits');

-- Legacy (null) row can still submit.
insert into applications (role, name, email, working_on) values ('student', 'Old Test', 'old@example.com', 'x');
update applications set share_status = null, share_due = null where email = 'old@example.com';
select pg_temp.ok((select referral_status(ref_code)->>'share_status' is null from applications where email = 'old@example.com'), 'legacy status null');
select pg_temp.ok((select submit_share(ref_code, 'https://linkedin.com/posts/old') ->> 'share_status' = 'submitted' from applications where email = 'old@example.com'), 'legacy can submit');

-- Friends path: Sam needs 2 verified friends created before share_due.
insert into applications (role, name, email, working_on, referred_by)
  select 'student', 'Friend', 'sf' || g || '@example.org', 'x', (select ref_code from c where who = 'sam') from generate_series(1, 4) g;
update applications set confirmed_at = now() where email in ('sf1@example.org', 'sf3@example.org');
insert into applications (role, name, email, working_on, referred_by)
  values ('student', 'Sam Again', 'sam+alt@example.com', 'x', (select ref_code from c where who = 'sam'));
update applications set confirmed_at = now() where email = 'sam+alt@example.com';
select pg_temp.ok((select (referral_status(ref_code)->>'friends_submitted')::int = 2 from c where who = 'sam'), 'two verified friends (self and unconfirmed excluded)');
-- Back to one: bounce a friend.
update applications set email_status = 'bounced' where email = 'sf3@example.org';
select pg_temp.ok((select (referral_status(ref_code)->>'friends_submitted')::int = 1 from c where who = 'sam'), 'one verified friend');
select pg_temp.fails($$select submit_share((select ref_code from c where who='sam'))$$, 'need a linkedin post link');
update applications set email_status = null where email = 'sf3@example.org';
select pg_temp.ok((select submit_share(ref_code) ->> 'share_status' = 'submitted' from c where who = 'sam'), 'two friends submit with no url');
select pg_temp.ok((select post_url is null from applications where email = 'sam@example.com'), 'no url stored');

-- A friend who applied after share_due does not count.
insert into applications (role, name, email, working_on) values ('student', 'Dee Test', 'dee@example.com', 'x');
insert into applications (role, name, email, working_on, referred_by)
  select 'student', 'Friend', 'df' || g || '@example.org', 'x', (select ref_code from applications where email = 'dee@example.com') from generate_series(1, 2) g;
update applications set confirmed_at = now() where email like 'df%@example.org';
update applications set created_at = now() + interval '2 hours' where email = 'df2@example.org';
select pg_temp.ok((select (referral_status(ref_code)->>'friends_submitted')::int = 2 from applications where email = 'dee@example.com'), 'both before due');
update applications set share_due = now() + interval '1 hour' where email = 'dee@example.com';
select pg_temp.ok((select (referral_status(ref_code)->>'friends_submitted')::int = 1 from applications where email = 'dee@example.com'), 'late friend does not count');

-- Past due -> void, submit raises.
update applications set share_due = now() - interval '1 minute' where email = 'vic@example.com';
select pg_temp.ok((select referral_status(ref_code)->>'share_status' = 'void' from c where who = 'vic'), 'past due reads void');
select pg_temp.fails($$select submit_share((select ref_code from c where who='vic'), 'https://linkedin.com/posts/late')$$, 'void');
select pg_temp.ok((select share_status = 'pending_share' from applications where email = 'vic@example.com'), 'row untouched by void submit');

-- Submitted stays submitted even past due.
update applications set share_due = now() - interval '1 day' where email = 'una@example.com';
select pg_temp.ok((select referral_status(ref_code)->>'share_status' = 'submitted' from c where who = 'una'), 'submitted not voided by time');

-- share_events: RLS on, no anon access.
select pg_temp.ok((select relrowsecurity from pg_class where oid = 'public.share_events'::regclass), 'share_events RLS');
select pg_temp.ok(not has_table_privilege('anon', 'public.share_events', 'select,insert'), 'share_events closed to anon');
select pg_temp.ok(has_function_privilege('anon', 'public.submit_share(text,text)', 'execute'), 'anon can submit_share');

select 'share_check ok' as result;
rollback;
