import type { APIRoute } from 'astro';
import { peerDown } from '../../lib/portal/rpc-adapter.ts';

export const prerender = false;

export const POST: APIRoute = async ({ locals, request }) => {
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
