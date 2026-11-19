import { test } from 'node:test';
import assert from 'node:assert/strict';
import { callCeremonyRpc, stubMode } from './ceremony-data.ts';

type Rpc = (n: string, a: object) => Promise<{ data: null; error: null | { message: string } }>;
const ctx = (rpc: Rpc) => ({ locals: { supabase: { rpc } }, cookies: { get: () => undefined, set: () => {} } }) as never;

test('viewed calls mark_viewed with p_result_id', async () => {
  const calls: [string, object][] = [];
  const ok = await callCeremonyRpc(ctx(async (n, a) => { calls.push([n, a]); return { data: null, error: null }; }), 'viewed', 7);
  assert.equal(ok, true);
  assert.deepEqual(calls, [['mark_viewed', { p_result_id: 7 }]]);
});

test('finish calls finish_ceremony with p_result_id', async () => {
  const calls: [string, object][] = [];
  await callCeremonyRpc(ctx(async (n, a) => { calls.push([n, a]); return { data: null, error: null }; }), 'finish', 9);
  assert.deepEqual(calls, [['finish_ceremony', { p_result_id: 9 }]]);
});

test('an rpc error returns false', async () => {
  assert.equal(await callCeremonyRpc(ctx(async () => ({ data: null, error: { message: 'x' } })), 'viewed', 1), false);
});

test('stub mode is off unless running locally (dev)', () => {
  process.env.PORTAL_STUB = 'cohort';
  assert.equal(stubMode({ dev: false }), null);
  assert.equal(stubMode({ dev: true }), 'cohort');
  delete process.env.PORTAL_STUB;
});
