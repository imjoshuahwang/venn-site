import type { APIRoute } from 'astro';
import { sameOrigin } from '../../lib/portal/form';
export const prerender = false;

export const POST: APIRoute = async (ctx) => {
  if (!sameOrigin(ctx)) return new Response('Forbidden', { status: 403 });
  await ctx.locals.supabase.auth.signOut({ scope: 'local' });
  return ctx.redirect('/portal/login?m=out', 303);
};
export const GET: APIRoute = (ctx) => ctx.redirect('/portal', 303); // no sign-out by link
