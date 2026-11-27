import { createHash } from 'node:crypto';
import type { EmailOtpType, SupabaseClient } from '@supabase/supabase-js';
import { safeRedirect } from '../../scripts/portal/auth-errors.ts';

export const EXPIRED_PATH = '/portal/resend?expired=1';
const TYPES = ['invite', 'recovery', 'signup', 'magiclink', 'email', 'email_change'];
const hashOf = (t: string) => createHash('sha256').update(t).digest('hex');
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** True when a POST comes from this site: the Continue page sends referrer-policy same-origin, so browsers send the exact Origin. */
export const sameOrigin = (origin: string | null, url: URL) => origin === url.origin;

/**
 * GET: never spends the link, because mail scanners open every URL before the student does. A token link renders a one-button
 * page whose same-origin POST does the real work; a PKCE code or a bare hit is handled as before.
 */
export async function handleCallbackGet(url: URL, supabase: SupabaseClient): Promise<{ page: string } | { redirect: string }> {
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type') ?? '';
  const code = url.searchParams.get('code');
  const next = safeRedirect(url.searchParams.get('next'));
  if (tokenHash && TYPES.includes(type)) return { page: continuePage(tokenHash, type, next) };
  if (code) return { redirect: (await supabase.auth.exchangeCodeForSession(code)).error ? EXPIRED_PATH : next };
  return { redirect: EXPIRED_PATH };
}

/**
 * POST: a link is single-use. portal_link_live rejects a reused or expired one before GoTrue is asked, verifyOtp is the real check,
 * and portal_consume_link marks the row used only after verifyOtp succeeded, so a failed verify leaves the link live.
 */
export async function handleCallbackPost(form: FormData, supabase: SupabaseClient): Promise<string> {
  const tokenHash = String(form.get('token_hash') ?? '');
  const type = String(form.get('type') ?? '');
  const next = safeRedirect(String(form.get('next') ?? ''));
  if (!tokenHash || !TYPES.includes(type)) return EXPIRED_PATH;
  const live = await supabase.rpc('portal_link_live', { p_token_hash: hashOf(tokenHash) });
  if (!live.error && live.data === false) return EXPIRED_PATH;
  const res = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as EmailOtpType });
  if (res.error) return EXPIRED_PATH;
  const consumed = await supabase.rpc('portal_consume_link', { p_token_hash: hashOf(tokenHash) });
  if (consumed.error) console.error('portal_consume_link failed after verifyOtp:', consumed.error.message);
  return next;
}

function continuePage(tokenHash: string, type: string, next: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="same-origin"><meta name="robots" content="noindex"><title>Continue | Venn</title>
<style>body{font:17px/1.5 system-ui,sans-serif;margin:0;padding:72px 16px;display:grid;justify-items:center}main{width:100%;max-width:26rem;display:grid;gap:16px}h1{font-size:1.75rem;letter-spacing:-.03em;margin:0}button{font:inherit;font-weight:600;min-height:52px;border:0;border-radius:999px;background:#000;color:#fff;cursor:pointer}</style></head>
<body><main><h1>Almost there</h1>
<form method="post" action="/portal/auth/callback"><input type="hidden" name="token_hash" value="${esc(tokenHash)}"><input type="hidden" name="type" value="${esc(type)}"><input type="hidden" name="next" value="${esc(next)}">
<button type="submit" style="width:100%">Continue to your result</button></form></main></body></html>`;
}
