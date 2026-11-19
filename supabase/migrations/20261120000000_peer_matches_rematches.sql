-- peer_matches.rematches (venn-site #140, for venn #1081 portal jobs): how many times this pair has been re-matched.
-- Additive only; existing table-level grants and RLS on peer_matches cover the new column.
alter table public.peer_matches add column if not exists rematches integer not null default 0;
