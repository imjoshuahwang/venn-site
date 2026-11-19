// Server-side Cloudflare Turnstile check. Cloudflare's documented TEST keys are the defaults until the real site key is unlocked.
export { TURNSTILE_TEST } from './turnstile-test-keys.ts';

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

type Fetch = (url: string, init: { method: string; body: URLSearchParams }) => Promise<{ ok: boolean; json(): Promise<{ success?: boolean }> }>;

/** True only when Cloudflare confirms the token. Any failure (no token, network, bad reply) is a no. */
export async function verifyTurnstile(token: string, secret: string, ip: string, fetchFn: Fetch = fetch as never): Promise<boolean> {
  if (!token) return false;
  const body = new URLSearchParams({ secret, response: token });
  if (ip && ip !== 'unknown') body.set('remoteip', ip);
  try {
    const res = await fetchFn(VERIFY_URL, { method: 'POST', body });
    if (!res.ok) return false;
    return (await res.json()).success === true;
  } catch {
    return false;
  }
}
