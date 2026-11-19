import type { SupabaseClient } from '@supabase/supabase-js';
import { checkLimits, clientIp, memoryStore, type Store } from '../../lib/portal/ratelimit.ts';
import { TURNSTILE_TEST, verifyTurnstile } from '../../lib/portal/turnstile.ts';

// Plain-language copy for Supabase Auth failures. Raw error text is never shown.
const GENERIC = 'Something went wrong. Email contact@joinvenn.org and we will sort it out.';

const BY_CODE: Record<string, string> = {
  invalid_credentials: "That email or password doesn't match. Check both and try again, or reset your password.",
  otp_expired: 'This link has expired or was already used. Request a new one below.',
  weak_password: 'Choose a password with at least 8 characters.',
  same_password: 'Choose a different password from your current one.',
  over_request_rate_limit: 'Too many tries. Wait a few minutes and try again.',
  over_email_send_rate_limit: 'Too many tries. Wait a few minutes and try again.',
};

export function authMessage(error: unknown): string {
  if (!error || typeof error !== 'object') return GENERIC;
  const { code, message, status } = error as { code?: string; message?: string; status?: number };
  if (code && BY_CODE[code]) return BY_CODE[code];
  if (status === 429) return BY_CODE.over_request_rate_limit;
  if (/invalid or has expired|expired|already been used/i.test(String(message ?? ''))) return BY_CODE.otp_expired;
  if (/invalid login credentials/i.test(String(message ?? ''))) return BY_CODE.invalid_credentials;
  return GENERIC;
}

export const TURNSTILE_MESSAGE = "We couldn't confirm you're a person. Refresh the page and try again.";
export const RATE_MESSAGE = 'Too many tries. Wait a few minutes and try again.';

type Action = 'login' | 'set-password' | 'reset' | 'resend';
export interface GuardDeps { form?: FormData; store?: Store; fetch?: any; secret?: string }

const fallbackStore = memoryStore();

/**
 * Pages call it before touching Supabase; a returned message stops the attempt.
 * Login, reset and resend need a Turnstile token (verified server-side); login, reset and resend are limited per IP and per email.
 */
export async function authGuard(action: Action, request: Request, deps: GuardDeps = {}): Promise<string | null> {
  if (action === 'set-password') return null;
  let form = deps.form;
  if (!form) { try { form = await request.clone().formData(); } catch { form = new FormData(); } }
  const ip = clientIp(request);
  const secret = deps.secret ?? process.env.TURNSTILE_SECRET_KEY ?? TURNSTILE_TEST.secretPass;
  const token = String(form.get('cf-turnstile-response') ?? '');
  if (!(await verifyTurnstile(token, secret, ip, deps.fetch))) return TURNSTILE_MESSAGE;
  const email = String(form.get('email') ?? '');
  const { limited } = await checkLimits(deps.store ?? fallbackStore, action, { ip, email });
  return limited ? RATE_MESSAGE : null;
}

/** Update the password, then sign out every other device; this one stays signed in. */
export async function changePassword(supabase: Pick<SupabaseClient, 'auth'>, password: string): Promise<unknown> {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return error;
  await supabase.auth.signOut({ scope: 'others' });
  return null;
}

/** `next` target after auth: same-origin absolute paths only, else /portal. */
export function safeRedirect(next: string | null | undefined): string {
  const n = typeof next === 'string' ? next : '';
  if (!n.startsWith('/') || n.startsWith('//') || /[\\\u0000-\u001f\u007f]/.test(n)) return '/portal';
  return n;
}

/** Status for a page that shows the guard's message: a rate limit is a 429, the rest render as usual. */
export function guardStatus(message: string): number {
  return message === RATE_MESSAGE ? 429 : 200;
}
