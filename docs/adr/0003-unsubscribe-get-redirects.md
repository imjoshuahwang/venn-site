# 0003: Unsubscribe GET redirects, POST writes

Date: 2026-10-20. Status: accepted.

The `unsubscribe` edge function serves the List-Unsubscribe link in Venn's outreach email.

- GET never changes state. Mail scanners and link previewers fetch every link, so a GET that unsubscribed would
  unsubscribe people who never clicked. GET with a valid token 303s to `https://joinvenn.org/unsubscribe?e=..&t=..`.
- GET redirects instead of rendering a page because Supabase serves text/html from the default *.supabase.co
  domain as text/plain. The confirm page lives on the Astro site; its button does a fetch POST (CSP form-action
  is 'self', connect-src allows the Supabase origin).
- One-click per RFC 8058: POST with `List-Unsubscribe=One-Click` in the body writes an `unsubscribed` row to
  `rs_events` (event_id `unsub:<email>`, ignore-duplicates, so repeats are harmless). `verify_jwt = false`
  because mail clients send no JWT.
- Token: `base64url(HMAC-SHA256(key = RS_UNSUB_SECRET, msg = email.trim().toLowerCase()))`, url-safe alphabet, no
  padding. The Python sender in the venn repo signs the same way; a shared test vector sits in the handler test.
- Every invalid link gets the same 400 text, so the response leaks nothing about which part was wrong.
