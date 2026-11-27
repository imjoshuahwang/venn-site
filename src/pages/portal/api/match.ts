import type { APIRoute } from 'astro';
import { getMyMatch, getMyIncoming, matchAnswer, matchViewed, matchStep } from '../../../lib/portal/match-rpc.ts';
import { sameSite } from '../../../lib/portal/same-site.ts';

export const prerender = false;
const TYPES = ['stage_opened', 'wheel_done', 'card_opened'] as const;

// The match id comes from the session, never the client.
export const POST: APIRoute = async ({ locals, request }) => {
  if (!sameSite(request)) return new Response(null, { status: 403 });
  if (!locals.user) return new Response(null, { status: 401 });
  const body = await request.json().catch(() => null);
  try {
    if (body?.action === 'answer') {
      if (body.choice !== 'accept' && body.choice !== 'decline') return new Response(null, { status: 400 });
      // The match id comes from the session's own incoming ask, never the client.
      const inc = await getMyIncoming(locals.supabase);
      if (!inc) return new Response(null, { status: 404 });
      const outcome = await matchAnswer(locals.supabase, inc.match_id, body.choice);
      return new Response(JSON.stringify({ outcome }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    const m = await getMyMatch(locals.supabase);
    if (!m) return new Response(null, { status: 404 });
    if (body?.action === 'viewed') await matchViewed(locals.supabase, m.match_id);
    else if (body?.action === 'step' && TYPES.includes(body.type)) await matchStep(locals.supabase, m.match_id, body.type);
    else return new Response(null, { status: 400 });
  } catch { return new Response(null, { status: 500 }); }
  return new Response(null, { status: 204 });
};
