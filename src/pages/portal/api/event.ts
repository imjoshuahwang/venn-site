import type { APIRoute } from 'astro';
import { portalEvent } from '../../../lib/portal/api.ts';
import { sameSite } from '../../../lib/portal/same-site.ts';
import { STEPS, type Step } from '../../../lib/portal/track.ts';

export const prerender = false;

export const POST: APIRoute = async ({ locals, request }) => {
  if (!sameSite(request)) return new Response(null, { status: 403 });
  if (!locals.user) return new Response(null, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!STEPS.includes(body?.step)) return new Response(null, { status: 400 });
  await portalEvent(locals.supabase, body.step as Step);
  return new Response(null, { status: 204 });
};
