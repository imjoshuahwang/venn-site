import type { APIRoute } from 'astro';
import type { EmailOtpType } from '@supabase/supabase-js';
import { landing } from '../../../lib/portal/form';
export const prerender = false;

// Every auth email and Google lands here. Turns the code (PKCE) or token_hash into a session cookie.
export const GET: APIRoute = async (ctx) => {
  const q = ctx.url.searchParams;
  const next = landing(q.get('next'));
  const sb = ctx.locals.supabase;
  const code = q.get('code');
  const tokenHash = q.get('token_hash');
  const type = q.get('type') as EmailOtpType | null;

  let ok = false;
  if (code) ok = !(await sb.auth.exchangeCodeForSession(code)).error;
  else if (tokenHash && type) ok = !(await sb.auth.verifyOtp({ token_hash: tokenHash, type })).error;

  if (!ok) return ctx.redirect('/portal/login?m=link', 303);
  return ctx.redirect(next, 303);
};
