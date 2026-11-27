// #286: every mail template carries the one shared shell (dark mode, preheader, bulletproof button, plain fallback URL).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { render, PREHEADERS } from '../email/shell.mjs';

const dir = new URL('../../supabase/templates/', import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith('.html'));

test('templates exist and every one has a preheader entry', () => {
  assert.ok(files.length >= 16);
  for (const f of files) assert.ok(PREHEADERS[f.replace('.preview', '').replace('.html', '')], f);
});

for (const f of files) {
  test(`${f}: shared shell`, () => {
    const h = readFileSync(new URL(f, dir), 'utf8');
    assert.match(h, /<meta name="color-scheme" content="light dark">/);
    assert.match(h, /@media \(prefers-color-scheme: dark\)/);
    assert.match(h, /<div style="display:none[^"]*mso-hide:all">/);
    if (!/<a /.test(h)) return assert.equal(render(h, f.replace('.preview', '').replace('.html', '')), h, 'matches generator output');
    const btn = h.match(/<a class="btn" href="([^"]+)" style="[^"]*border:2px solid #111[^"]*"/);
    assert.ok(btn, 'bordered button');
    const url = btn[1];
    assert.match(h, /<p class="fb" style="[^"]*">/, 'fallback paragraph');
    assert.ok(h.split(/<p class="fb" style="[^"]*">/)[1].startsWith(`If the button does not work, paste this link into your browser: ${url}</p>`));
    assert.equal(render(h, f.replace('.preview', '').replace('.html', '')), h, 'matches generator output');
  });
}
