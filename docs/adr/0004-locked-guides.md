# 0004: Locked guides, gated by an RPC

Date: 2026-11-11. Status: accepted. Extends ADR 0001 (no server code).

- The locked part of a guide lives only in Supabase (`guide_locked`), never in the repo's built HTML, the `.md` mirror or `llms-full.txt`.
- The gate is the RPC `unlock_guide(slug, email, thing, ref)`: security definer, anon-executable, validates, upserts `members` on (email, guide_slug), logs an `unlock` event and returns the html. The return is identical for new and existing emails (no member enumeration). Re-submits only update thing, ref and updated_at, never tier.
- `guide_event(event, slug, ref)` logs `guide_view` and `form_start` only, for known slugs.
- All four tables (`guide_locked`, `members`, `guide_events`, `guide_unlock_log`) have RLS on and no anon privileges. No server code.
- Caps (same spirit as ADR 0002): 5 unlocks per email per day (counted in `guide_unlock_log`), 2000 guide_events per slug per hour. Past a cap the RPC raises `rate_email` / `rate_slug`.

Known gaps, accepted (soft gate):
- No email verification: anyone can type any address and read the guide, and can enter someone else's address.
- No per-IP limit; the email cap is bypassed by varying addresses. Slug-wide event cap can be filled by a bot, which blocks logging, not unlocking.
- Anyone who unlocks can copy the body. This is a lead gate, not DRM.
