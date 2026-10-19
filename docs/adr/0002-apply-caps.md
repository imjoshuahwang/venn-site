# 0002: Apply caps, and what a capped student sees

Date: 2026-10-19. Status: accepted.

Limits stay as shipped in PR #18 (supabase/migrations/20261019050000_security.sql):

- Applications: 3 per inbox per day (dots and +tags count as one inbox), 30/min, 600/hour, 2000/day overall,
  40/hour per IP.
- apply_events: 80 per session, 600/min, 30000/day, pruned after 60 days.

Capped or invalid students see a specific, kind message instead of the generic error (`src/scripts/apply-errors.ts`,
`capMessage`): rate_email (check your inbox and spam), rate_ip (try again in an hour, or use phone data),
rate_global (wait a few minutes and tap Send again), plus name and email check failures.

Why: each insert triggers a Resend email, so caps protect the quota and the domain's reputation. The per-IP cap
means a school NAT can trip it; accepted, and the message tells the student how to get through.

Turnstile is deferred (needs keys and a widget). Revisit if the caps trip in real use.

Note: the global 2000/day exceeds a 100/day Resend free quota. The confirm sweeper retries unsent rows.
