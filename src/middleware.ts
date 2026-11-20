import { defineMiddleware } from 'astro:middleware';
import { isPublicPortalPath, safeNext } from './lib/portal/host';
import { createServerClient, getUser } from './lib/portal/supabase';

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  if (pathname !== '/portal' && !pathname.startsWith('/portal/')) return next();

  const done = (res: Response) => {
    res.headers.set('Cache-Control', 'private, no-store');
    res.headers.set('X-Robots-Tag', 'noindex');
    return res;
  };

  context.locals.supabase = createServerClient(context);
  context.locals.user = await getUser(context);

  if (!context.locals.user && !isPublicPortalPath(pathname)) {
    const n = safeNext(pathname + context.url.search);
    return done(context.redirect(n ? `/portal/login?next=${encodeURIComponent(n)}` : '/portal/login', 302));
  }
  return done(await next());
});
