-- Match mail (#251): durable "mail went out" markers so a failed send is retried by the sweep and never double-counted.
alter table public.matches
  add column request_mailed_at timestamptz,
  add column reminder_mailed_at timestamptz,
  add column expiry_mailed_at timestamptz;

-- Re-issuing the same hash is a no-op (the token is an HMAC of the match id), so a retry after a failed send works.
create or replace function public.match_issue_token(p_match_id bigint, p_token_hash text)
returns table (peer_email text, peer_first_name text, requester_first_name text, requester_org text, requester_region text,
               message text, learn text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare m public.matches;
begin
  perform set_config('venn.actor', 'venn', true);
  select * into m from public.matches where id = p_match_id for update;
  if m.id is null or m.status <> 'requested' or (m.token_hash is not null and m.token_hash <> p_token_hash) then raise exception 'cannot issue' using errcode = '22023'; end if;
  update public.matches set token_hash = p_token_hash where id = m.id;
  return query
  select pa.email, split_part(btrim(pa.name), ' ', 1), split_part(btrim(qa.name), ' ', 1), qa.org,
         nullif(concat_ws(', ', nullif(btrim(qa.state), ''), nullif(btrim(qa.country), '')), ''), m.message, m.learn, m.expires_at
  from public.results qr join public.applications qa on qa.id = qr.application_id,
       public.results pr join public.applications pa on pa.id = pr.application_id
  where qr.id = m.requester_result_id and pr.id = m.peer_result_id;
end $$;

-- Closes lapsed requests, then returns every mail still owed. Nothing is marked here: match_mail_done does that after the send.
create or replace function public.match_sweep() returns table (match_id bigint, action text) language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('venn.actor', 'system', true);
  update public.matches m set status = 'expired' where m.status = 'requested' and m.expires_at <= now();
  return query
    select m.id, 'remind'::text from public.matches m
    where m.status = 'requested' and m.request_mailed_at is not null and m.reminder_mailed_at is null
      and m.expires_at > now() and m.requested_at <= now() - interval '48 hours';
  return query
    select m.id, 'expire'::text from public.matches m
    where m.status = 'expired' and m.request_mailed_at is not null and m.expiry_mailed_at is null;
end $$;

create function public.match_mail_done(p_match_id bigint, p_kind text) returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_kind not in ('request', 'reminder', 'expiry') then raise exception 'unknown kind' using errcode = '22023'; end if;
  perform set_config('venn.actor', 'system', true);
  if p_kind = 'request' then update public.matches set request_mailed_at = coalesce(request_mailed_at, now()) where id = p_match_id;
  elsif p_kind = 'expiry' then update public.matches set expiry_mailed_at = coalesce(expiry_mailed_at, now()) where id = p_match_id;
  else
    update public.matches set reminder_mailed_at = coalesce(reminder_mailed_at, now()), reminded_at = coalesce(reminded_at, now()) where id = p_match_id;
    if not exists (select 1 from public.match_events e where e.match_id = p_match_id and e.type = 'reminded') then
      insert into public.match_events (match_id, type, actor) values (p_match_id, 'reminded', 'system');
    end if;
  end if;
end $$;
revoke all on function public.match_mail_done(bigint, text) from public, anon, authenticated;
grant execute on function public.match_mail_done(bigint, text) to service_role;
