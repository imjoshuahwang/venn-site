-- Intro and decline mail (#270): durable markers, the lookup the token page uses to mail right after an answer,
-- and a sweep that picks up whatever the page could not send. Intro = the peer accepted (the requester asked first).
alter table public.matches
  add column intro_mailed_at timestamptz,
  add column decline_mailed_at timestamptz;

-- Service only. Who to mail after the peer answered; contact details go to the mail sender, never to a page.
create function public.match_mail_target(p_token_hash text)
returns table (match_id bigint, status text, requester_name text, requester_email text, peer_name text, peer_email text, is_test boolean)
language sql stable security definer set search_path = '' as $$
  select m.id, m.status, qa.name, qa.email, pa.name, pa.email, (qa.is_test or pa.is_test)
  from public.matches m
  join public.results qr on qr.id = m.requester_result_id join public.applications qa on qa.id = qr.application_id
  join public.results pr on pr.id = m.peer_result_id join public.applications pa on pa.id = pr.application_id
  where p_token_hash is not null and m.token_hash = p_token_hash;
$$;
revoke all on function public.match_mail_target(text) from public, anon, authenticated;
grant execute on function public.match_mail_target(text) to service_role;

-- Adds 'intro' and 'decline', only inside the 20h Resend idempotency window, so a lost marker can never cause a second send.
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
  -- A decline after an opt-out is deliberately silent, so opt-outs (which also set declined) never reach the decline branch.
  return query
    select m.id, 'intro'::text from public.matches m
    where m.status = 'accepted' and m.intro_mailed_at is null and m.responded_at > now() - interval '20 hours';
  return query
    select m.id, 'decline'::text from public.matches m
    where m.status = 'declined' and m.request_mailed_at is not null and m.decline_mailed_at is null and m.responded_at > now() - interval '20 hours'
      and not exists (select 1 from public.match_events e where e.match_id = m.id and e.type = 'opted_out');
  -- Past the window: never sent (Resend would no longer dedupe), reported so the handler can log it once per run.
  return query
    select m.id, 'lapsed'::text from public.matches m
    where (m.status = 'accepted' and m.intro_mailed_at is null and m.responded_at <= now() - interval '20 hours')
       or (m.status = 'declined' and m.request_mailed_at is not null and m.decline_mailed_at is null and m.responded_at <= now() - interval '20 hours'
           and not exists (select 1 from public.match_events e where e.match_id = m.id and e.type = 'opted_out'));
end $$;

create or replace function public.match_mail_done(p_match_id bigint, p_kind text) returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_kind not in ('request', 'reminder', 'expiry', 'intro', 'decline') then raise exception 'unknown kind' using errcode = '22023'; end if;
  perform set_config('venn.actor', 'system', true);
  if p_kind = 'request' then update public.matches set request_mailed_at = coalesce(request_mailed_at, now()) where id = p_match_id;
  elsif p_kind = 'expiry' then update public.matches set expiry_mailed_at = coalesce(expiry_mailed_at, now()) where id = p_match_id;
  elsif p_kind = 'decline' then update public.matches set decline_mailed_at = coalesce(decline_mailed_at, now()) where id = p_match_id;
  elsif p_kind = 'intro' then
    update public.matches set intro_mailed_at = coalesce(intro_mailed_at, now()) where id = p_match_id;
    perform public.match_intro_sent(p_match_id);
  else
    update public.matches set reminder_mailed_at = coalesce(reminder_mailed_at, now()), reminded_at = coalesce(reminded_at, now()) where id = p_match_id;
    if not exists (select 1 from public.match_events e where e.match_id = p_match_id and e.type = 'reminded') then
      insert into public.match_events (match_id, type, actor) values (p_match_id, 'reminded', 'system');
    end if;
  end if;
end $$;
