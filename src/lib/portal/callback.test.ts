import test from 'node:test';
import assert from 'node:assert/strict';
import { handleCallbackGet, handleCallbackPost, sameOrigin, EXPIRED_PATH, CONTINUE_OUTCOMES } from './callback.ts';
import { POST } from '../../pages/portal/auth/callback.ts';

// A fake link store: `live` is portal_link_live, `used` flips only when portal_consume_link runs.
const mk = (o: { live?: boolean; verifyError?: any; codeError?: any } = {}) => {
  const calls: string[] = [];
  const st = { used: false };
  return {
    calls, st,
    supabase: {
      rpc: async (fn: string) => {
        calls.push(fn);
        if (fn === 'portal_link_live') return { data: (o.live ?? true) && !st.used, error: null };
        st.used = true;
        return { data: true, error: null };
      },
      auth: {
        verifyOtp: async () => { calls.push('verifyOtp'); return { error: o.verifyError ?? null }; },
        exchangeCodeForSession: async () => { calls.push('code'); return { error: o.codeError ?? null }; },
      },
    } as never,
  };
};
const u = (q: string) => new URL('http://x/portal/auth/callback?' + q);
const f = (o: Record<string, string>) => { const d = new FormData(); for (const [k, v] of Object.entries(o)) d.set(k, v); return d; };
const body = { token_hash: 'abc', type: 'recovery', next: '/portal/set-password' };

test('GET on a live link renders the Continue form and touches nothing', async () => {
  const { supabase, calls, st } = mk();
  const r = await handleCallbackGet(u('token_hash=abc&type=recovery&next=/portal/set-password'), supabase);
  assert.ok('page' in r && r.page.includes('method="post"') && r.page.includes('Set your password') && r.page.includes('content="same-origin"'));
  assert.deepEqual(calls, []);
  assert.equal(st.used, false);
});
test('GET escapes the token into the form', async () => {
  const r = await handleCallbackGet(u('token_hash=%22%3E%3Cb%3E&type=invite'), mk().supabase);
  assert.ok('page' in r && !r.page.includes('"><b>'));
});
test('POST with a live link verifies first, consumes once, and goes to next', async () => {
  const { supabase, calls, st } = mk();
  assert.equal(await handleCallbackPost(f(body), supabase), '/portal/set-password');
  assert.deepEqual(calls, ['portal_link_live', 'verifyOtp', 'portal_consume_link']);
  assert.equal(st.used, true);
});
test('replay of a consumed link lands on the expired page without verifying again', async () => {
  const { supabase, calls } = mk();
  await handleCallbackPost(f(body), supabase);
  calls.length = 0;
  assert.equal(await handleCallbackPost(f(body), supabase), EXPIRED_PATH);
  assert.ok(!calls.includes('verifyOtp'));
});
test('verifyOtp failure leaves the link unused', async () => {
  const { supabase, st } = mk({ verifyError: { code: 'otp_expired', message: 'Token has expired or is invalid' } });
  assert.equal(await handleCallbackPost(f(body), supabase), EXPIRED_PATH);
  assert.equal(st.used, false);
});
test('POST with a bad type or no token goes to the expired page', async () => {
  assert.equal(await handleCallbackPost(f({ token_hash: 'abc', type: 'nope' }), mk().supabase), EXPIRED_PATH);
  assert.equal(await handleCallbackPost(f({ type: 'invite' }), mk().supabase), EXPIRED_PATH);
});
test('POST is only accepted from this origin', () => {
  const url = new URL('https://joinvenn.org/portal/auth/callback');
  assert.equal(sameOrigin('https://joinvenn.org', url), true);
  assert.equal(sameOrigin('null', url), false);
  assert.equal(sameOrigin('https://evil.example', url), false);
  assert.equal(sameOrigin(null, url), false);
});
test('route: a POST with a foreign Origin is 403 and leaves the link unused', async () => {
  const { supabase, calls, st } = mk();
  const post = (origin: string) => POST({
    request: new Request('https://joinvenn.org/portal/auth/callback', { method: 'POST', headers: { origin }, body: f(body) }),
    url: new URL('https://joinvenn.org/portal/auth/callback'), locals: { supabase }, redirect: (to: string, status: number) => new Response(null, { status, headers: { location: to } }),
  } as never) as Promise<Response>;
  assert.equal((await post('https://evil.example')).status, 403);
  assert.equal((await post('null')).status, 403);
  assert.deepEqual(calls, []);
  assert.equal(st.used, false);
  assert.equal((await post('https://joinvenn.org')).status, 303);
  assert.equal(st.used, true);
});
test('a failed consume after verifyOtp is logged without the token', async () => {
  const { supabase } = mk();
  (supabase as any).rpc = async (fn: string) => (fn === 'portal_link_live' ? { data: true, error: null } : { data: null, error: { message: 'boom' } });
  const logged: unknown[][] = [];
  const orig = console.error;
  console.error = (...a: unknown[]) => { logged.push(a); };
  try { assert.equal(await handleCallbackPost(f(body), supabase), '/portal/set-password'); } finally { console.error = orig; }
  assert.equal(logged.length, 1);
  assert.ok(!JSON.stringify(logged).includes('abc'));
});
test('failed code exchange and a bare callback both go to the expired page', async () => {
  assert.deepEqual(await handleCallbackGet(u('code=zzz'), mk({ codeError: { message: 'bad' } }).supabase), { redirect: EXPIRED_PATH });
  assert.deepEqual(await handleCallbackGet(u(''), mk().supabase), { redirect: EXPIRED_PATH });
});
test('expired page path is the resend page with a friendly flag', () => {
  assert.equal(EXPIRED_PATH, '/portal/resend?expired=1');
});

const page = async (q: string) => { const r = await handleCallbackGet(u(q), mk().supabase); assert.ok('page' in r); return r.page; };
test('Continue label follows the outcome, not one fixed string', async () => {
  assert.match(await page('token_hash=a&type=invite&next=/portal/set-password'), />Set your password</);
  assert.match(await page('token_hash=a&type=recovery&next=/portal/set-password'), />Set your password</);
  assert.match(await page('token_hash=a&type=magiclink&next=/portal'), />Open your portal</);
  assert.match(await page('token_hash=a&type=magiclink&next=/portal/result'), />See your result</);
  assert.match(await page('token_hash=a&type=magiclink&next=/portal/match'), />See your match</);
  for (const t of ['invite', 'recovery']) assert.ok(!(await page(`token_hash=a&type=${t}&next=/portal/set-password`)).includes('your result'));
});
test('outcomes are data: a registered outcome supplies its own label (for #279)', async () => {
  CONTINUE_OUTCOMES.unshift({ when: (_t, n) => n.startsWith('/portal/thanks'), label: 'Read your note' });
  try { assert.match(await page('token_hash=a&type=magiclink&next=/portal/thanks'), />Read your note</); }
  finally { CONTINUE_OUTCOMES.shift(); }
});
test('Continue page is branded and declares color-scheme', async () => {
  const p = await page('token_hash=a&type=recovery&next=/portal/set-password');
  assert.match(p, /color-scheme/);
  assert.match(p, /class="wordmark"[^>]*>Venn</);
});
