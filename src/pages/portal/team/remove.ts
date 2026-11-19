import type { APIRoute } from 'astro';
import { removeTeamMember } from '../../../lib/portal/api.ts';
import { sameSite } from '../../../lib/portal/same-site.ts';

export const prerender = false;

const back = (q: string) => new Response(null, { status: 303, headers: { location: `/portal/team?${q}` } });
const err = (m: string) => back('error=' + encodeURIComponent(m));

export const POST: APIRoute = async ({ locals, request }) => {
  if (!sameSite(request)) return new Response(null, { status: 403 });
  if (!locals.user) return new Response(null, { status: 401 });
  const id = Number((await request.formData().catch(() => new FormData())).get('member_id'));
  if (!Number.isInteger(id)) return err('Pick a member to remove.');
  try {
    const r = await removeTeamMember(locals.supabase, id);
    return r.error ? err(r.error.message) : back('removed=1');
  } catch {
    return err('Something went wrong. Try again.');
  }
};
