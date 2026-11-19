import test from 'node:test';
import assert from 'node:assert/strict';
import { handleCallback, EXPIRED_PATH } from './callback.ts';

const mk = (o: { consume?: boolean; verifyError?: any; codeError?: any } = {}) => {
  const calls: string[] = [];
  return {
    calls,
    supabase: {
      rpc: async (fn: string) => { calls.push(fn); return { data: o.consume ?? true, error: null }; },
      auth: {
        verifyOtp: async () => { calls.push('verifyOtp'); return { error: o.verifyError ?? null }; },
        exchangeCodeForSession: async () => { calls.push('code'); return { error: o.codeError ?? null }; },
      },
    } as never,
  };
};
const u = (q: string) => new URL('http://x/portal/auth/callback?' + q);

test('live link signs in once and goes to next', async () => {
  const { supabase, calls } = mk();
  assert.equal(await handleCallback(u('token_hash=abc&type=recovery&next=/portal/set-password'), supabase), '/portal/set-password');
  assert.deepEqual(calls, ['portal_consume_link', 'verifyOtp']);
});
test('reused link (already consumed in portal_links) lands on the friendly expired page without verifying', async () => {
  const { supabase, calls } = mk({ consume: false });
  assert.equal(await handleCallback(u('token_hash=abc&type=invite'), supabase), EXPIRED_PATH);
  assert.ok(!calls.includes('verifyOtp'));
});
test('expired link (GoTrue rejects) lands on the friendly expired page', async () => {
  const { supabase } = mk({ verifyError: { code: 'otp_expired', message: 'Token has expired or is invalid' } });
  assert.equal(await handleCallback(u('token_hash=abc&type=invite'), supabase), EXPIRED_PATH);
});
test('failed code exchange and a bare callback both go to the expired page', async () => {
  assert.equal(await handleCallback(u('code=zzz'), mk({ codeError: { message: 'bad' } }).supabase), EXPIRED_PATH);
  assert.equal(await handleCallback(u(''), mk().supabase), EXPIRED_PATH);
});
test('expired page path is the resend page with a friendly flag', () => {
  assert.equal(EXPIRED_PATH, '/portal/resend?expired=1');
});
