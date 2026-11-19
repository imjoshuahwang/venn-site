const DEFAULT_PORTAL_HOST = 'portal.joinvenn.org';
const PUBLIC = ['/portal/dev/result', '/portal/dev/peer-down', '/portal/dev/mou', '/portal/login', '/portal/set-password', '/portal/reset', '/portal/logout'];

const bare = (h: string) => h.toLowerCase().replace(/:\d+$/, '');

/** Internal path to serve for (host, pathname), or null when the request is not portal traffic. */
export function portalRewrite(host: string, pathname: string, portalHost?: string): string | null {
  const isPortalHost = bare(host) === bare(portalHost || DEFAULT_PORTAL_HOST);
  const inPortal = pathname === '/portal' || pathname.startsWith('/portal/');
  if (isPortalHost) {
    if (inPortal) return pathname;
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
  return pathAndSearch;
}
