-- One confirmation email per applicant (venn confirm); null = not sent yet.
alter table public.applications add column if not exists confirmed_at timestamptz;
