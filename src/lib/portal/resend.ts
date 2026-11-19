// Self-serve "email me a new link". The answer and the response time never depend on whether the email has an account.
export const RESEND_NOTICE = "If you applied, it's on its way. Check your inbox and spam in a minute or two.";
export const RESEND_FLOOR_MS = 700;

// Until Josh opens mail to real applicants, only contact+portal-*@joinvenn.org gets anything.
const TEST_ADDRESS = /^contact\+portal-[a-z0-9._-]+@joinvenn\.org$/i;

export function mailAllowed(email: string, open: string | undefined = process.env.PORTAL_MAIL_OPEN): boolean {
  return open === '1' || TEST_ADDRESS.test(email);
}

export async function requestResend(
  email: string,
  deps: { send: (email: string) => Promise<unknown>; floorMs?: number; open?: string },
): Promise<string> {
  const start = Date.now();
  const e = email.trim().toLowerCase();
  if (e && mailAllowed(e, deps.open)) {
    try { await deps.send(e); } catch { /* never reveal anything */ }
  }
  const wait = (deps.floorMs ?? RESEND_FLOOR_MS) - (Date.now() - start);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  return RESEND_NOTICE;
}
