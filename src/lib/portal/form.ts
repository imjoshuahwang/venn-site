import type { APIContext, AstroGlobal } from 'astro';
import { safeNext } from './host';

type Ctx = Pick<APIContext, 'request' | 'url'> | AstroGlobal;

/** POSTs must come from this origin. Cookies are SameSite=Lax too; this is the second lock. */
export function sameOrigin(ctx: Ctx): boolean {
  const origin = ctx.request.headers.get('origin');
  if (!origin) return ctx.request.headers.get('sec-fetch-site') !== 'cross-site';
  return origin === ctx.url.origin;
}

export async function formFields(ctx: Ctx): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  try {
    const f = await ctx.request.formData();
    for (const [k, v] of f.entries()) if (typeof v === 'string') out[k] = v.slice(0, 500);
  } catch { /* not a form */ }
  return out;
}

export const cleanEmail = (e: string | undefined) => (e ?? '').trim().toLowerCase();
export const validEmail = (e: string) => /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(e) && e.length <= 320;
export const MIN_PASSWORD = 8;

/** Where to land after sign in: a same-origin portal path, else /portal. */
export function landing(next: string | null | undefined): string {
  const n = next ? safeNext(next) : null;
  return n && n.startsWith('/portal') ? n : '/portal';
}

/** Auth emails link back here (Supabase PKCE). Must be in Supabase Auth > URL Configuration > Redirect URLs. */
export const callbackUrl = (ctx: Ctx, next = '/portal') =>
  `${ctx.url.origin}/portal/auth/callback?next=${encodeURIComponent(landing(next))}`;
