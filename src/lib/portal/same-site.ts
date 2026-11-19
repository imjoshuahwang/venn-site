/** A browser POST always sends Origin; a missing, malformed or foreign one is not same-site. */
export function sameSite(request: Request): boolean {
  try { return new URL(request.headers.get('origin') ?? '').host === new URL(request.url).host; } catch { return false; }
}
