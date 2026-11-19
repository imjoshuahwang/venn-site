-- email_key keeps the +tag only for portal test addresses (#118); every other address keeps tag-stripping dedupe.
--   bash supabase/tests/run_local.sh
begin;
create function pg_temp.ok(cond boolean, what text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FAIL: %', what; end if;
end $$;

select pg_temp.ok(public.email_key('Ann+promo@example.com') = 'ann@example.com', 'normal address: tag stripped');
select pg_temp.ok(public.email_key('contact+other@joinvenn.org') = 'contact@joinvenn.org', 'non-portal joinvenn tag stripped');
select pg_temp.ok(public.email_key('a.b+x@gmail.com') = 'ab@gmail.com', 'gmail dots and tag stripped');
select pg_temp.ok(public.email_key('contact+portal-cohort@joinvenn.org') = 'contact+portal-cohort@joinvenn.org', 'portal test address keeps tag');
select pg_temp.ok(public.email_key(' Contact+Portal-Peer-A@JoinVenn.org ') = 'contact+portal-peer-a@joinvenn.org', 'portal pattern is case-insensitive and trimmed');
select pg_temp.ok(public.email_key('contact+portal-a@joinvenn.org') <> public.email_key('contact+portal-b@joinvenn.org'), 'portal addresses stay distinct');
select pg_temp.ok(public.email_key('contact+portal-a_b@joinvenn.org') = 'contact@joinvenn.org', 'near-miss (underscore) still stripped');
select pg_temp.ok(public.email_key('x+portal-a@joinvenn.org') = 'x@joinvenn.org', 'other local part stripped');
rollback;
