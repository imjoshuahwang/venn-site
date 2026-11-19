-- Guiding questions save (venn-site #133, epic #112). Additive: one nullable column, one function.
-- Decisions: only the lead (applicant) writes, like sign_mou; team members read through the existing guiding_answers_own policy.
-- Cutoff: cohorts.guiding_cutoff (kickoff) is the data source; null means always editable.
alter table public.cohorts add column if not exists guiding_cutoff timestamptz;

-- p_answers is a jsonb object of {goal|skills|availability: text}; every key is upserted in one transaction.
create function public.save_guiding_answers(p_result_id bigint, p_answers jsonb)
returns table (question text, answer text, updated_at timestamptz)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare r public.results%rowtype; c public.cohorts%rowtype; k text; v jsonb; t text;
begin
  if not public.portal_is_lead(p_result_id) then
    raise exception 'result not found' using errcode = '42501';
  end if;
  select * into r from public.results where id = p_result_id;
  if r.outcome <> 'cohort' or r.cohort_id is null then
    raise exception 'only a cohort result has guiding questions' using errcode = '22023';
  end if;
  select * into c from public.cohorts where id = r.cohort_id;
  if c.guiding_cutoff is not null and now() >= c.guiding_cutoff then
    raise exception 'guiding answers are closed' using errcode = '22023';
  end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' or p_answers = '{}'::jsonb then
    raise exception 'answers must be a non-empty object' using errcode = '22023';
  end if;
  for k, v in select * from jsonb_each(p_answers) loop
    if k not in ('goal', 'skills', 'availability') then
      raise exception 'unknown question %', k using errcode = '22023';
    end if;
    if jsonb_typeof(v) <> 'string' then
      raise exception 'answer must be text' using errcode = '22023';
    end if;
    t := btrim(v #>> '{}');
    if t = '' or char_length(t) > 1000 then
      raise exception 'answer must be 1 to 1000 characters' using errcode = '22023';
    end if;
    insert into public.guiding_answers as g (result_id, question, answer) values (p_result_id, k, t)
      on conflict (result_id, question) do update set answer = excluded.answer, updated_at = now();
  end loop;
  return query select g.question, g.answer, g.updated_at from public.guiding_answers g
    where g.result_id = p_result_id order by g.question;
end $$;

revoke execute on function public.save_guiding_answers(bigint, jsonb) from public, anon;
grant execute on function public.save_guiding_answers(bigint, jsonb) to authenticated, service_role;
