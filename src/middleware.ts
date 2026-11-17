import { defineMiddleware } from 'astro:middleware';
import { isPublicPortalPath, portalRewrite } from './lib/portal/host';
import { createServerClient, getUser } from './lib/portal/supabase';

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  const target = portalRewrite(context.url.host, pathname, import.meta.env.PORTAL_HOST);
  if (!target) return next();

  const done = (res: Response) => {
    res.headers.set('Cache-Control', 'private, no-store');
    res.headers.set('X-Robots-Tag', 'noindex');
    return res;
  };

  context.locals.supabase = createServerClient(context);
  context.locals.user = await getUser(context);

  if (!context.locals.user && !isPublicPortalPath(target)) {
    const next_ = encodeURIComponent(pathname + context.url.search);
    return done(context.redirect(`/portal/login?next=${next_}`, 302));
  }
  const res = target === pathname ? await next() : await context.rewrite(target);
  return done(res);
});
