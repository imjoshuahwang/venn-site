import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseArgs, pickRows, render, linkFor, firstName, sendOne, run, FROM, REPLY_TO } from './send-results.mjs';

const template = readFileSync(new URL('../../supabase/templates/results-ready.html', import.meta.url), 'utf8');
const row = (id, email, is_test = false, name = 'Ada Lovelace') => ({ id, applications: { name, email, is_test } });

test('dry run is the default; --send and --to parse', () => {
  assert.deepEqual(parseArgs([]), { send: false, to: null, test: false });
  assert.deepEqual(parseArgs(['--send', '--to', 'A@x.com, b@y.com']), { send: true, to: ['a@x.com', 'b@y.com'], test: false });
  assert.equal(parseArgs(['--test']).test, true);
  assert.throws(() => parseArgs(['--to']));
  assert.throws(() => parseArgs(['--nope']));
});

test('test applicants are skipped unless named with --to', () => {
  const rows = [row(1, 'real@x.com'), row(2, 'contact+portal-josh@joinvenn.org', true)];
  assert.deepEqual(pickRows(rows, null).map((r) => r.id), [1]);
  assert.deepEqual(pickRows(rows, ['contact+portal-josh@joinvenn.org']).map((r) => r.id), [2]);
});

test('email is human: one pill, one link, first name, no postal address', () => {
  const { html, text } = render(template, { name: 'Ada <b>Lovelace', link: linkFor('H', 'invite') });
  assert.equal((html.match(/<a /g) ?? []).length, 1);
  assert.equal((html.match(/border-radius:999px/g) ?? []).length, 1);
  assert.match(html, /Hi Ada,/);
  assert.match(html, /Sign in at joinvenn\.org/);
  assert.match(html, /token_hash=H&amp;type=invite&amp;next=\/portal\/set-password/);
  assert.match(text, /results are out/);
  assert.doesNotMatch(html + text, /\b(Street|Ave|CA 9\d{4})\b|{{/);
  assert.equal(firstName(''), 'there');
});

function fakeSb({ claimed }) {
  const calls = [];
  const chain = (t, op) => ({ eq() { return this; }, is() { return this; }, select: async () => ({ data: claimed ? [{ id: 1 }] : [], error: null }), then: (f) => f({ error: null }) });
  return { calls, from: (t) => ({ update: (v) => { calls.push([t, v]); return chain(t, 'update'); }, insert: async (v) => { calls.push([t, 'insert']); return { error: null }; } }),
    auth: { admin: { generateLink: async () => ({ data: { user: { id: 'u' }, properties: { hashed_token: 'tok' } }, error: null }) } } };
}

test('a row someone else already claimed is never sent', async () => {
  let n = 0;
  const r = await sendOne({ allowlist: '*', sb: fakeSb({ claimed: false }), row: row(1, 'a@x.com'), template, from: 'f', resendKey: 'k', fetchImpl: async () => { n++; return { ok: true }; } });
  assert.equal(r, 'already'); assert.equal(n, 0);
});

test('a failed send releases the claim', async () => {
  const sb = fakeSb({ claimed: true });
  await assert.rejects(sendOne({ allowlist: '*', sb, row: row(1, 'a@x.com'), template, from: 'f', resendKey: 'k', fetchImpl: async () => ({ ok: false, status: 500, text: async () => 'no' }) }));
  assert.equal(sb.calls.at(-1)[1].emailed_at, null);
});

test('--test never picks a real applicant, even when --to names one', () => {
  const rows = [row(1, 'real@x.com'), row(2, 'imjoshuahwang+aws@gmail.com', true), row(3, 'imjoshuahwang+peer@gmail.com', true)];
  assert.deepEqual(pickRows(rows, null, true).map((r) => r.id), [2, 3]);
  assert.deepEqual(pickRows(rows, ['real@x.com'], true), []);
  assert.deepEqual(pickRows(rows, ['real@x.com', 'imjoshuahwang+aws@gmail.com'], true).map((r) => r.id), [2]);
});

test('mail goes From the verified domain with Reply-To contact@joinvenn.org', async () => {
  let body;
  await sendOne({ allowlist: '*', sb: fakeSb({ claimed: true }), row: row(1, 'a@x.com'), template, from: FROM, resendKey: 'k', fetchImpl: async (_u, o) => { body = JSON.parse(o.body); return { ok: true }; } });
  assert.equal(REPLY_TO, 'contact@joinvenn.org');
  assert.equal(body.reply_to, 'contact@joinvenn.org');
  assert.match(body.from, /<hello@vennstudentorgs\.com>$/);
});

test('missing student key: nothing sent, fetch never called, claim never taken', async () => {
  const sb = fakeSb({ claimed: true });
  let n = 0;
  const fetchImpl = async () => { n++; return { ok: true }; };
  await assert.rejects(sendOne({ allowlist: '*', sb, row: row(1, 'a@x.com'), template, from: FROM, resendKey: undefined, fetchImpl }), /STUDENT_RESEND_API_KEY/);
  await assert.rejects(run({ allowlist: '*', args: { send: true, to: null, test: false }, sb: { ...sb, from: () => ({ select: () => ({ eq() { return this; }, is() { return this; }, order() { return this; }, limit: async () => ({ data: [row(1, 'a@x.com')], error: null }) }) }) }, template, from: FROM, resendKey: '', log() {}, fetchImpl }), /STUDENT_RESEND_API_KEY/);
  assert.equal(n, 0);
  assert.equal(sb.calls.length, 0);
});

test('logs carry row id and resend_id but no applicant email', async () => {
  const sb = fakeSb({ claimed: true });
  const pending = [row(5, 'ada.secret@example.com')];
  const lines = [];
  const base = sb.from;
  const sbq = { ...sb, from: (t) => { const f = base(t); return { ...f, select: () => ({ eq() { return this; }, is() { return this; }, order() { return this; }, limit: async () => ({ data: pending, error: null }) }) }; } };
  const fetchImpl = async () => ({ ok: true, json: async () => ({ id: 're_abc' }) });
  await run({ allowlist: '*', args: { send: false, to: null, test: false }, sb: sbq, template, from: FROM, resendKey: 'k', log: (m) => lines.push(m) });
  await run({ allowlist: '*', args: { send: true, to: null, test: false }, sb: sbq, template, from: FROM, resendKey: 'k', log: (m) => lines.push(m), fetchImpl, sleep: async () => {} });
  const out = lines.join('\n');
  assert.doesNotMatch(out, /ada\.secret|@example\.com/);
  assert.match(out, /result 5 resend_id=re_abc/);
  assert.match(out, /sample for result 5/);
});

test('a failed send throws the status only, never the response body or an email', async () => {
  const sb = fakeSb({ claimed: true });
  await assert.rejects(
    sendOne({ allowlist: '*', sb, row: row(1, 'a@x.com'), template, from: FROM, resendKey: 'k', fetchImpl: async () => ({ ok: false, status: 422, text: async () => 'invalid to a@x.com' }) }),
    (e) => e.message === 'resend 422' && !e.message.includes('@'),
  );
});

test('429/5xx retries reuse the same Idempotency-Key; a 500 then 200 sends once with a plain-text part', async () => {
  const keys = []; const bodies = [];
  const answers = [{ ok: false, status: 500, text: async () => '' }, { ok: true, status: 200, json: async () => ({ id: 're_9' }) }];
  const slept = [];
  const r = await sendOne({ allowlist: '*', sb: fakeSb({ claimed: true }), row: row(1, 'a@x.com'), template, from: FROM, resendKey: 'k', sleep: async (ms) => { slept.push(ms); },
    fetchImpl: async (_u, o) => { keys.push(o.headers['Idempotency-Key']); bodies.push(JSON.parse(o.body)); return answers.shift(); } });
  assert.equal(r, 'sent');
  assert.equal(keys.length, 2); assert.equal(keys[0], keys[1]); assert.equal(slept.length, 1);
  assert.ok(bodies[1].text.includes('joinvenn.org')); assert.match(bodies[1].html, />Sign in at joinvenn\.org</);
});

test('three retries then give up: the claim is released', async () => {
  const sb = fakeSb({ claimed: true }); let n = 0;
  await assert.rejects(sendOne({ allowlist: '*', sb, row: row(1, 'a@x.com'), template, from: FROM, resendKey: 'k', sleep: async () => {}, fetchImpl: async () => { n++; return { ok: false, status: 429, text: async () => '' }; } }), /resend 429/);
  assert.equal(n, 4); assert.equal(sb.calls.at(-1)[1].emailed_at, null);
});

test('SEND_ALLOWLIST unset or not matching refuses before any claim, fetch or log of the address', async () => {
  let n = 0; const lines = [];
  const sb = { from() { n++; throw new Error('touched db'); } };
  const fetchImpl = async () => { n++; return { ok: true }; };
  assert.equal(await sendOne({ sb, row: row(1, 'refuse-check@example.com'), template, from: FROM, resendKey: 'k', fetchImpl }), 'not_allowlisted');
  assert.equal(await sendOne({ sb, row: row(1, 'refuse-check@example.com'), template, from: FROM, resendKey: 'k', allowlist: 'imjoshuahwang+*@gmail.com', fetchImpl }), 'not_allowlisted');
  assert.equal(n, 0);
  const sbq = { from: () => ({ select: () => ({ eq() { return this; }, is() { return this; }, order() { return this; }, limit: async () => ({ data: [row(1, 'refuse-check@example.com')], error: null }) }) }) };
  const r = await run({ args: { send: true, to: null, test: false }, sb: sbq, template, from: FROM, resendKey: 'k', allowlist: 'imjoshuahwang+*@gmail.com', log: (m) => lines.push(m), fetchImpl, sleep: async () => {} });
  assert.deepEqual(r, { sent: 0, failed: 0, refused: 1 });
  assert.ok(lines.some((l) => l.includes('not_allowlisted')));
  assert.ok(!lines.join().includes('example.com'));
});
