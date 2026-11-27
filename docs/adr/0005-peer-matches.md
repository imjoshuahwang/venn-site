# 0005: Peer match data layer

Date: 2026-11-27. Status: accepted.

A student Venn already matched can ask another approved student for an intro (#245, contract #239). The data lives in four tables, `match_pool` (students offered as peers, with capacity and opt-out), `matches`, `match_events` (append-only funnel log) and `match_blocks` (pairs never matched again after a report), all behind RLS and security-definer functions.

Decisions. Minor means `applications.level = 'high_school'` (ADR 0004; there is no birthday column), and a minor is matched only with a minor. "Same cohort" is enforced as the same Season, because requesters have no cohort. Event actors are `student`, `peer`, `venn` and `system`. Raw tokens are never stored, only their sha-256 hashes; the sender derives the token, and how the reminder mail re-derives it is left to #251. Links last 72 hours and are single use, GET only reads and POST confirms. The other side's last name, email and phone are returned only once both have accepted, checked inside the database. Limits are 3 requests per Season, 2 per day, one open match per Season and 2 rematches.
