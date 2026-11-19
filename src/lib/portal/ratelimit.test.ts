import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryStore, rpcStore, checkLimits, LIMIT, clientIp } from './ratelimit.ts';

test('6th request per IP in the window is limited', async () => {
  const store = memoryStore();
  for (let i = 1; i <= LIMIT; i++) assert.equal((await checkLimits(store, 'login', { ip: '9.9.9.9' })).limited, false, `req ${i}`);
  assert.equal((await checkLimits(store, 'login', { ip: '9.9.9.9' })).limited, true);
  assert.equal((await checkLimits(store, 'login', { ip: '8.8.8.8' })).limited, false);
});
test('6th request per email is limited even from fresh IPs, case-insensitively', async () => {
  const store = memoryStore();
  for (let i = 0; i < LIMIT; i++) assert.equal((await checkLimits(store, 'resend', { ip: `10.0.0.${i}`, email: 'A@x.org' })).limited, false);
  assert.equal((await checkLimits(store, 'resend', { ip: '10.0.1.1', email: 'a@x.org' })).limited, true);
});
test('window expiry frees the key', async () => {
  let now = 0;
  const store = memoryStore(() => now);
  for (let i = 0; i < LIMIT + 1; i++) await checkLimits(store, 'login', { ip: '1.1.1.1' });
  now += 16 * 60 * 1000;
  assert.equal((await checkLimits(store, 'login', { ip: '1.1.1.1' })).limited, false);
});
test('rpc store calls the security-definer RPC with a hashed key', async () => {
  const calls: any[] = [];
  const supabase = { rpc: async (fn: string, args: any) => { calls.push([fn, args]); return { data: 1, error: null }; } };
  await checkLimits(rpcStore(supabase as never), 'login', { ip: '1.2.3.4', email: 'a@x.org' });
  assert.equal(calls.length, 2);
  assert.equal(calls[0][0], 'portal_rate_hit');
  for (const [, a] of calls) assert.doesNotMatch(a.p_key, /a@x\.org|1\.2\.3\.4/);
});
test('store failure fails open so a database blip does not lock everyone out', async () => {
  const supabase = { rpc: async () => ({ data: null, error: { message: 'down' } }) };
  assert.equal((await checkLimits(rpcStore(supabase as never), 'login', { ip: '1.2.3.4' })).limited, false);
});
test('clientIp prefers the first forwarded address', () => {
  assert.equal(clientIp(new Request('http://x', { headers: { 'x-forwarded-for': '5.5.5.5, 6.6.6.6' } })), '5.5.5.5');
  assert.equal(clientIp(new Request('http://x')), 'unknown');
});
