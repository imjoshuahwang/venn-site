import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { verifyTurnstile } from './turnstile.ts';
import { checkLimits, type Store } from './ratelimit.ts';

export type Page =
  | { kind: 'open' | 'done'; firstName: string | null }
  | { kind: 'expired' | 'unknown' }
  | { kind: 'refused'; why: 'turnstile' | 'limited' };

const SHAPE = /^[A-Za-z0-9_-]{8,200}$/;
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');

async function call(sb: SupabaseClient, fn: string, token: string): Promise<Page> {
  const { data, error } = await sb.rpc(fn, { p_token_hash: tokenHash(token) });
  if (error) throw new Error(error.message);
  const row = (Array.isArray(data) ? data[0] : data) as { state?: string; first_name?: string | null } | null;
  const s = row?.state;
  if (s === 'open' || s === 'done') return { kind: s, firstName: row?.first_name ?? null };
  return { kind: s === 'expired' ? 'expired' : 'unknown' };
}

/** GET: reads only, so a mail scanner that opens the link changes nothing. */
export const loadNext = (sb: SupabaseClient, token: string): Promise<Page> => SHAPE.test(token) ? call(sb, 'next_cohort_by_token', token) : Promise.resolve({ kind: 'unknown' });

export type Deps = { sb: SupabaseClient; store: Store; ip: string; secret?: string; fetch?: Parameters<typeof verifyTurnstile>[3] };

/** POST: the one tap. The RPC is the gate (single row lock, second tap returns done again). */
export async function submitNext(token: string, d: Deps, response = ''): Promise<Page> {
  if (!SHAPE.test(token)) return { kind: 'unknown' };
  if (d.secret && !(await verifyTurnstile(response, d.secret, d.ip, d.fetch))) return { kind: 'refused', why: 'turnstile' };
  if ((await checkLimits(d.store, 'next', { ip: d.ip })).limited) return { kind: 'refused', why: 'limited' };
  return call(d.sb, 'next_cohort_opt_in', token);
}

export const COPY = {
  open: { h: 'Thanks for applying', p: "We had more applicants than spots this time. Tap below and we'll consider you for the next cohort.", b: 'Consider me for the next one' },
  done: { h: "You're on the list", p: "We'll write to you when the next cohort opens." },
  expired: { h: 'This link has expired', p: "Email us and we'll add you." },
  unknown: { h: 'This link is not valid', p: "Email us and we'll sort it out." },
} as const;

/** Dev only: fixture tokens `fixture-<state>` give the page data without a database. */
export function fixtureClient(token: string): SupabaseClient | null {
  const m = /^fixture-(open|done|expired|unknown)$/.exec(token);
  if (!m) return null;
  return { rpc: async (fn: string) => ({ data: [{ state: fn === 'next_cohort_opt_in' && m[1] === 'open' ? 'done' : m[1], first_name: m[1] === 'expired' || m[1] === 'unknown' ? null : 'Maya' }], error: null }) } as unknown as SupabaseClient;
}
