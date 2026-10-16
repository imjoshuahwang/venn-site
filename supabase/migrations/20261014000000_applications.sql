create table public.applications (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  role text not null check (role in ('student', 'college_club', 'organization')),
  level text check (length(level) <= 300),
  building text check (length(building) <= 300),
  name text not null check (length(name) <= 200),
  email text not null check (length(email) <= 320),
  org text check (length(org) <= 300),
  link text check (length(link) <= 500),
  working_on text not null check (length(working_on) <= 5000),
  need text check (length(need) <= 5000),
  source text,
  status text not null default 'new'
);

-- The site posts with the anon key: it may insert, never read.
alter table public.applications enable row level security;
create policy "anon can apply" on public.applications for insert to anon with check (status = 'new');
