import test from 'node:test';
import assert from 'node:assert/strict';
import { authGuard, guardStatus, RATE_MESSAGE, TURNSTILE_MESSAGE, changePassword } from './auth-errors.ts';
import { memoryStore, LIMIT } from '../../lib/portal/ratelimit.ts';
import { TURNSTILE_TEST } from '../../lib/portal/turnstile.ts';

const form = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
const req = (ip = '1.1.1.1') => new Request('http://x/portal/login', { method: 'POST', headers: { 'x-forwarded-for': ip } });
const cfOk = (async () => ({ ok: true, json: async () => ({ success: true }) })) as never;
const cfNo = (async () => ({ ok: true, json: async () => ({ success: false }) })) as never;

test('authGuard: missing or failed Turnstile blocks the attempt', async () => {
  const deps = { store: memoryStore(), fetch: cfNo, secret: TURNSTILE_TEST.secretFail, siteKey: 'site' };
  assert.equal(await authGuard('login', req(), { form: form({ email: 'a@x.org', 'cf-turnstile-response': 'tok' }), ...deps }), TURNSTILE_MESSAGE);
  assert.equal(await authGuard('login', req(), { form: form({ email: 'a@x.org' }), ...deps }), TURNSTILE_MESSAGE);
});
test('authGuard: passes with a good token, then 6th per IP gets the calm 429 message', async () => {
  const deps = { store: memoryStore(), fetch: cfOk, secret: TURNSTILE_TEST.secretPass, siteKey: 'site' };
  const f = form({ email: 'a@x.org', 'cf-turnstile-response': 'tok' });
  for (let i = 0; i < LIMIT; i++) assert.equal(await authGuard('login', req(), { form: f, ...deps }), null);
  assert.equal(await authGuard('login', req(), { form: f, ...deps }), RATE_MESSAGE);
});
test('authGuard: 6th per email limited from different IPs', async () => {
  const deps = { store: memoryStore(), fetch: cfOk, secret: TURNSTILE_TEST.secretPass, siteKey: 'site' };
  const f = form({ email: 'a@x.org', 'cf-turnstile-response': 'tok' });
  for (let i = 0; i < LIMIT; i++) assert.equal(await authGuard('resend', req(`2.2.2.${i}`), { form: f, ...deps }), null);
  assert.equal(await authGuard('resend', req('2.2.9.9'), { form: f, ...deps }), RATE_MESSAGE);
});
test('authGuard: set-password needs no Turnstile', async () => {
  const deps = { store: memoryStore(), fetch: cfNo, secret: TURNSTILE_TEST.secretFail, siteKey: 'site' };
  assert.equal(await authGuard('set-password', req(), { form: form({}), ...deps }), null);
});
test('password change signs out other sessions but keeps this device', async () => {
  const calls: any[] = [];
  const supabase = { auth: {
    updateUser: async (a: any) => { calls.push(['updateUser', a]); return { error: null }; },
    signOut: async (a: any) => { calls.push(['signOut', a]); return { error: null }; },
  } };
  assert.equal(await changePassword(supabase as never, 'newpassword1'), null);
  assert.deepEqual(calls, [['updateUser', { password: 'newpassword1' }], ['signOut', { scope: 'others' }]]);
});
test('failed password change does not sign anyone out', async () => {
  const calls: string[] = [];
  const supabase = { auth: {
    updateUser: async () => ({ error: { code: 'weak_password' } }),
    signOut: async () => { calls.push('signOut'); return { error: null }; },
  } };
  assert.deepEqual(await changePassword(supabase as never, 'x'), { code: 'weak_password' });
  assert.deepEqual(calls, []);
});

test('authGuard: reset is refused without a valid Turnstile token and accepted with one', async () => {
  const bad = { store: memoryStore(), fetch: cfNo, secret: TURNSTILE_TEST.secretFail, siteKey: 'site' };
  assert.equal(await authGuard('reset', req(), { form: form({ email: 'a@x.org', 'cf-turnstile-response': 'tok' }), ...bad }), TURNSTILE_MESSAGE);
  assert.equal(await authGuard('reset', req(), { form: form({ email: 'a@x.org' }), ...bad }), TURNSTILE_MESSAGE);
  const ok = { store: memoryStore(), fetch: cfOk, secret: TURNSTILE_TEST.secretPass, siteKey: 'site' };
  assert.equal(await authGuard('reset', req(), { form: form({ email: 'a@x.org', 'cf-turnstile-response': 'tok' }), ...ok }), null);
});

test('guardStatus: the rate-limit message is HTTP 429, everything else 200', () => {
  assert.equal(guardStatus(RATE_MESSAGE), 429);
  assert.equal(guardStatus(TURNSTILE_MESSAGE), 200);
  assert.equal(guardStatus(''), 200);
});

test('authGuard: no Turnstile secret skips verification (no token, no Cloudflare call) but rate limits still apply', async () => {
  const saved = process.env.TURNSTILE_SECRET_KEY;
  delete process.env.TURNSTILE_SECRET_KEY;
  let called = false;
  const spy = (async () => { called = true; return { ok: true, json: async () => ({ success: false }) }; }) as never;
  try {
    const deps = { store: memoryStore(), fetch: spy };
    for (let i = 0; i < LIMIT; i++) assert.equal(await authGuard('login', req(), { form: form({ email: 'a@x.org' }), ...deps }), null);
    assert.equal(await authGuard('login', req(), { form: form({ email: 'a@x.org' }), ...deps }), RATE_MESSAGE);
    assert.equal(called, false);
  } finally {
    if (saved !== undefined) process.env.TURNSTILE_SECRET_KEY = saved;
  }
});

test('authGuard: half-configured Turnstile (secret only, or site key only) skips verification', async () => {
  let called = false;
  const spy = (async () => { called = true; return { ok: true, json: async () => ({ success: false }) }; }) as never;
  const f = () => form({ email: 'a@x.org' });
  assert.equal(await authGuard('login', req(), { form: f(), store: memoryStore(), fetch: spy, secret: 's', siteKey: '' }), null);
  assert.equal(await authGuard('login', req(), { form: f(), store: memoryStore(), fetch: spy, secret: '', siteKey: 'site' }), null);
  assert.equal(called, false);
});
