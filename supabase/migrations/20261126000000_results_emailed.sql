-- When the "results are out" email went to this student (venn-site #185). Null = not emailed yet; the sender claims a row by setting it, so a rerun never double sends.
alter table public.results add column emailed_at timestamptz;
