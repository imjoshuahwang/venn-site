import test from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { loadIntro, submitIntro, tokenHash, COPY, type Deps } from './peer-page.ts';
import { memoryStore } from '../portal/ratelimit.ts';

const TOKEN = 'abcdefgh12345678';
const OPEN = { state: 'open', requester_first_name: 'Maya', requester_org: 'Lincoln', requester_region: 'California', message: 'hi', learn: 'x', expires_at: null };
const fake = (state: string, outcome = 'accepted') => {
  const calls: Array<[string, Record<string, unknown>]> = [];
  const sb = { rpc: async (fn: string, args: Record<string, unknown>) => { calls.push([fn, args]); return { data: fn === 'intro_by_token' ? [{ ...OPEN, state }] : [{ outcome }], error: null }; } };
  return { calls, sb: sb as never as Deps['sb'] };
};
const deps = (sb: Deps['sb'], extra: Partial<Deps> = {}): Deps => ({ sb, store: memoryStore(), ip: '1.1.1.1', ...extra });
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };

test('GET is read-only and sends only the token hash', async () => {
  const c = fake('open');
  const p = await loadIntro(c.sb, TOKEN);
  assert.equal(p.kind, 'open');
  assert.deepEqual(c.calls, [['intro_by_token', { p_token_hash: tokenHash(TOKEN) }]]);
  assert.ok(!JSON.stringify(c.calls).includes(TOKEN));
});

test('the open view carries no last name, email, phone, age or birthday fields', async () => {
  const p = await loadIntro(fake('open').sb, TOKEN);
  assert.ok(p.kind === 'open' && !Object.keys(p.view).some((k) => /last|email|phone|birth|(^|_)age(_|$)/.test(k)));
});

test('each state renders its own page', async () => {
  const seen = new Set<string>();
  for (const s of ['accepted', 'declined', 'expired', 'withdrawn', 'reported', 'unknown', 'approved']) {
    const p = await loadIntro(fake(s).sb, TOKEN);
    assert.equal(p.kind, 'state');
    if (p.kind === 'state') seen.add(COPY[p.state].h);
  }
  assert.equal(seen.size, 6); // approved falls back to the unknown page
  assert.equal((await loadIntro(fake('open').sb, 'short')).kind, 'state');
});

test('accept and decline call the RPC once with the action', async () => {
  for (const [action, outcome] of [['accept', 'accepted'], ['decline', 'declined']]) {
    const c = fake('open', outcome);
    const p = await submitIntro(TOKEN, fd({ action }), deps(c.sb));
    assert.deepEqual(p, { kind: 'state', state: outcome });
    assert.deepEqual(c.calls, [['intro_respond', { p_token_hash: tokenHash(TOKEN), p_action: action }]]);
  }
});

test('report and opt-out ask first, and change nothing until confirmed', async () => {
  for (const action of ['report', 'optout']) {
    const c = fake('open');
    assert.deepEqual(await submitIntro(TOKEN, fd({ action }), deps(c.sb)), { kind: 'confirm', action });
    assert.ok(c.calls.every(([fn]) => fn === 'intro_by_token'));
    const c2 = fake('open', action === 'report' ? 'reported' : 'declined');
    const p = await submitIntro(TOKEN, fd({ action, confirm: '1' }), deps(c2.sb));
    assert.equal(p.kind === 'state' && p.state, action === 'report' ? 'reported' : 'opted_out');
  }
});

test('an unknown action re-renders the page; a used or expired link shows its own state', async () => {
  assert.equal((await submitIntro(TOKEN, fd({ action: 'x' }), deps(fake('open').sb))).kind, 'open');
  const gone = await submitIntro(TOKEN, fd({ action: 'accept' }), deps(fake('open', 'expired').sb));
  assert.equal(gone.kind === 'state' && gone.state, 'expired');
});

test('Turnstile is enforced when a secret is set, and the limiter stops a flood', async () => {
  const c = fake('open');
  const no = await submitIntro(TOKEN, fd({ action: 'accept' }), deps(c.sb, { secret: 's', fetch: async () => ({ ok: true, json: async () => ({ success: false }) }) }));
  assert.deepEqual(no, { kind: 'refused', why: 'turnstile' });
  assert.equal(c.calls.length, 0);
  const d = deps(c.sb);
  let last;
  for (let i = 0; i < 7; i++) last = await submitIntro(TOKEN, fd({ action: 'decline' }), d);
  assert.deepEqual(last, { kind: 'refused', why: 'limited' });
});

test('opt-out on a link that is no longer open shows its real state, not Done', async () => {
  const c = fake('declined', 'declined');
  const p = await submitIntro(TOKEN, fd({ action: 'optout', confirm: '1' }), deps(c.sb));
  assert.deepEqual(p, { kind: 'state', state: 'declined' });
});

