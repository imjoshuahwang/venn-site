// /portal/dev/* is public only because every dev route 404s outside DEV (dev-gallery.test.ts).
const PUBLIC = ['/portal/login', '/portal/set-password', '/portal/reset', '/portal/resend', '/portal/logout'];

export function isPublicPortalPath(pathname: string): boolean {
  const p = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return PUBLIC.includes(p) || p === '/portal/dev' || p.startsWith('/portal/dev/') || p === '/portal/auth' || p.startsWith('/portal/auth/') || p.startsWith('/portal/parent/');
}

/** `?next=` value for the login redirect: same-origin paths only, else null. */
export function safeNext(pathAndSearch: string): string | null {
  if (!pathAndSearch.startsWith('/') || pathAndSearch.startsWith('//') || pathAndSearch.startsWith('/\\')) return null;
  return pathAndSearch;
}
