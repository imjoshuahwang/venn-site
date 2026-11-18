const DEFAULT_PORTAL_HOST = 'portal.joinvenn.org';
const PUBLIC = ['/portal/login', '/portal/signup', '/portal/set-password', '/portal/reset', '/portal/logout', '/portal/demo'];
/** Build assets and public files stay at the root on the portal host. Mirrors the portal host redirect in vercel.json. */
const ASSET = /^\/(?:_astro|_vercel)\/|\.[a-z0-9]+$/i;

const bare = (h: string) => h.toLowerCase().replace(/:\d+$/, '');

/** Internal path to serve for (host, pathname), or null when the request is not portal traffic. */
export function portalRewrite(host: string, pathname: string, portalHost?: string): string | null {
  const isPortalHost = bare(host) === bare(portalHost || DEFAULT_PORTAL_HOST);
  const inPortal = pathname === '/portal' || pathname.startsWith('/portal/');
  if (isPortalHost) {
    if (inPortal) return pathname;
    if (ASSET.test(pathname)) return null;
    return pathname === '/' ? '/portal' : '/portal' + pathname;
  }
  return inPortal ? pathname : null;
}

export function isPublicPortalPath(pathname: string): boolean {
  const p = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return PUBLIC.includes(p) || p === '/portal/auth' || p.startsWith('/portal/auth/');
}

/** `?next=` value for the login redirect: same-origin paths only, else null. */
export function safeNext(pathAndSearch: string): string | null {
  if (!pathAndSearch.startsWith('/') || pathAndSearch.startsWith('//') || pathAndSearch.startsWith('/\\')) return null;
  // The URL parser drops tabs and newlines ("/\t/evil.com" becomes "//evil.com") and reads a backslash as "/".
  if (/[\u0000-\u001f\u007f\\]/.test(pathAndSearch)) return null;
  return pathAndSearch;
}
