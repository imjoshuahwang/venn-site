-- Page token checks (venn#303). The /refer page opens by a private page_token; the public ref_code only shares.
-- Run against a LOCAL database with all migrations applied (never production). Fake people only. Rolls back.
--   bash supabase/tests/run_local.sh
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

insert into applications (role, name, email, working_on) values
  ('student', 'Pia Test', 'pia@example.com', 'x'), ('student', 'Quin Test', 'quin@example.com', 'x');
create temp table c as select split_part(email, '@', 1) as who, ref_code, page_token from applications;

select pg_temp.ok((select bool_and(page_token ~ '^[0-9a-f]{32}$' and page_token <> ref_code) from c), 'token is 32 hex and differs from ref_code');
select pg_temp.ok((select count(distinct page_token) = 2 from c), 'tokens are unique');

-- The public code no longer opens the page.
select pg_temp.ok((select referral_status(ref_code) is null from c where who = 'pia'), 'referral_status(ref_code) is null');
select pg_temp.fails($$select record_step((select ref_code from c where who='pia'), 'opened')$$, 'unknown code');
select pg_temp.fails($$select record_step((select ref_code from c where who='pia'), 'email')$$, 'unknown code');
select pg_temp.fails($$select submit_share((select ref_code from c where who='pia'), 'https://linkedin.com/posts/pia-1')$$, 'unknown code');

-- The token does, and the status never leaks it.
select pg_temp.ok((select referral_status(page_token)->>'ref_code' = ref_code from c where who = 'pia'), 'referral_status(token) returns ref_code');
select pg_temp.ok((select not (referral_status(page_token) ? 'page_token') from c where who = 'pia'), 'status has no page_token key');
select pg_temp.ok((select not (record_step(page_token, 'opened') ? 'page_token') from c where who = 'pia'), 'record_step status has no page_token key');
select pg_temp.ok((select count(*) = 1 from share_events e join c on c.ref_code = e.ref_code where c.who = 'pia' and e.step = 'opened'),
  'share_events carries the real ref_code');
select pg_temp.ok((select count(*) = 0 from share_events e join c on c.page_token = e.ref_code), 'share_events never holds a token');

-- submit_application returns the token (insert path and session_id repeat path).
create temp table r as
  select submit_application(jsonb_build_object('role', 'student', 'name', 'Rae Test', 'email', 'rae@example.com', 'working_on', 'x',
    'session_id', '11111111-1111-4111-8111-111111111111')) as first,
         submit_application(jsonb_build_object('role', 'student', 'name', 'Rae Test', 'email', 'rae@example.com', 'working_on', 'x',
    'session_id', '11111111-1111-4111-8111-111111111111')) as again;
select pg_temp.ok((select first = a.page_token and again = a.page_token and first <> a.ref_code
                   from r, applications a where a.email = 'rae@example.com'), 'submit_application returns the page token both times');

-- A client-supplied page_token is ignored.
insert into applications (role, name, email, working_on, page_token) values ('student', 'Sid Test', 'sid@example.com', 'x', 'evil');
select pg_temp.ok((select page_token ~ '^[0-9a-f]{32}$' from applications where email = 'sid@example.com'), 'client page_token ignored');

-- The same post cannot be saved from two inboxes (normalized), but one inbox can re-use its own.
select pg_temp.ok((select submit_share(page_token, 'https://www.linkedin.com/posts/pia-1/') ->> 'share_status' = 'submitted' from c where who = 'pia'), 'pia submits');
select pg_temp.fails($$select submit_share((select page_token from c where who='quin'), 'HTTP://LinkedIn.com/posts/pia-1')$$, 'post already used');
select pg_temp.ok((select share_status = 'pending_share' from applications where email = 'quin@example.com'), 'rejected post leaves quin pending');
insert into applications (role, name, email, working_on) values ('student', 'Pia Test', 'pia@example.com', 'x');
select pg_temp.ok((select submit_share(page_token, 'linkedin.com/posts/pia-1') ->> 'share_status' = 'submitted'
                   from applications where email = 'pia@example.com' order by id desc limit 1), 'same inbox may reuse its post');


-- post_key: one normalized key per post (scheme, www/m/country host, case, query, fragment, trailing slash).
select pg_temp.ok(public.post_key('HTTP://m.LinkedIn.com/Posts/Pia-1//?utm_source=x#y') = 'linkedin.com/posts/pia-1', 'post_key folds variants');
select pg_temp.ok(public.post_key('uk.linkedin.com/feed/update/urn:li:activity:5/') = public.post_key('https://www.linkedin.com/mwlite/feed/update/urn:li:activity:5?a=b'), 'post_key folds mobile feed path');
select pg_temp.ok(public.post_key('https://lnkd.in/AbC') <> public.post_key('https://lnkd.in/abc'), 'lnkd.in short code stays case-sensitive');
select pg_temp.ok(public.post_key('https://www.lnkd.in/AbC?x=1') = 'lnkd.in/AbC', 'lnkd.in host folds');
select pg_temp.ok(public.post_key(null) is null and public.post_key('  ') is null, 'post_key null on blank');
select pg_temp.ok(not has_function_privilege('anon', 'public.post_key(text)', 'execute'), 'post_key not anon-executable');

-- Every variant of an already-used post is refused for another inbox, and the key is stored.
select pg_temp.ok((select post_key = 'linkedin.com/posts/pia-1' from applications where email = 'pia@example.com' order by id limit 1), 'post_key stored on submit');
insert into applications (role, name, email, working_on) values ('student', 'Ty Test', 'ty@example.com', 'x');
select pg_temp.fails($$select submit_share((select page_token from applications where email='ty@example.com'), 'http://m.linkedin.com/posts/PIA-1?utm_source=share#x')$$, 'post already used');
select pg_temp.fails($$select submit_share((select page_token from applications where email='ty@example.com'), 'uk.linkedin.com/posts/pia-1//')$$, 'post already used');

-- The DB guard holds even if the pre-check is bypassed (a raced second write).
select pg_temp.fails($$update applications set post_url = 'https://linkedin.com/posts/pia-1' where email = 'ty@example.com'$$,
  'duplicate key value violates unique constraint "applications_post_key_key"');
select pg_temp.ok((select post_key is null from applications where email = 'ty@example.com'), 'ty has no key after refused write');
select pg_temp.ok((select indexdef like 'CREATE UNIQUE INDEX%' from pg_indexes where indexname = 'applications_post_key_key'), 'unique index exists');

-- Push safety: pre-existing duplicates (written before the index existed) must not break the backfill.
-- Simulated with the trigger off; the backfill statement below is copied from the migration.
alter table applications disable trigger applications_post_key;
insert into applications (role, name, email, working_on) values ('student', 'Una Test', 'una2@example.com', 'x'), ('student', 'Val Test', 'val2@example.com', 'x');
update applications set post_url = 'https://linkedin.com/posts/dup-1' where email = 'una2@example.com';
update applications set post_url = 'https://www.linkedin.com/posts/dup-1/' where email = 'val2@example.com';
alter table applications enable trigger applications_post_key;
update applications a set post_key = public.post_key(a.post_url)
from (select id, row_number() over (partition by public.post_key(post_url) order by id) as rn
      from applications where post_url is not null) d
where d.id = a.id and d.rn = 1 and a.post_key is null;
select pg_temp.ok((select post_key = 'linkedin.com/posts/dup-1' from applications where email = 'una2@example.com'), 'backfill keeps the earliest duplicate');
select pg_temp.ok((select post_key is null from applications where email = 'val2@example.com'), 'backfill leaves the later duplicate null');
select pg_temp.ok((select count(*) = 1 from applications where post_key = 'linkedin.com/posts/dup-1'), 'one holder per key');

select 'page_token_check: all passed' as result;
rollback;
