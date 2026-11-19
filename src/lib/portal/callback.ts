import { createHash } from 'node:crypto';
import type { EmailOtpType, SupabaseClient } from '@supabase/supabase-js';
import { safeRedirect } from '../../scripts/portal/auth-errors.ts';

export const EXPIRED_PATH = '/portal/resend?expired=1';
const TYPES = ['invite', 'recovery', 'signup', 'magiclink', 'email', 'email_change'];

/**
 * Where to send the browser after an emailed link. A token is single-use: portal_consume_link (expires_at, used_at)
 * rejects a reused or expired one before GoTrue is asked, and GoTrue's own check is the backstop. Failures land on the friendly page.
 */
export async function handleCallback(url: URL, supabase: SupabaseClient): Promise<string> {
  const tokenHash = url.searchParams.get('token_hash');
  const code = url.searchParams.get('code');
  const type = url.searchParams.get('type') ?? '';
  const next = safeRedirect(url.searchParams.get('next'));

  if (tokenHash && TYPES.includes(type)) {
    const { data, error } = await supabase.rpc('portal_consume_link', { p_token_hash: createHash('sha256').update(tokenHash).digest('hex') });
    if (!error && data === false) return EXPIRED_PATH;
    const res = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as EmailOtpType });
    return res.error ? EXPIRED_PATH : next;
  }
  if (code) return (await supabase.auth.exchangeCodeForSession(code)).error ? EXPIRED_PATH : next;
  return EXPIRED_PATH;
}
