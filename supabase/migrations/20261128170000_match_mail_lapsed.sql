-- Lapsed intro/decline mail (#282): flag it once so a human resends with a fresh idempotency key.
alter table public.match_events drop constraint match_events_type_check;
alter table public.match_events add constraint match_events_type_check check (type in ('draft', 'approved', 'revealed', 'stage_opened', 'wheel_done', 'card_opened', 'compose_opened',
  'request_sent', 'reminded', 'accepted', 'declined', 'expired', 'withdrawn', 'reported', 'unmatched', 'intro_sent', 'opted_out', 'mail_lapsed'));

create function public.match_mail_lapsed(p_match_id bigint) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('venn.actor', 'system', true);
  if not exists (select 1 from public.match_events e where e.match_id = p_match_id and e.type = 'mail_lapsed') then
    insert into public.match_events (match_id, type, actor) values (p_match_id, 'mail_lapsed', 'system');
  end if;
end $$;
revoke all on function public.match_mail_lapsed(bigint) from public, anon, authenticated;
grant execute on function public.match_mail_lapsed(bigint) to service_role;
