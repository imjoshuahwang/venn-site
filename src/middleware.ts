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

  // Dev only: a live `venn_demo` session swaps in the in-memory fake. Dead-code eliminated from every build (G4).
  let demo = null;
  if (import.meta.env.DEV) {
    const m = await import('./lib/portal/demo/index.ts');
    const id = context.cookies.get('venn_demo')?.value;
    demo = id && m.getDemoSession(id) ? m.demoClientFor(id) : null;
    if (demo) context.locals.demo = true;
  }
  if (demo) {
    context.locals.supabase = demo as never;
    context.locals.user = (await demo.auth.getUser()).data.user;
  } else {
    context.locals.supabase = createServerClient(context);
    context.locals.user = await getUser(context);
  }

  // Dev only: `?stub=` fixtures (result.astro) render without a session. import.meta.env.DEV is false in every build.
  const devStub = import.meta.env.DEV && context.url.searchParams.has('stub');
  if (!context.locals.user && !devStub && !isPublicPortalPath(pathname)) {
    const n = safeNext(pathname + context.url.search);
    return done(context.redirect(n ? `/portal/login?next=${encodeURIComponent(n)}` : '/portal/login', 302));
  }
  return done(await next());
});
