import type { APIRoute } from 'astro';
import { peerDown } from '../../lib/portal/rpc-adapter.ts';
import { sameSite } from '../../lib/portal/same-site.ts';

export const prerender = false;

export const POST: APIRoute = async ({ locals, request }) => {
  // Same-site only: a browser POST always sends Origin, so a missing or foreign one is refused before auth.
  if (!sameSite(request)) return new Response(null, { status: 403 });
  if (!locals.user) return new Response(null, { status: 401 });
  const id = Number((await request.json().catch(() => ({})))?.matchId);
  if (!Number.isInteger(id)) return new Response(null, { status: 400 });
  try {
    const contact = await peerDown(locals.supabase, id);
    return Response.json({ contact });
  } catch {
    return new Response(null, { status: 502 });
  }
};
