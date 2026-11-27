import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { introByToken, introRespond, type IntroView } from '../portal/match-rpc.ts';
import { verifyTurnstile } from '../portal/turnstile.ts';
import { buildIntro, buildNotice, sendThenMark, type Env, type Templates } from './mail.ts';
import { checkLimits, type Store } from '../portal/ratelimit.ts';

export type Action = 'accept' | 'decline' | 'report' | 'optout';
export type Outcome = 'accepted' | 'declined' | 'reported' | 'opted_out' | 'expired' | 'withdrawn' | 'unknown';
export type Page =
  | { kind: 'open'; view: IntroView }
  | { kind: 'confirm'; action: 'report' | 'optout' }
  | { kind: 'state'; state: Outcome }
  | { kind: 'refused'; why: 'turnstile' | 'limited'; view?: IntroView };

const ACTIONS: Action[] = ['accept', 'decline', 'report', 'optout'];
const STATES: Outcome[] = ['accepted', 'declined', 'reported', 'expired', 'withdrawn'];
const SHAPE = /^[A-Za-z0-9_-]{8,200}$/;

/** The database only ever sees this hash, never the token. */
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');

const stateOf = (s: string): Outcome => (STATES as string[]).includes(s) ? (s as Outcome) : 'unknown';

/** GET: reads only. A scanner that opens the link changes nothing. */
export async function loadIntro(sb: SupabaseClient, token: string): Promise<Page> {
  if (!SHAPE.test(token)) return { kind: 'state', state: 'unknown' };
  const view = await introByToken(sb, tokenHash(token));
  if (view?.state === 'open') return { kind: 'open', view };
  return { kind: 'state', state: stateOf(view?.state ?? 'unknown') };
}

export type MailDeps = { templates: Templates; env: Env; fetch?: typeof fetch; log?: (m: string) => void };
export type Deps = { sb: SupabaseClient; store: Store; ip: string; secret?: string; fetch?: Parameters<typeof verifyTurnstile>[3]; mail?: MailDeps };

type Target = { match_id: number; status: string; requester_name: string | null; requester_email: string; peer_name: string | null; peer_email: string; is_test: boolean };

/** After a peer answers: mail the intro (To both, no CC) or the kind decline. Best effort: a failure never touches the page,
 *  the match stays owed and the sweep retries it. Gated by MATCH_SENDS_ENABLED inside sendMail. */
export async function mailAfterAnswer(sb: SupabaseClient, token: string, action: 'accept' | 'decline', m: MailDeps): Promise<void> {
  try {
    const { data } = await sb.rpc('match_mail_target', { p_token_hash: tokenHash(token) });
    const t = (Array.isArray(data) ? data[0] : data) as Target | undefined;
    if (!t) return;
    const send = { env: m.env, fetch: m.fetch, log: m.log, isTest: t.is_test };
    const mark = (kind: string) => async () => !(await sb.rpc('match_mail_done', { p_match_id: t.match_id, p_kind: kind })).error;
    if (action === 'accept' && t.status === 'accepted') {
      await sendThenMark(buildIntro(m.templates, { matchId: t.match_id, a: { name: t.requester_name, email: t.requester_email }, b: { name: t.peer_name, email: t.peer_email } }), send, mark('intro'));
    } else if (action === 'decline' && t.status === 'declined') {
      await sendThenMark(buildNotice(m.templates, 'declined', { matchId: t.match_id, email: t.requester_email, name: t.requester_name }), send, mark('decline'));
    }
  } catch { (m.log ?? console.log)('match mail after answer failed'); }
}

/**
 * POST: accept and decline go straight through; report and opt-out first show a confirm page and act only when the confirm form comes back.
 * The RPC is the real gate (status, expiry, single use); the page only maps its answer to a calm screen.
 */
export async function submitIntro(token: string, form: FormData, d: Deps): Promise<Page> {
  if (!SHAPE.test(token)) return { kind: 'state', state: 'unknown' };
  const action = String(form.get('action') ?? '') as Action;
  if (!ACTIONS.includes(action)) return loadIntro(d.sb, token);
  if (d.secret && !(await verifyTurnstile(String(form.get('cf-turnstile-response') ?? ''), d.secret, d.ip, d.fetch))) return { kind: 'refused', why: 'turnstile' };
  if ((await checkLimits(d.store, 'intro', { ip: d.ip })).limited) return { kind: 'refused', why: 'limited' };
  if ((action === 'report' || action === 'optout') && form.get('confirm') !== '1') {
    const page = await loadIntro(d.sb, token);
    return page.kind === 'open' ? { kind: 'confirm', action } : page;
  }
  // The RPC returns early on a non-open match without setting opted_out_at, so "opted out" is claimed only when the link was open going in.
  const wasOpen = action === 'optout' && (await loadIntro(d.sb, token)).kind === 'open';
  const res = await introRespond(d.sb, tokenHash(token), action);
  const out = res?.outcome ?? 'unknown';
  if (d.mail && (action === 'accept' || action === 'decline') && out === (action === 'accept' ? 'accepted' : 'declined')) await mailAfterAnswer(d.sb, token, action, d.mail);
  if (out === 'declined' && wasOpen) return { kind: 'state', state: 'opted_out' };
  return { kind: 'state', state: stateOf(out) };
}

export const COPY: Record<Outcome, { h: string; p?: string }> = {
  accepted: { h: 'Accepted', p: 'We are emailing you both an introduction. If nothing arrives within an hour, check spam, then write to contact@joinvenn.org and we will connect you.' },
  declined: { h: 'Not now', p: 'Thanks for letting us know.' },
  reported: { h: 'Reported', p: 'Thank you. We will look into it.' },
  opted_out: { h: 'Done', p: 'You will not get more requests.' },
  expired: { h: 'This request expired' },
  withdrawn: { h: 'This request was withdrawn' },
  unknown: { h: 'This link is not valid' },
};

/** Dev only: fixture tokens `fixture-<state>` give the page data without a database. */
export function fixtureClient(token: string): SupabaseClient | null {
  const m = /^fixture-(open|accepted|declined|expired|withdrawn|reported|unknown)$/.exec(token);
  if (!m) return null;
  const view: IntroView = m[1] === 'open'
    ? { state: 'open', requester_first_name: 'Maya', requester_org: 'Lincoln High Robotics', requester_region: 'California, United States', message: 'I am building a tool for my robotics team and would love ten minutes with someone who has shipped one.', learn: 'How to get a first real user', expires_at: null }
    : { state: m[1] as IntroView['state'], requester_first_name: null, requester_org: null, requester_region: null, message: null, learn: null, expires_at: null };
  return { rpc: async (fn: string, args: { p_action?: string }) => ({ data: fn === 'intro_by_token' ? [view] : [{ outcome: args.p_action === 'accept' ? 'accepted' : 'declined' }], error: null }) } as unknown as SupabaseClient;
}
