-- Red-team confirm: give the webhook call to send-confirmation 30s instead of 5s. The function claims the row
-- (confirmed_at) BEFORE calling Resend (DNS + 3 REST calls + up to two 10s Resend attempts). If pg_net hangs up
-- first and the runtime stops the request mid-flight, the row stays claimed with no email: no backfill picks it
-- up and the referral counts as verified. pg_net is async, so a longer timeout never slows the insert.
-- Same body as 20261018030000 except the timeout.
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
      timeout_milliseconds := 30000);
  exception when others then
    null;
  end;
  return new;
end $$;

