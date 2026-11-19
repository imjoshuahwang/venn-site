import { mailAllowed } from './resend.ts';

export async function sendParentLink(
  to: string,
  link: string,
  deps: { fetch?: typeof fetch; apiToken?: string; log?: (m: string) => void } = {},
): Promise<boolean> {
  if (!mailAllowed(to, '')) {
    (deps.log ?? console.log)(`parent mail skipped (not a test inbox): ${to}`);
    return false;
  }
  const res = await (deps.fetch ?? fetch)('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${deps.apiToken ?? process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'User-Agent': 'venn' },
    signal: AbortSignal.timeout(10000),
    body: JSON.stringify({ from: 'Venn <hello@joinvenn.org>', to, subject: 'Please review a Venn consent form', text: `Your child asked us to send you this link. It works once and expires in 72 hours.\n\n${link}` }),
  });
  return res.ok;
}
