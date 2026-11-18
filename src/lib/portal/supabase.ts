import { createServerClient as createSsrClient, parseCookieHeader } from '@supabase/ssr';
import type { SupabaseClient, User } from '@supabase/supabase-js';

type Ctx = { cookies: import('astro').AstroCookies; request: Request };

export function createServerClient(Astro: Ctx): SupabaseClient {
  const url = import.meta.env.PUBLIC_SUPABASE_URL;
  const key = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
  const secure = import.meta.env.PROD || new URL(Astro.request.url).protocol === 'https:';
  return createSsrClient(url, key, {
    cookies: {
      getAll() {
        return parseCookieHeader(Astro.request.headers.get('cookie') ?? '').map((c) => ({ name: c.name, value: c.value ?? '' }));
      },
      setAll(list) {
        for (const { name, value, options } of list) {
          // Our flags go last: @supabase/ssr passes httpOnly: false in options, which used to win and left the
          // session readable by page scripts. maxAge/expires from options still apply (sign out sets maxAge 0).
          Astro.cookies.set(name, value, { ...options, httpOnly: true, secure, sameSite: 'lax', path: '/' });
        }
      },
    },
  });
}

/** Validated user (auth.getUser), or null. Skips the network when no auth cookie exists. Pass the request's own
 *  client so a token refresh happens once and the page goes on with the refreshed session. */
export async function getUser(Astro: Ctx, client?: SupabaseClient): Promise<User | null> {
  if (!/(^|;\s*)sb-[^=]*-auth-token/.test(Astro.request.headers.get('cookie') ?? '')) return null;
  const { data, error } = await (client ?? createServerClient(Astro)).auth.getUser();
  return error ? null : data.user;
}

const EMAIL_LINK_METHODS = new Set(['recovery', 'otp', 'magiclink']);

/** True when this session was opened from an emailed link (password reset) less than `maxAgeSec` ago.
 *  Reads the amr claim of a verified access token, so a cookie edit cannot fake it. */
export async function freshEmailLinkSession(client: SupabaseClient, maxAgeSec = 15 * 60): Promise<boolean> {
  try {
    const { data, error } = await client.auth.getClaims();
    if (error || !data) return false;
    const amr = (data.claims as { amr?: unknown }).amr;
    if (!Array.isArray(amr)) return false;
    const now = Date.now() / 1000;
    return amr.some((a) => {
      if (!a || typeof a !== 'object') return false;
      const { method, timestamp } = a as { method?: unknown; timestamp?: unknown };
      return typeof method === 'string' && EMAIL_LINK_METHODS.has(method)
        && typeof timestamp === 'number' && now - timestamp >= -60 && now - timestamp <= maxAgeSec;
    });
  } catch {
    return false;
  }
}
