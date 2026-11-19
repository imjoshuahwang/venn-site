-- peer_matches.rematches check for 20261120000000_peer_matches_rematches.sql (venn-site #140). LOCAL db only; all rolls back.
begin;

do $$
declare
  c record; aa bigint; ab bigint; ra bigint; rb bigint; pm bigint; n int;
begin
  select data_type, is_nullable, column_default into c
    from information_schema.columns
    where table_schema = 'public' and table_name = 'peer_matches' and column_name = 'rematches';
  if c.data_type is distinct from 'integer' then raise exception 'peer_matches.rematches is not integer (got %)', c.data_type; end if;
  if c.is_nullable is distinct from 'NO' then raise exception 'peer_matches.rematches is nullable'; end if;
  if c.column_default is distinct from '0' then raise exception 'peer_matches.rematches default is not 0 (got %)', c.column_default; end if;

  insert into public.applications (role, name, email, working_on, source) values ('student', 'A', 'a@example.com', 'x', '/apply') returning id into aa;
  insert into public.applications (role, name, email, working_on, source) values ('student', 'B', 'b@example.com', 'x', '/apply') returning id into ab;
  insert into public.results (application_id, outcome) values (aa, 'peer') returning id into ra;
  insert into public.results (application_id, outcome) values (ab, 'peer') returning id into rb;
  insert into public.peer_matches (result_a, result_b) values (ra, rb) returning id into pm;
  select rematches into n from public.peer_matches where id = pm;
  if n <> 0 then raise exception 'new peer_matches row did not default rematches to 0'; end if;
  update public.peer_matches set rematches = rematches + 1 where id = pm;
  select rematches into n from public.peer_matches where id = pm;
  if n <> 1 then raise exception 'rematches did not increment'; end if;
end $$;

rollback;
