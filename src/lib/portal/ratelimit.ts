import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Requests allowed per key in the window; the next one is limited. */
export const LIMIT = 5;
export const WINDOW_SECONDS = 15 * 60;

/** `hit` records one request and returns how many the key has made in the window, this one included. */
export interface Store { hit(key: string, windowSeconds: number): Promise<number> }

export function memoryStore(now: () => number = Date.now): Store {
  const hits = new Map<string, number[]>();
  return {
    async hit(key, windowSeconds) {
      const t = now();
      const live = (hits.get(key) ?? []).filter((x) => t - x < windowSeconds * 1000);
      live.push(t);
      hits.set(key, live);
      return live.length;
    },
  };
}

const hash = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 32);

/** Backed by the portal_rate_hit security-definer RPC. Keys are hashed, so no email or IP is stored. Fails open on error. */
export function rpcStore(supabase: Pick<SupabaseClient, 'rpc'>): Store {
  return {
    async hit(key, windowSeconds) {
      try {
        const { data, error } = await supabase.rpc('portal_rate_hit', { p_key: hash(key), p_window_seconds: windowSeconds });
        return error || typeof data !== 'number' ? 0 : data;
      } catch {
        return 0;
      }
    },
  };
}

export async function checkLimits(store: Store, action: string, who: { ip?: string; email?: string }): Promise<{ limited: boolean }> {
  const counts: number[] = [];
  if (who.ip) counts.push(await store.hit(`${action}:ip:${who.ip}`, WINDOW_SECONDS));
  const email = who.email?.trim().toLowerCase();
  if (email) counts.push(await store.hit(`${action}:email:${email}`, WINDOW_SECONDS));
  return { limited: counts.some((n) => n > LIMIT) };
}

export function clientIp(request: Request): string {
  const fwd = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return fwd || request.headers.get('x-real-ip')?.trim() || 'unknown';
}
