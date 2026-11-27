import test from 'node:test';
import assert from 'node:assert/strict';
import { requestResend, RESEND_NOTICE, mailAllowed, signInLinkSender } from './resend.ts';

test('identical notice for known, unknown, and failing sends', async () => {
  const known = await requestResend('contact+portal-a@joinvenn.org', { send: async () => {}, floorMs: 0 });
  const unknown = await requestResend('contact+portal-nobody@joinvenn.org', { send: async () => { throw new Error('no user'); }, floorMs: 0 });
  const stranger = await requestResend('someone@gmail.com', { send: async () => { throw new Error('should not send'); }, floorMs: 0 });
  assert.equal(known, RESEND_NOTICE);
  assert.equal(unknown, RESEND_NOTICE);
  assert.equal(stranger, RESEND_NOTICE);
  assert.match(RESEND_NOTICE, /if you applied, it's on its way/i);
});
test('constant response time: every path waits for the floor', async () => {
  const floorMs = 80;
  const t = async (send: () => Promise<void>, email: string) => { const s = Date.now(); await requestResend(email, { send, floorMs }); return Date.now() - s; };
  const fast = await t(async () => {}, 'contact+portal-a@joinvenn.org');
  const none = await t(async () => { throw new Error('x'); }, 'contact+portal-b@joinvenn.org');
  const skipped = await t(async () => {}, 'someone@gmail.com');
  for (const ms of [fast, none, skipped]) assert.ok(ms >= floorMs - 5, `took ${ms}`);
});
test('mail only goes to test addresses unless opened', () => {
  assert.equal(mailAllowed('contact+portal-t1@joinvenn.org'), true);
  assert.equal(mailAllowed('real@school.edu'), false);
  assert.equal(mailAllowed('real@school.edu', '1'), true);
  assert.equal(mailAllowed('contact+portal-x@joinvenn.org.evil.com'), false);
});

test('an expired link sends a sign-in link, never a password reset', async () => {
  const calls: any[] = [];
  const sb = { auth: { signInWithOtp: async (a: any) => { calls.push(a); return {}; }, resetPasswordForEmail: async () => { calls.push('reset'); return {}; } } } as never;
  await signInLinkSender(sb, 'https://joinvenn.org')('a@b.co');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].email, 'a@b.co');
  assert.equal(calls[0].options.shouldCreateUser, false);
  assert.match(calls[0].options.emailRedirectTo, /^https:\/\/joinvenn\.org\/portal\/auth\/callback/);
});
