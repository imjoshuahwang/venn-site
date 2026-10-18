-- Instant confirmation email (venn#254). After each application insert, ping the send-confirmation Edge Function.
-- The shared secret lives in Vault as 'confirm_webhook_secret' (inserted out of band, never committed):
--   select vault.create_secret('<secret>', 'confirm_webhook_secret');
-- The trigger never blocks or fails the insert. Rows it misses are swept by `venn confirm`.
create extension if not exists pg_net;

create or replace function public.notify_send_confirmation() returns trigger
language plpgsql security definer set search_path = public, extensions
as $$
begin
  begin
    perform net.http_post(
      url := 'https://wirjadichvbmrqzamwtp.supabase.co/functions/v1/send-confirmation',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-webhook-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'confirm_webhook_secret' limit 1)),
      body := jsonb_build_object('type', 'INSERT', 'table', 'applications', 'record', jsonb_build_object('id', new.id)),
      timeout_milliseconds := 5000);
  exception when others then
    null;
  end;
  return new;
end $$;

revoke all on function public.notify_send_confirmation() from public, anon, authenticated;

drop trigger if exists applications_send_confirmation on public.applications;
create trigger applications_send_confirmation after insert on public.applications
  for each row execute function public.notify_send_confirmation();
