-- Dead addresses learned from Resend (venn confirm --sync-bounces). A row with email_status set is never mailed.
alter table public.applications add column if not exists email_status text check (email_status in ('bounced', 'complained'));
alter table public.applications add column if not exists bounced_at timestamptz;
