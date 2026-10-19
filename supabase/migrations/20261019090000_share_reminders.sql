-- Share reminders. The 5h-left and 1h-left emails (sent by `venn remind-share --yes` in the venn repo) are stamped
-- per row before sending, so each goes out at most once. Anon has no table access, so only the service role writes them.
-- Also schedules the overdue sweeper (void_overdue_shares, 20261019080000_share_steps.sql) every 10 minutes.
-- Safe to re-run.

alter table public.applications
  add column if not exists remind5_at timestamptz,
  add column if not exists remind1_at timestamptz;

do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule(jobid) from cron.job where jobname = 'void_overdue_shares';
  perform cron.schedule('void_overdue_shares', '*/10 * * * *', 'select public.void_overdue_shares()');
exception when others then
  raise warning 'pg_cron not scheduled (%): call void_overdue_shares() from another scheduler', sqlerrm;
end $$;
