import type { APIRoute } from 'astro';
import { handleCallbackGet, handleCallbackPost, sameOrigin, EXPIRED_PATH } from '../../../lib/portal/callback';
import { portalEvent } from '../../../lib/portal/api.ts';

export const prerender = false;

// Invite and recovery links land here. GET only shows a Continue button (mail scanners prefetch links); the same-origin POST signs in once
// and goes on to `next`. A reused or expired link lands on the resend page.
export const GET: APIRoute = async ({ url, locals, redirect }) => {
  const r = await handleCallbackGet(url, locals.supabase);
  if ('redirect' in r) return redirect(r.redirect, 303);
  return new Response(r.page, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'same-origin' } });
};

export const POST: APIRoute = async ({ request, url, locals, redirect }) => {
  if (!sameOrigin(request.headers.get('origin'), url)) return new Response('Forbidden', { status: 403 });
  const to = await handleCallbackPost(await request.formData(), locals.supabase);
  if (to !== EXPIRED_PATH) await portalEvent(locals.supabase, 'link_opened');
  return redirect(to, 303);
};
