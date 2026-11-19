import type { APIRoute } from 'astro';
import { STUB_CONTACT } from '../../../lib/portal/rpc-adapter';

export const prerender = false;

// Fixture stand-in for peer-down: `?mutual=1` returns contact, `?fail=1` errors. 404 outside DEV.
export const POST: APIRoute = async ({ url }) => {
  if (!import.meta.env.DEV) return new Response(null, { status: 404 });
  if (url.searchParams.get('fail')) return new Response(null, { status: 502 });
  await new Promise((r) => setTimeout(r, 300));
  return Response.json({ contact: url.searchParams.get('mutual') ? STUB_CONTACT : null });
};
