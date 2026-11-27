import { mailAllowed } from './resend.ts';

export async function sendParentLink(
  to: string,
  link: string,
  deps: { fetch?: typeof fetch; apiToken?: string; log?: (m: string) => void; sleep?: (ms: number) => Promise<void> } = {},
): Promise<boolean> {
  if (!mailAllowed(to, '')) {
    (deps.log ?? console.log)(`parent mail skipped (not a test inbox)`);
    return false;
  }
  const apiToken = deps.apiToken ?? process.env.STUDENT_RESEND_API_KEY;
  if (!apiToken) throw new Error('STUDENT_RESEND_API_KEY is not set: parent mail not sent');
  const send = () => (deps.fetch ?? fetch)('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json', 'User-Agent': 'venn' },
    signal: AbortSignal.timeout(10000),
    body: JSON.stringify({ from: 'Venn <hello@vennstudentorgs.com>', reply_to: 'contact@joinvenn.org', to, subject: 'Please review a Venn consent form', text: `Your child asked us to send you this link. It works once and expires in 72 hours.\n\n${link}` }),
  });
  // 429 and 5xx: retry up to 3 times with backoff. The consent link is single use, so a repeat mail is harmless.
  let res = await send();
  for (let i = 1; i <= 3 && (res.status === 429 || res.status >= 500); i++) {
    await (deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms))))(i * 1000);
    res = await send();
  }
  return res.ok;
}
