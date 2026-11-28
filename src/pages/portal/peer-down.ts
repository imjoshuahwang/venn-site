import type { APIRoute } from 'astro';
import { peerDown, peerPass } from '../../lib/portal/rpc-adapter.ts';
import { sameSite } from '../../lib/portal/same-site.ts';

export const prerender = false;

export const POST: APIRoute = async ({ locals, request }) => {
  // Same-site only: a browser POST always sends Origin, so a missing or foreign one is refused before auth.
  if (!sameSite(request)) return new Response(null, { status: 403 });
  if (!locals.user) return new Response(null, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const id = Number(body?.matchId);
  if (!Number.isInteger(id)) return new Response(null, { status: 400 });
  try {
    if (body?.action === 'decline') {
      await peerPass(locals.supabase, id);
      return Response.json({ contact: null });
    }
    const contact = await peerDown(locals.supabase, id);
    return Response.json({ contact });
  } catch {
    return new Response(null, { status: 502 });
  }
};
