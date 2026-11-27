import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import { sameSite } from '../../../../lib/portal/same-site.ts';
import { parentEmailDiffers, parseSignBody } from '../../../../lib/portal/minor-mou.ts';
import { sendParentLink } from '../../../../lib/portal/mail.ts';

export const prerender = false;
const json = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// POST {action:'sign', role, png, parentName?} | {action:'confirm'} | {action:'send', parentEmail}
export const POST: APIRoute = async ({ locals, request }) => {
  if (!sameSite(request)) return json(403);
  if (!locals.user) return json(401);
  const body = await request.json().catch(() => null);
  const sb = locals.supabase;
  if (body?.action === 'confirm') {
    const { error } = await sb.rpc('minor_mou_confirm');
    return json(error ? 400 : 200, error ? { error: 'Both signatures are needed first.' } : { ok: true });
  }
  if (body?.action === 'sign') {
    const b = parseSignBody(body);
    if (!b) return json(400, { error: 'That signature did not look right. Clear it and try again.' });
    const { error } = await sb.rpc('minor_mou_sign', { p_role: b.role, p_png: b.png, p_parent_name: b.parentName ?? null });
    return json(error ? 400 : 200, error ? { error: 'That did not save. Try again.' } : { ok: true });
  }
  if (body?.action === 'send') {
    const email = String(body.parentEmail ?? '').trim();
    if (!parentEmailDiffers(locals.user.email ?? '', email)) return json(400, { error: 'Use a parent or guardian email that is not your own.' });
    const svc = createClient(import.meta.env.PUBLIC_SUPABASE_URL, import.meta.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const { data: token, error } = await svc.rpc('request_parent_consent', { p_user_id: locals.user.id, p_parent_email: email });
    if (error || !token) return json(400, { error: 'We could not send that link.' });
    let sent = false;
    try { sent = await sendParentLink(email, `${new URL(request.url).origin}/portal/parent/${token}`); } catch { /* same error below */ }
    return json(sent ? 200 : 502, sent ? { ok: true } : { error: 'We could not send that link.' });
  }
  return json(400);
};
