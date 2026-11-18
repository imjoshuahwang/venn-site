import type { APIRoute } from 'astro';
import { callbackUrl } from '../../../lib/portal/form';
export const prerender = false;

// GET link (not a form) so the CSP form-action 'self' does not block the hop to Google.
export const GET: APIRoute = async (ctx) => {
  if (import.meta.env.PUBLIC_GOOGLE_AUTH !== '1') return ctx.redirect('/portal/login', 303);
  const { data, error } = await ctx.locals.supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: callbackUrl(ctx, ctx.url.searchParams.get('next') ?? '/portal'), skipBrowserRedirect: true },
  });
  if (error || !data.url) return ctx.redirect('/portal/login', 303);
  return ctx.redirect(data.url, 303);
};
