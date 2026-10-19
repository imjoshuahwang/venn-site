// Can this domain receive mail? MX, else its A record (RFC 5321 5.1); a null MX ("." exchange) means no mail.
// Fails open: only a definite "no such records" answer blocks. A DNS timeout (one shared deadline of timeoutMs
// across the MX and A lookups), another error, or a missing resolver all send as before.
type Resolve = (domain: string, type: string) => Promise<any[]>;

export async function mailable(
  domain: string,
  resolve: Resolve | undefined = (globalThis as any).Deno?.resolveDns?.bind((globalThis as any).Deno),
  timeoutMs = 3000,
): Promise<boolean> {
  if (typeof resolve !== "function") return true;
  const TIMEOUT = Symbol("timeout");
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<typeof TIMEOUT>((res) => {
    timer = setTimeout(() => res(TIMEOUT), timeoutMs);
  });
  const look = (type: string) => Promise.race([resolve(domain, type), deadline]);
  try {
    try {
      const mx = await look("MX");
      if (mx === TIMEOUT) return true;
      if (mx.length) return mx.some((r) => r.exchange.replace(/\.$/, "") !== "");
    } catch (e: any) {
      if (e?.name !== "NotFound") return true;
    }
    try {
      const a = await look("A");
      return a === TIMEOUT ? true : a.length > 0;
    } catch (e: any) {
      return e?.name !== "NotFound";
    }
  } finally {
    clearTimeout(timer);
  }
}
