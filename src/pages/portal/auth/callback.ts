import type { APIRoute } from 'astro';
import type { EmailOtpType } from '@supabase/supabase-js';
import { safeRedirect } from '../../../scripts/portal/auth-errors';

export const prerender = false;

const TYPES = ['invite', 'recovery', 'signup', 'magiclink', 'email', 'email_change'];

// Invite and recovery links land here: token_hash (verifyOtp) or code (PKCE), then on to `next`.
export const GET: APIRoute = async ({ url, locals, redirect }) => {
  const tokenHash = url.searchParams.get('token_hash');
  const code = url.searchParams.get('code');
  const type = url.searchParams.get('type') ?? '';
  const next = safeRedirect(url.searchParams.get('next'));
  let failed = true;

  if (tokenHash && TYPES.includes(type)) {
    failed = !!(await locals.supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as EmailOtpType })).error;
  } else if (code) {
    failed = !!(await locals.supabase.auth.exchangeCodeForSession(code)).error;
  }
  return redirect(failed ? '/portal/reset?expired=1' : next, 303);
};
