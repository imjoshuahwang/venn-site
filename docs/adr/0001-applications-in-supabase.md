# 0001: Applications go straight into Supabase

Date: 2026-10-16. Status: accepted.

The apply form posts directly to Supabase project `joinvenn` (ref wirjadichvbmrqzamwtp, us-west-1), table
`applications`, with the public anon key. RLS allows anon insert only, never select, so the key is safe to ship
(Vercel env vars `PUBLIC_SUPABASE_URL` / `PUBLIC_SUPABASE_ANON_KEY`, type config).

Why: Josh wanted submissions in a database, not Formspree. Vercel has no persistent disk, so a local SQLite file
would be wiped; hosted SQLite (Turso/Astro DB) would need an adapter, an API route and another account. Supabase was
already wired with zero server code. Formspree removed.

Open: no email alert on new applications yet. Read them in the Supabase dashboard table editor.
