import test from 'node:test';
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
