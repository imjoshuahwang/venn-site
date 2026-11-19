import type { APIRoute } from 'astro';
import { peerDown } from '../../lib/portal/rpc-adapter.ts';

export const prerender = false;

export const POST: APIRoute = async ({ locals, request }) => {
  // Same-site only: a browser POST always sends Origin, so a missing or foreign one is refused before auth.
  let sameSite = false;
  try { sameSite = new URL(request.headers.get('origin') ?? '').host === new URL(request.url).host; } catch { /* malformed */ }
  if (!sameSite) return new Response(null, { status: 403 });
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
