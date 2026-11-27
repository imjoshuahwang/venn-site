// Match mail (#251): request, reminder, joint intro, kind decline and expiry. Pure builders plus one fail-closed sender.
// Peer to peer: the recipient of a request is another Venn student. The request never carries the requester's email,
// phone, last name or birthday. The joint intro has both students in To and nothing else (no CC, no BCC).
import { mailAllowed } from '../portal/resend.ts';

export const SITE = 'https://joinvenn.org';
export const FROM = 'Venn <hello@vennstudentorgs.com>';
export const REPLY_TO = 'contact@joinvenn.org';

export type Kind = 'request' | 'reminder' | 'intro' | 'declined' | 'expired';
export type Templates = Record<Kind, string>;
export type Mail = { from: string; reply_to?: string; to: string[]; subject: string; html: string; text: string; idempotencyKey: string; tags: { name: string; value: string }[] };
export type Env = (name: string) => string | undefined;

export const matchSendsEnabled = (env: Env) => env('MATCH_SENDS_ENABLED') === '1';

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ESC[c]);

const NAME_RE = /^[\p{L}][\p{L}'-]{0,19}$/u;
/** First word of a name when it looks like a plain name, else "there". Never returns a last name. */
export function firstName(name: string | null | undefined): string {
  const w = (name ?? '').trim().split(/\s+/)[0] ?? '';
  if (!NAME_RE.test(w)) return 'there';
  const c = Array.from(w);
  return c[0].toUpperCase() + c.slice(1).join('');
}

/** Fill `{{ .Key }}` slots with HTML-escaped values. A slot with no value throws, so a typo never ships. */
export function fill(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{ \.(\w+) \}\}/g, (_, k: string) => {
    if (!(k in vars)) throw new Error(`template slot ${k} has no value`);
    return esc(vars[k]);
  });
}
const plain = (html: string) => html.replace(/<a [^>]*href="([^"]+)"[^>]*>([^<]*)<\/a>/g, '$2: $1').replace(/<\/(p|h1|blockquote)>/g, '\n\n').replace(/<[^>]+>/g, '')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\n{3,}/g, '\n\n').trim();

const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, '0')).join('');
/** The raw link token. Derived (not stored), so the reminder re-derives the same one: HMAC-SHA256(secret, match id), hex. */
export async function matchToken(secret: string, matchId: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`match:${matchId}`)));
}
/** What the database stores: sha-256 hex of the token. */
export async function tokenHash(token: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)));
}

const base = (kind: Kind, matchId: number, to: string[], subject: string, html: string): Mail => ({
  from: FROM, reply_to: REPLY_TO, to, subject, html, text: plain(html), idempotencyKey: `match-${kind}-${matchId}`,
  tags: [{ name: 'kind', value: `match_${kind}` }, { name: 'match_id', value: String(matchId) }],
});

export type RequestIn = { matchId: number; peerEmail: string; peerName: string | null; requesterName: string | null; requesterOrg: string | null; message: string; token: string };
/** Request (and reminder): to the peer. Carries first name, org and message only. */
export function buildRequest(t: Templates, kind: 'request' | 'reminder', i: RequestIn): Mail {
  const requester = firstName(i.requesterName);
  const html = fill(t[kind], {
    Name: firstName(i.peerName), Requester: requester, Org: i.requesterOrg?.trim() || 'their club', Message: i.message,
    Link: `${SITE}/intro/${i.token}`, StopLink: `${SITE}/intro/${i.token}?stop=1`,
  });
  return base(kind, i.matchId, [i.peerEmail], kind === 'request' ? `${requester} would like to connect` : `${requester} is still waiting`, html);
}

export type IntroIn = { matchId: number; a: { name: string | null; email: string }; b: { name: string | null; email: string } };
/** Joint intro: both students in To so replies stay in one thread. No CC, no BCC, not even Venn or a parent. */
export function buildIntro(t: Templates, i: IntroIn): Mail {
  const a = firstName(i.a.name), b = firstName(i.b.name);
  const m = base('intro', i.matchId, [i.a.email, i.b.email], `${a} and ${b}, meet`, fill(t.intro, { A: a, B: b }));
  delete m.reply_to; // a reply goes to both students
  return m;
}

export type NoticeIn = { matchId: number; email: string; name: string | null };
/** Kind decline or expiry, to the requester: no reason, a Rematch button. */
export function buildNotice(t: Templates, kind: 'declined' | 'expired', i: NoticeIn): Mail {
  const html = fill(t[kind], { Name: firstName(i.name), RematchLink: `${SITE}/portal/match` });
  return base(kind, i.matchId, [i.email], kind === 'declined' ? 'About your match' : 'Your match request closed', html);
}

export type SendDeps = { env: Env; fetch?: typeof fetch; log?: (m: string) => void; isTest?: boolean };
export type SendResult = { sent: true; id: string | null } | { sent: false; reason: 'disabled' | 'test' | 'not_allowed' | 'no_key' | 'failed' };

/** Fail closed: kill switch unset, test rows, non-allowlisted recipients (all of them), or a missing key send nothing. Never logs addresses. */
export async function sendMail(m: Mail, d: SendDeps): Promise<SendResult> {
  const log = d.log ?? console.log;
  if (!matchSendsEnabled(d.env)) return { sent: false, reason: 'disabled' };
  if (d.isTest) return { sent: false, reason: 'test' };
  const open = d.env('PORTAL_MAIL_OPEN');
  if (!m.to.every((e) => mailAllowed(e, open))) return { sent: false, reason: 'not_allowed' };
  const key = d.env('STUDENT_RESEND_API_KEY');
  if (!key) return { sent: false, reason: 'no_key' };
  const { idempotencyKey, ...body } = m;
  const res = await (d.fetch ?? fetch)('https://api.resend.com/emails', {
    method: 'POST', signal: AbortSignal.timeout(10000),
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'User-Agent': 'venn', 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(body),
  });
  if (!res.ok) { log(`match mail ${idempotencyKey} failed ${res.status}`); return { sent: false, reason: 'failed' }; }
  const id = ((await res.json().catch(() => ({}))) as { id?: string }).id ?? null;
  log(`match mail ${idempotencyKey} sent ${id}`);
  return { sent: true, id };
}
