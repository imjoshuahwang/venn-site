-- venn#397 G5: rs_events, the append-only log of what happened to a recipient's address (unsubscribed, bounced,
-- complained, delivered), so the ~/venn sender can stop mailing them.
-- Writers: edge functions only, via the service role (resend-webhook for Resend events, the unsubscribe path for
--   'unsub:<email>' rows). Dedupe is on event_id, so a retried webhook is a no-op.
-- Reader: the ~/venn sender's puller, service role, by id > last seen.
-- anon and authenticated get nothing: RLS on, no policies, and all privileges revoked.
create table if not exists public.rs_events (
  id bigint generated always as identity primary key,
  event_id text not null unique,  -- svix-id for webhook rows ('<svix-id>:<i>' for extra recipients); 'unsub:<email>' for unsubscribe rows
  email text not null,            -- trimmed, lowercased
  kind text not null check (kind in ('unsubscribed','bounced','complained','delivered')),
  source text not null check (source in ('unsubscribe','resend-webhook')),
  resend_email_id text,
  detail text,                    -- bounce type/subtype from Resend, else null
  at timestamptz not null default now()
);

alter table public.rs_events enable row level security;
revoke all on table public.rs_events from public, anon, authenticated;
revoke all on sequence public.rs_events_id_seq from public, anon, authenticated;
