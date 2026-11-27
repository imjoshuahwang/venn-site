import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseArgs, pickRows, render, linkFor, firstName, sendOne } from './send-results.mjs';

const template = readFileSync(new URL('../../supabase/templates/results-ready.html', import.meta.url), 'utf8');
const row = (id, email, is_test = false, name = 'Ada Lovelace') => ({ id, applications: { name, email, is_test } });

test('dry run is the default; --send and --to parse', () => {
  assert.deepEqual(parseArgs([]), { send: false, to: null });
  assert.deepEqual(parseArgs(['--send', '--to', 'A@x.com, b@y.com']), { send: true, to: ['a@x.com', 'b@y.com'] });
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
  assert.match(html, /Sign in to your portal/);
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
  const r = await sendOne({ sb: fakeSb({ claimed: false }), row: row(1, 'a@x.com'), template, from: 'f', resendKey: 'k', fetchImpl: async () => { n++; return { ok: true }; } });
  assert.equal(r, 'already'); assert.equal(n, 0);
});

test('a failed send releases the claim', async () => {
  const sb = fakeSb({ claimed: true });
  await assert.rejects(sendOne({ sb, row: row(1, 'a@x.com'), template, from: 'f', resendKey: 'k', fetchImpl: async () => ({ ok: false, status: 500, text: async () => 'no' }) }));
  assert.equal(sb.calls.at(-1)[1].emailed_at, null);
});
