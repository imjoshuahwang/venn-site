import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import { getConsentState } from '../../lib/portal/api.ts';
import { sendParentLink } from '../../lib/portal/mail.ts';
import { CONSENT_VERSION } from '../../data/consent.ts';

export const prerender = false;

export const POST: APIRoute = async ({ locals, request, redirect }) => {
  let sameSite = false;
  try { sameSite = new URL(request.headers.get('origin') ?? '').host === new URL(request.url).host; } catch { /* malformed */ }
  if (!sameSite) return new Response(null, { status: 403 });
  if (!locals.user) return new Response(null, { status: 401 });
  const email = String((await request.formData()).get('parent_email') ?? '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return redirect('/portal?parent=invalid', 303);
  const { data: state } = await getConsentState(locals.supabase, CONSENT_VERSION);
  if (!state?.minor) return new Response(null, { status: 403 });
  const svc = createClient(import.meta.env.PUBLIC_SUPABASE_URL, import.meta.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data: token, error } = await svc.rpc('request_parent_consent', { p_user_id: locals.user.id, p_parent_email: email });
  if (error || !token) return redirect('/portal?parent=error', 303);
  await sendParentLink(email, `${new URL(request.url).origin}/portal/parent/${token}`);
  return redirect('/portal?parent=sent', 303);
};
