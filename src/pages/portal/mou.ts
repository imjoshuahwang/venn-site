import type { APIRoute } from 'astro';
import { signMou, portalEvent } from '../../lib/portal/api.ts';
import { mapMouError, validateMou, type MouErrorKind } from '../../data/mou.ts';

export const prerender = false;

const STATUS: Record<MouErrorKind, number> = { full: 409, signed: 409, not_owner: 403, invalid: 400, retry: 502 };

export const POST: APIRoute = async ({ locals, request }) => {
  // Same-site only: a browser POST always sends Origin, so a missing or foreign one is refused before auth.
  let sameSite = false;
  try { sameSite = new URL(request.headers.get('origin') ?? '').host === new URL(request.url).host; } catch { /* malformed */ }
  if (!sameSite) return new Response(null, { status: 403 });
  if (!locals.user) return new Response(null, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const id = Number(body?.resultId);
  const v = validateMou(body?.name, body?.agreed);
  if (!Number.isInteger(id) || !v.ok) return Response.json({ error: 'invalid' satisfies MouErrorKind }, { status: 400 });
  const { data, error } = await signMou(locals.supabase, id, v.name, true);
  if (error || !data) {
    const kind = mapMouError(error?.code);
    return Response.json({ error: kind }, { status: STATUS[kind] });
  }
  await portalEvent(locals.supabase, 'mou_signed');
  return Response.json({ signature: { typed_name: data.typed_name, signed_at: data.signed_at } });
};
