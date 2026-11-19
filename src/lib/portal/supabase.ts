import { createServerClient as createSsrClient, parseCookieHeader } from '@supabase/ssr';
import type { SupabaseClient, User } from '@supabase/supabase-js';

type Ctx = { cookies: import('astro').AstroCookies; request: Request };

export function createServerClient(Astro: Ctx): SupabaseClient {
  const url = import.meta.env.PUBLIC_SUPABASE_URL;
  const key = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
  return createSsrClient(url, key, {
    cookies: {
      getAll() {
        return parseCookieHeader(Astro.request.headers.get('cookie') ?? '').map((c) => ({ name: c.name, value: c.value ?? '' }));
      },
      setAll(list) {
        for (const { name, value, options } of list) {
          Astro.cookies.set(name, value, { httpOnly: true, sameSite: 'lax', path: '/', ...options });
        }
      },
    },
  });
}

/** Validated user (auth.getUser), or null. Skips the network when no auth cookie exists. */
export async function getUser(Astro: Ctx): Promise<User | null> {
  if (!/(^|;\s*)sb-[^=]*-auth-token/.test(Astro.request.headers.get('cookie') ?? '')) return null;
  const { data, error } = await createServerClient(Astro).auth.getUser();
  return error ? null : data.user;
}
