import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dryRun, pickSamples, render } from './status-update.mjs';

const dir = new URL('../../supabase/templates/', import.meta.url);
const tpl = readFileSync(new URL('status-update.html', dir), 'utf8');
const preview = readFileSync(new URL('status-update.preview.html', dir), 'utf8');
const src = readFileSync(new URL('./status-update.mjs', import.meta.url), 'utf8');

const rows = [
  ...Array.from({ length: 4 }, (_, i) => ({ name: `Test ${i}`, email: `contact+portal-t${i}@joinvenn.org`, is_test: true })),
  ...Array.from({ length: 8 }, (_, i) => ({ name: `Real ${i}`, email: `real${i}@example.com`, is_test: false })),
];

test('test rows are excluded and samples cap at 5', () => {
  const s = pickSamples(rows, 99);
  assert.equal(s.length, 5);
  assert.ok(s.every((r) => r.is_test === false));
});

test('dry run sends nothing: throwing network stub is never reached', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('send attempted'); };
  try {
    const lines = [];
    const out = await dryRun({ fetchRows: async () => rows, log: (l) => lines.push(l), template: tpl });
    assert.equal(out.length, 5);
    assert.match(lines.at(-1), /nothing sent/);
  } finally { globalThis.fetch = realFetch; }
});

test('source has no Resend or Auth send calls and no network', () => {
  const code = src.replace(/^\s*\/\/.*$/gm, '');
  for (const bad of [/resend/i, /inviteUserByEmail/, /signInWithOtp/, /resetPasswordForEmail/, /auth\.admin/, /\bfetch\s*\(/, /nodemailer/i, /functions\.invoke/])
    assert.doesNotMatch(code, bad);
});

test('preview is the rendered template with link, ceremony, contact, no tagline', () => {
  assert.equal(preview, render(tpl, { name: 'Alex' }));
  assert.match(preview, /SAMPLE-SINGLE-USE/);
  assert.match(preview, /72 hours/);
  assert.match(preview, /ceremony/);
  assert.match(preview, /contact@joinvenn\.org/);
  assert.match(preview, /max-width:480px/);
  const words = preview.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
  assert.ok(words >= 90 && words <= 150, `word count ${words}`);
});
