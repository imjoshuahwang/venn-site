import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFlows, SUPABASE_BLOCK } from './flows.mjs';
import { parseCli } from './cli.mjs';
import { splitPending, assertTestAddress, shotPath, loadSeedLogin } from './portal.mjs';

const FLOWS = parseFlows('- name: a\n  on: /x\n  steps:\n    - goto /x\n- name: b\n  pending: 117\n  steps:\n    - goto /y\n- name: c\n  pending: 118\n  steps:\n    - goto /z\n');

test('parseFlows reads pending as a number', () => {
  assert.deepEqual(FLOWS.map((f) => f.pending), [undefined, 117, 118]);
});

test('splitPending: open issue stays pending, closed issue runs, no pending runs', async () => {
  const lookup = async (n) => (n === 117 ? 'OPEN' : 'CLOSED');
  const { run, skipped } = await splitPending(FLOWS, { lookup, env: {} });
  assert.deepEqual(run.map((f) => f.name), ['a', 'c']);
  assert.deepEqual(skipped.map((f) => [f.name, f.reason]), [['b', 'skipped (pending #117)']]);
});

test('splitPending: offline lookup stays pending, never runs', async () => {
  const lookup = async () => { throw new Error('offline'); };
  const { run, skipped } = await splitPending(FLOWS, { lookup, env: {} });
  assert.deepEqual(run.map((f) => f.name), ['a']);
  assert.deepEqual(skipped.map((f) => f.reason), ['skipped (pending #117)', 'skipped (pending #118)']);
});

test('QA_PENDING=run runs pending flows without asking gh', async () => {
  const lookup = async () => { throw new Error('should not be called'); };
  const { run, skipped } = await splitPending(FLOWS, { lookup, env: { QA_PENDING: 'run' } });
  assert.equal(run.length, 3);
  assert.equal(skipped.length, 0);
});

test('--flow filter narrows to one flow name', async () => {
  const { run } = await splitPending(FLOWS, { lookup: async () => 'CLOSED', env: {}, only: 'c' });
  assert.deepEqual(run.map((f) => f.name), ['c']);
});

test('--base-url is an alias for the positional base', () => {
  assert.equal(parseCli(['--base-url', 'http://localhost:8000/']).base, 'http://localhost:8000');
  assert.equal(parseCli(['http://x.test']).base, 'http://x.test');
});

test('supabase block: *.supabase.co aborted, local 127.0.0.1:54321 allowed', () => {
  assert.ok(SUPABASE_BLOCK.test('https://abc.supabase.co/auth/v1/token'));
  assert.ok(!SUPABASE_BLOCK.test('http://127.0.0.1:54321/auth/v1/token'));
});

test('assertTestAddress only accepts contact+portal-<slug>@joinvenn.org', () => {
  assert.doesNotThrow(() => assertTestAddress('contact+portal-t1@joinvenn.org'));
  assert.throws(() => assertTestAddress('a.b@example.org'), /contact\+portal-/);
});

test('shotPath is qa/portal-shots/<device>/<flow>-<step>.png', () => {
  assert.equal(shotPath('iPhone SE', 'auth-login', 'done'), 'qa/portal-shots/iphone-se/auth-login-done.png');
});

test('loadSeedLogin falls back to env when the #118 module is absent', async () => {
  const l = await loadSeedLogin({ env: { PORTAL_TEST_PASSWORD: 'pw' }, importer: async () => { throw new Error('nope'); } });
  assert.deepEqual(l, { email: 'contact+portal-t1@joinvenn.org', password: 'pw' });
});
