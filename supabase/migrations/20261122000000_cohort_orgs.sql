-- "N orgs in this cohort" for the Cohort page (venn-site #119). RLS hides other Applicants' results, so a
-- security-definer count behind ownership of one's own result. Additive; returns a number only.
create function public.cohort_org_count(p_result_id bigint) returns int
language plpgsql stable security definer set search_path = '' as $$
declare v_cohort bigint; n int;
begin
  if not public.portal_owns_result(p_result_id) then
    raise exception 'result not found' using errcode = '42501';
  end if;
  select cohort_id into v_cohort from public.results where id = p_result_id;
  if v_cohort is null then return null; end if;
  select count(*) into n from public.results r where r.cohort_id = v_cohort and r.outcome = 'cohort' and r.status = 'approved';
  return n;
end $$;
revoke execute on function public.cohort_org_count(bigint) from public, anon;
grant execute on function public.cohort_org_count(bigint) to authenticated, service_role;
