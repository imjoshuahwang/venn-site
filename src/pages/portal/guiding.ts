import type { APIRoute } from 'astro';
import { saveGuidingAnswers } from '../../lib/portal/guiding.ts';
import { validateGuiding, mapGuidingError, GUIDING_ERRORS } from '../../data/guiding.ts';

export const prerender = false;

const err = (status: number, code: keyof typeof GUIDING_ERRORS) => Response.json({ error: code, message: GUIDING_ERRORS[code] }, { status });

// POST { resultId, answers: {goal?, skills?, availability?} } -> { answers } (all saved answers) | { error, message }
export const POST: APIRoute = async ({ locals, request }) => {
  let sameSite = false;
  try { sameSite = new URL(request.headers.get('origin') ?? '').host === new URL(request.url).host; } catch { /* malformed */ }
  if (!sameSite) return new Response(null, { status: 403 });
  if (!locals.user) return new Response(null, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const id = Number(body?.resultId);
  const v = validateGuiding(body?.answers);
  if (!Number.isInteger(id) || !v.ok) return err(400, v.ok ? 'invalid' : v.code);
  try {
    return Response.json({ answers: await saveGuidingAnswers(locals.supabase, id, v.answers) });
  } catch (e) {
    const code = mapGuidingError(e as { code?: string; message?: string });
    return err(code === 'failed' ? 502 : code === 'forbidden' ? 403 : 409, code);
  }
};
