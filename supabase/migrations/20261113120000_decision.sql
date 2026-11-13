-- Per-cycle admissions outcome, readable in the table view (venn #1028), e.g. 'admitted fall 2026'.
alter table public.applications add column if not exists decision text;
