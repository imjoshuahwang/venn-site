import type { APIRoute } from 'astro';
import { addTeamMember } from '../../../lib/portal/api.ts';
import { sameSite } from '../../../lib/portal/same-site.ts';

export const prerender = false;

const back = (q: string) => new Response(null, { status: 303, headers: { location: `/portal/team?${q}` } });
const err = (m: string) => back('error=' + encodeURIComponent(m));

export const POST: APIRoute = async ({ locals, request }) => {
  if (!sameSite(request)) return new Response(null, { status: 403 });
  if (!locals.user) return new Response(null, { status: 401 });
  const email = String((await request.formData().catch(() => new FormData())).get('email') ?? '').trim().toLowerCase();
  if (!email) return err('Enter an email address.');
  try {
    const r = await addTeamMember(locals.supabase, email);
    return r.error ? err(r.error.message) : back('added=1');
  } catch {
    return err('Something went wrong. Try again.');
  }
};