test('fixtures are reachable only behind import.meta.env.DEV', () => {
  const src = readFileSync(new URL('../../pages/intro/[token].astro', import.meta.url), 'utf8');
  const uses = src.split('\n').filter((l) => /fixtureClient\(/.test(l));
  assert.equal(uses.length, 1);
  assert.match(uses[0], /import\.meta\.env\.DEV\s*\?\s*fixtureClient\(/);
});

// Intro and decline mail after an answer (#270).
import templates from '../../../supabase/functions/match-sweep/templates.json' with { type: 'json' };
const target = (status: string) => ({ match_id: 7, status, requester_name: 'Maya Lee', requester_email: 'contact+portal-r@joinvenn.org', peer_name: 'Riley Cho', peer_email: 'contact+portal-p@joinvenn.org', is_test: false });
function mailed(status: string, outcome: string, o: { enabled?: boolean; markFails?: boolean; resend?: number } = {}) {
  const calls: Array<[string, Record<string, unknown>]> = [];
  const sent: Record<string, unknown>[] = [];
  const sb = { rpc: async (fn: string, args: Record<string, unknown>) => {
    calls.push([fn, args]);
    if (fn === 'intro_by_token') return { data: [{ ...OPEN, state: 'open' }], error: null };
    if (fn === 'match_mail_target') return { data: [target(status)], error: null };
    if (fn === 'match_mail_done') return { data: null, error: o.markFails ? { message: 'x' } : null };
    return { data: [{ outcome }], error: null };
  } };
  const f = (async (_u: string, init: RequestInit) => { sent.push({ ...JSON.parse(init.body as string), key: (init.headers as Record<string, string>)['Idempotency-Key'] }); return o.resend ? new Response('{}', { status: o.resend }) : new Response('{"id":"e1"}'); }) as unknown as typeof fetch;
  const vars: Record<string, string> = { STUDENT_RESEND_API_KEY: 'k', ...(o.enabled === false ? {} : { MATCH_SENDS_ENABLED: '1' }) };
  return { calls, sent, d: (extra: Partial<Deps> = {}): Deps => ({ sb: sb as never, store: memoryStore(), ip: '1.1.1.1', mail: { templates: templates as never, env: (k) => vars[k], fetch: f, log: () => {} }, ...extra }) };
}

test('accept sends one intro To both students, no CC, and marks it', async () => {
  const m = mailed('accepted', 'accepted');
  assert.deepEqual(await submitIntro(TOKEN, fd({ action: 'accept' }), m.d()), { kind: 'state', state: 'accepted' });
  assert.equal(m.sent.length, 1);
  assert.deepEqual(m.sent[0].to, ['contact+portal-r@joinvenn.org', 'contact+portal-p@joinvenn.org']);
  assert.ok(!('cc' in m.sent[0]) && !('bcc' in m.sent[0]));
  assert.equal(m.sent[0].key, 'match-intro-7');
  assert.ok(m.calls.some(([fn, a]) => fn === 'match_mail_done' && a.p_kind === 'intro'));
});

test('decline sends the kind decline to the requester only', async () => {
  const m = mailed('declined', 'declined');
  await submitIntro(TOKEN, fd({ action: 'decline' }), m.d());
  assert.deepEqual(m.sent.map((b) => [b.key, b.to]), [['match-declined-7', ['contact+portal-r@joinvenn.org']]]);
  assert.ok(m.calls.some(([fn, a]) => fn === 'match_mail_done' && a.p_kind === 'decline'));
});

test('kill switch off: the answer is saved, nothing is sent or marked', async () => {
  const m = mailed('accepted', 'accepted', { enabled: false });
  assert.deepEqual(await submitIntro(TOKEN, fd({ action: 'accept' }), m.d()), { kind: 'state', state: 'accepted' });
  assert.equal(m.sent.length, 0);
  assert.ok(!m.calls.some(([fn]) => fn === 'match_mail_done'));
});

test('a failed send never breaks the response and is not marked', async () => {
  const m = mailed('accepted', 'accepted', { resend: 500 });
  assert.deepEqual(await submitIntro(TOKEN, fd({ action: 'accept' }), m.d()), { kind: 'state', state: 'accepted' });
  assert.ok(!m.calls.some(([fn]) => fn === 'match_mail_done'));
});

test('a failed marker is retried and never resends; the page still answers', async () => {
  const m = mailed('accepted', 'accepted', { markFails: true });
  assert.deepEqual(await submitIntro(TOKEN, fd({ action: 'accept' }), m.d()), { kind: 'state', state: 'accepted' });
  assert.equal(m.sent.length, 1);
  assert.equal(m.calls.filter(([fn]) => fn === 'match_mail_done').length, 3);
});

test('report, opt-out and unconfirmed answers send nothing', async () => {
  const m = mailed('reported', 'reported');
  await submitIntro(TOKEN, fd({ action: 'report', confirm: '1' }), m.d());
  const g = mailed('expired', 'expired');
  await submitIntro(TOKEN, fd({ action: 'accept' }), g.d());
  assert.equal(m.sent.length + g.sent.length, 0);
  assert.ok(!g.calls.some(([fn]) => fn === 'match_mail_target'));
});
