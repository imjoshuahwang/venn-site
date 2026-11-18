import { defineMiddleware } from 'astro:middleware';
import { isPublicPortalPath, portalRewrite, safeNext } from './lib/portal/host';
import { createServerClient, getUser } from './lib/portal/supabase';

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  const target = portalRewrite(context.url.host, pathname, import.meta.env.PORTAL_HOST ?? process.env.PORTAL_HOST);
  if (!target) return next();

  const done = (res: Response) => {
    res.headers.set('Cache-Control', 'private, no-store');
    res.headers.set('X-Robots-Tag', 'noindex');
    return res;
  };

  // Portal host short paths (/login, /auth/callback?code=...) move to their /portal path, like the vercel.json
  // redirect does in production. A rewrite() here dropped the query string (every auth link failed) and the POST.
  if (target !== pathname) {
    return done(new Response(null, { status: 307, headers: { Location: target + new URL(context.request.url).search } }));
  }

  context.locals.supabase = createServerClient(context);
  context.locals.user = await getUser(context, context.locals.supabase);

  if (!context.locals.user && !isPublicPortalPath(target)) {
    const n = safeNext(pathname + context.url.search);
    return done(context.redirect(n ? `/portal/login?next=${encodeURIComponent(n)}` : '/portal/login', 302));
  }
  return done(await next());
});
