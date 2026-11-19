import type { APIRoute } from 'astro';
import { STUB_GUIDING } from '../../../lib/portal/guiding';
import { validateGuiding, GUIDING_ERRORS } from '../../../data/guiding';

export const prerender = false;

// Fixture stand-in for /portal/guiding: `?fail=1` errors, `?fail=closed` returns the closed error. 404 outside DEV.
export const POST: APIRoute = async ({ url, request }) => {
  if (!import.meta.env.DEV) return new Response(null, { status: 404 });
  const fail = url.searchParams.get('fail');
  if (fail === 'closed') return Response.json({ error: 'closed', message: GUIDING_ERRORS.closed }, { status: 409 });
  if (fail) return Response.json({ error: 'failed', message: GUIDING_ERRORS.failed }, { status: 502 });
  const v = validateGuiding((await request.json().catch(() => ({})))?.answers);
  if (!v.ok) return Response.json({ error: v.code, message: GUIDING_ERRORS[v.code] }, { status: 400 });
  await new Promise((r) => setTimeout(r, 300));
  return Response.json({ answers: { ...STUB_GUIDING, ...v.answers } });
};
