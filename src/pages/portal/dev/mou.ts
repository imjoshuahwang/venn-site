import type { APIRoute } from 'astro';

export const prerender = false;

// Fixture stand-in for /portal/mou: `?fail=full|signed|not_owner|invalid|retry` returns that error kind. 404 outside DEV.
const STATUS: Record<string, number> = { full: 409, signed: 409, not_owner: 403, invalid: 400, retry: 502 };

export const POST: APIRoute = async ({ url, request }) => {
  if (!import.meta.env.DEV) return new Response(null, { status: 404 });
  const fail = url.searchParams.get('fail');
  if (fail) return Response.json({ error: fail }, { status: STATUS[fail] ?? 502 });
  await new Promise((r) => setTimeout(r, 300));
  const body = await request.json().catch(() => ({}));
  return Response.json({ signature: { typed_name: String(body?.name ?? 'Maya Lee').trim(), signed_at: new Date().toISOString() } });
};
