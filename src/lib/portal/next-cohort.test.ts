import test from 'node:test';
import assert from 'node:assert/strict';
import { loadNext, submitNext, tokenHash, COPY, type Deps } from './next-cohort.ts';
import { memoryStore } from './ratelimit.ts';

const TOKEN = 'abcdefgh12345678';
const fake = (state: string, name: string | null = 'Maya') => {
  const calls: Array<[string, Record<string, unknown>]> = [];
  const sb = { rpc: async (fn: string, args: Record<string, unknown>) => { calls.push([fn, args]); return { data: [{ state, first_name: name }], error: null }; } };
  return { calls, sb: sb as never as Deps['sb'] };
};
const deps = (sb: Deps['sb'], extra: Partial<Deps> = {}): Deps => ({ sb, store: memoryStore(), ip: '1.1.1.1', ...extra });

test('GET only reads, and sends the token hash, never the token', async () => {
  const c = fake('open');
  assert.deepEqual(await loadNext(c.sb, TOKEN), { kind: 'open', firstName: 'Maya' });
  assert.deepEqual(c.calls, [['next_cohort_by_token', { p_token_hash: tokenHash(TOKEN) }]]);
  assert.ok(!JSON.stringify(c.calls).includes(TOKEN));
});

test('done, expired and unknown each land on a kind page; odd tokens and states are unknown', async () => {
  assert.deepEqual(await loadNext(fake('done').sb, TOKEN), { kind: 'done', firstName: 'Maya' });
  assert.equal((await loadNext(fake('expired', null).sb, TOKEN)).kind, 'expired');
  assert.equal((await loadNext(fake('weird').sb, TOKEN)).kind, 'unknown');
  assert.equal((await loadNext(fake('open').sb, 'short')).kind, 'unknown');
  for (const k of ['open', 'done', 'expired', 'unknown'] as const) assert.ok(COPY[k].h);
});

test('POST opts in once through the RPC; a second tap gets done again', async () => {
  const c = fake('done');
  assert.deepEqual(await submitNext(TOKEN, deps(c.sb)), { kind: 'done', firstName: 'Maya' });
  assert.deepEqual(await submitNext(TOKEN, deps(c.sb)), { kind: 'done', firstName: 'Maya' });
  assert.deepEqual(c.calls.map((x) => x[0]), ['next_cohort_opt_in', 'next_cohort_opt_in']);
});

test('a bad Turnstile answer or too many taps changes nothing', async () => {
  const c = fake('done');
  const bad = await submitNext(TOKEN, deps(c.sb, { secret: 's', fetch: (async () => ({ ok: true, json: async () => ({ success: false }) })) as never }));
  assert.deepEqual(bad, { kind: 'refused', why: 'turnstile' });
  const d = deps(c.sb);
  let last;
  for (let i = 0; i < 7; i++) last = await submitNext(TOKEN, d);
  assert.deepEqual(last, { kind: 'refused', why: 'limited' });
  assert.equal(c.calls.length, 5);
});

test('copy has no jargon, dates or taglines', () => {
  const all = JSON.stringify(COPY);
  assert.doesNotMatch(all, /20\d\d|cohort Season|Program|Track/);
  assert.match(COPY.open.p, /spots/i);
});
