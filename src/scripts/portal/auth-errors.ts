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

/**
 * Hook point for #130 (Turnstile, rate limits). Pages call it before touching Supabase; return a message to stop the attempt.
 * Sprint 1: no-op.
 */
export async function authGuard(_action: 'login' | 'set-password' | 'reset', _request: Request): Promise<string | null> {
  return null;
}

/** `next` target after auth: same-origin absolute paths only, else /portal. */
export function safeRedirect(next: string | null | undefined): string {
  const n = typeof next === 'string' ? next : '';
  if (!n.startsWith('/') || n.startsWith('//') || /[\\\u0000-\u001f\u007f]/.test(n)) return '/portal';
  return n;
}
