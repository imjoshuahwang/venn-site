import type { APIRoute } from 'astro';
import { callCeremonyRpc } from '../../../lib/portal/ceremony-data';

export const prerender = false;

const json = (body: object, status: number) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export const POST: APIRoute = async (Astro) => {
  const body = await Astro.request.json().catch(() => null);
  const id = Number(body?.id);
  if (!Astro.locals.user || !Number.isInteger(id) || !['viewed', 'finish'].includes(body?.action)) return json({ ok: false }, 400);
  const ok = await callCeremonyRpc(Astro, body.action, id).catch(() => false);
  return json({ ok }, ok ? 200 : 502);
};
