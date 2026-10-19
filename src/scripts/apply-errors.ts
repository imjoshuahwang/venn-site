// What the student sees when the apply RPC says no. Hints come from the caps in
// supabase/migrations/20261019050000_security.sql; see docs/adr/0002-apply-caps.md.
const CONNECTION = "Couldn't reach Venn. Check your connection and tap Send again. Your answers are still here.";
const GENERIC = 'Something went wrong. Email contact@joinvenn.org and we will sort it out.';

export function capMessage(status: number | undefined, body: string): string {
  if (!status || status >= 500) return CONNECTION;
  let hint = '';
  let text = String(body ?? '');
  try {
    const j = JSON.parse(text);
    if (j && typeof j === 'object') {
      hint = String(j.hint ?? '');
      text = `${j.message ?? ''} ${j.details ?? ''}`;
    }
  } catch { /* not JSON: match on the raw text */ }
  if (hint === 'rate_email') return 'You already applied with this email today. Check your inbox (and spam) for the link from Venn.';
  if (hint === 'rate_ip') return "Lots of people on your network applied in the last hour. Try again in an hour, or from your phone's data.";
  if (hint === 'rate_global') return 'Venn is getting a lot of applications right now. Wait a few minutes and tap Send again. Your answers are still here.';
  if (/applications_name_plain/.test(text)) return 'Please type just your name, with no links or symbols, and tap Send again.';
  if (/applications_email_shape|email looks invalid/.test(text)) return 'Check your email address for typos and tap Send again.';
  return GENERIC;
}
