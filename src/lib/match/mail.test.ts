import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildIntro, buildNotice, buildRequest, firstName, matchToken, sendMail, tokenHash, type Templates } from './mail.ts';

const T = Object.fromEntries(['request', 'reminder', 'intro', 'declined', 'expired'].map((k) => [k, readFileSync(new URL(`../../../supabase/templates/match-${k}.html`, import.meta.url), 'utf8')])) as Templates;
const req = { matchId: 7, peerEmail: 'peer@example.com', peerName: 'riley chen', requesterName: 'Sam Lovelace', requesterOrg: 'Robotics <Club>', message: 'Hi <b>there</b>', token: 'tok' };
const noFetch = (async () => { throw new Error('called'); }) as unknown as typeof globalThis.fetch;
const envOf = (env: Record<string, string>) => (k: string) => env[k];

test('request carries first name, org and message, escaped; never the requester last name or any contact', () => {
  const m = buildRequest(T, 'request', { ...req });
  assert.deepEqual(m.to, ['peer@example.com']);
  assert.match(m.html, /Sam from Robotics &lt;Club&gt;/);
  assert.match(m.html, /Hi &lt;b&gt;there&lt;\/b&gt;/);
  assert.match(m.html, /https:\/\/joinvenn\.org\/intro\/tok"/);
  assert.match(m.html, /intro\/tok\?stop=1/);
  assert.doesNotMatch(m.html + m.text, /Lovelace|@|phone|birthday/i);
  assert.equal(m.idempotencyKey, 'match-request-7');
  assert.deepEqual(m.tags, [{ name: 'kind', value: 'match_request' }, { name: 'match_id', value: '7' }]);
});

test('reminder uses its own idempotency key and the same link', () => {
  const m = buildRequest(T, 'reminder', { ...req });
  assert.equal(m.idempotencyKey, 'match-reminder-7');
  assert.match(m.html, /intro\/tok"/);
});

test('intro: both students in To, no CC or BCC at all, no reply-to', () => {
  const m = buildIntro(T, { matchId: 7, a: { name: 'Alex Park', email: 'a@example.com' }, b: { name: 'Sam Lovelace', email: 's@example.com' } });
  assert.deepEqual(m.to, ['a@example.com', 's@example.com']);
  assert.equal('cc' in m, false);
  assert.equal('bcc' in m, false);
  assert.equal(m.reply_to, undefined);
  assert.doesNotMatch(m.html, /Park|Lovelace/);
});

test('declined and expired give no reason and a rematch button', () => {
  for (const k of ['declined', 'expired'] as const) {
    const m = buildNotice(T, k, { matchId: 3, email: 'r@example.com', name: 'Riley' });
    assert.match(m.html, /\/portal\/match/);
    assert.deepEqual(m.to, ['r@example.com']);
    assert.equal(m.idempotencyKey, `match-${k}-3`);
  }
});

test('firstName never returns a last name or odd text', () => {
  assert.equal(firstName('ada lovelace'), 'Ada');
  assert.equal(firstName('<script>'), 'there');
  assert.equal(firstName(null), 'there');
});

test('token is derived and stable, and only its hash is stored', async () => {
  const a = await matchToken('s', 7);
  assert.equal(a, await matchToken('s', 7));
  assert.notEqual(a, await matchToken('s', 8));
  assert.match(await tokenHash(a), /^[0-9a-f]{64}$/);
});

const mail = () => buildNotice(T, 'expired', { matchId: 1, email: 'contact+portal-x@joinvenn.org', name: 'Riley' });

test('kill switch unset sends nothing and never calls fetch', async () => {
  assert.deepEqual(await sendMail(mail(), { env: envOf({ STUDENT_RESEND_API_KEY: 'k' }), fetch: noFetch }), { sent: false, reason: 'disabled' });
});

test('is_test, non-allowlisted recipient and missing key all fail closed', async () => {
  const env = envOf({ MATCH_SENDS_ENABLED: '1', SEND_ALLOWLIST: 'contact+portal-*@joinvenn.org', STUDENT_RESEND_API_KEY: 'k' });
  assert.deepEqual(await sendMail(mail(), { env, fetch: noFetch, isTest: true }), { sent: false, reason: 'test' });
  const real = buildNotice(T, 'expired', { matchId: 1, email: 'kid@example.com', name: 'K' });
  assert.deepEqual(await sendMail(real, { env, fetch: noFetch }), { sent: false, reason: 'not_allowlisted' });
  assert.deepEqual(await sendMail(mail(), { env: envOf({ MATCH_SENDS_ENABLED: '1', SEND_ALLOWLIST: 'contact+portal-*@joinvenn.org' }), fetch: noFetch }), { sent: false, reason: 'no_key' });
});

test('send posts once with an idempotency key and the student key, and logs the id without the address', async () => {
  const calls: RequestInit[] = [];
  const logs: string[] = [];
  const fetch = (async (_u: string, init: RequestInit) => { calls.push(init); return new Response(JSON.stringify({ id: 'em_1' })); }) as unknown as typeof globalThis.fetch;
  const r = await sendMail(mail(), { env: envOf({ MATCH_SENDS_ENABLED: '1', SEND_ALLOWLIST: 'contact+portal-*@joinvenn.org', STUDENT_RESEND_API_KEY: 'k' }), fetch, log: (m) => logs.push(m) });
  assert.deepEqual(r, { sent: true, id: 'em_1' });
  const h = calls[0].headers as Record<string, string>;
  assert.equal(h['Idempotency-Key'], 'match-expired-1');
  assert.equal(h.Authorization, 'Bearer k');
  assert.equal(JSON.parse(calls[0].body as string).from, 'Venn <hello@vennstudentorgs.com>');
  assert.ok(logs.some((l) => l.includes('em_1')));
  assert.ok(!logs.join().includes('@'));
});

test('an intro with one non-allowlisted address sends to neither', async () => {
  const m = buildIntro(T, { matchId: 1, a: { name: 'A', email: 'contact+portal-a@joinvenn.org' }, b: { name: 'B', email: 'b@example.com' } });
  assert.deepEqual(await sendMail(m, { env: envOf({ MATCH_SENDS_ENABLED: '1', SEND_ALLOWLIST: 'contact+portal-*@joinvenn.org', STUDENT_RESEND_API_KEY: 'k' }), fetch: noFetch }), { sent: false, reason: 'not_allowlisted' });
});

test('SEND_ALLOWLIST unset refuses even a switched-on, keyed send', async () => {
  const env = envOf({ MATCH_SENDS_ENABLED: '1', STUDENT_RESEND_API_KEY: 'k' });
  assert.deepEqual(await sendMail(mail(), { env, fetch: noFetch }), { sent: false, reason: 'not_allowlisted' });
});
