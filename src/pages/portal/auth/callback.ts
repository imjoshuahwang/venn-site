import type { APIRoute } from 'astro';
import type { EmailOtpType } from '@supabase/supabase-js';
import { landing } from '../../../lib/portal/form';
export const prerender = false;

const OTP_TYPES = new Set<EmailOtpType>(['signup', 'invite', 'magiclink', 'recovery', 'email_change', 'email']);
const SET_PASSWORD = '/portal/set-password';

// Every auth email and Google lands here. Turns the code (PKCE) or token_hash into a session cookie.
export const GET: APIRoute = async (ctx) => {
  const q = ctx.url.searchParams;
  let next = landing(q.get('next'));
  const sb = ctx.locals.supabase;
  const code = q.get('code');
  const tokenHash = q.get('token_hash');
  const rawType = q.get('type') as EmailOtpType | null;
  const type = rawType && OTP_TYPES.has(rawType) ? rawType : null;
  const flowId = q.get('sb_flow_id');

  if (code) {
    const { data, error } = await sb.auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined);
    if (error) {
      // Supabase confirms the address before it redirects here with a code. A missing PKCE verifier only means the
      // link was opened in another browser than the one that signed up, so the email is confirmed: say so.
      if (error.code === 'pkce_code_verifier_not_found' && next !== SET_PASSWORD) return ctx.redirect('/portal/login?m=confirmed', 303);
      return ctx.redirect('/portal/login?m=link', 303);
    }
    // auth-js returns redirectType 'recovery' (not in its types) for a code from resetPasswordForEmail.
    if ((data as { redirectType?: string | null }).redirectType === 'recovery') next = SET_PASSWORD;
  } else if (tokenHash && type) {
    const { error } = await sb.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) return ctx.redirect('/portal/login?m=link', 303);
    if (type === 'recovery') next = SET_PASSWORD;
  } else {
    return ctx.redirect('/portal/login?m=link', 303);
  }
  return ctx.redirect(next, 303);
};
