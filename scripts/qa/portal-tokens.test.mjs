import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkTokens, contrast } from '../../src/lib/portal/tokens.mjs';

const root = new URL('../../', import.meta.url);
const css = readFileSync(new URL('src/styles/base.css', root), 'utf8');
const files = [
  'src/styles/portal.css',
  'src/layouts/Portal.astro',
  'src/components/portal/Ceremony.astro',
];

test('portal.css carries exactly the #112 tokens (one set, main names)', () => {
  const want = ['--fs-13: 13px', '--fs-15: 15px', '--fs-17: 17px', '--fs-22: 22px', '--fs-28: 28px', '--fs-40: 40px', '--fs-56: 56px',
    '--fw-400: 400', '--fw-600: 600', '--fw-800: 800',
    '--sp-4: 4px', '--sp-8: 8px', '--sp-12: 12px', '--sp-16: 16px', '--sp-24: 24px', '--sp-32: 32px', '--sp-48: 48px', '--sp-64: 64px',
    '--r-12: 12px', '--r-20: 20px', '--r-pill: 999px',
    '--dur-1: 120ms', '--dur-2: 240ms', '--dur-3: 480ms', '--ease: cubic-bezier(0.2, 0.8, 0.2, 1)'];
  for (const t of want) assert.ok(css.includes(`${t};`), t);
  assert.ok(!/--(s-\d|fw-[123]\b|r-[123]\b)/.test(css), 'no duplicate token names');
});

test('no off-scale font-size, spacing, radius or duration in portal css and components', () => {
  for (const f of files) {
    const src = readFileSync(new URL(f, root), 'utf8');
    assert.deepEqual(checkTokens(src), [], f);
  }
});

test('checkTokens catches off-scale values', () => {
  assert.ok(checkTokens('a{font-size:14px}').length);
  assert.ok(checkTokens('a{padding:10px 16px}').length);
  assert.ok(checkTokens('a{transition:opacity 600ms}').length);
  assert.ok(checkTokens('a{animation-duration:1s}').length);
  assert.ok(checkTokens('a{border-radius:8px}').length);
  assert.ok(checkTokens('a{font-weight:500}').length);
  assert.deepEqual(checkTokens('a{font-size:var(--fs-15);padding:var(--sp-16) 16px;transition:opacity var(--dur-2);border-radius:999px}'), []);
});

test('AA contrast for text pairs', () => {
  const v = (n) => css.match(new RegExp(`--${n}:\\s*(#[0-9a-fA-F]{3,6})`))[1];
  for (const [fg, bg] of [['ink', 'white'], ['body', 'white'], ['muted', 'white'], ['white', 'ink'], ['muted', 'panel']]) {
    assert.ok(contrast(v(fg), v(bg)) >= 4.5, `${fg} on ${bg}`);
  }
});

test('visible focus ring, 44px tap target and reduced-motion rule exist', () => {
  const layout = readFileSync(new URL('src/layouts/Portal.astro', root), 'utf8');
  const all = `${css}\n${layout}`;
  assert.match(all, /focus-visible\s*{[^}]*outline:\s*\d+px solid/);
  assert.match(all, /min-height:\s*44px/);
  assert.match(all, /prefers-reduced-motion:\s*reduce/);
});

test('no status dots', () => {
  for (const f of files) {
    const src = readFileSync(new URL(f, root), 'utf8');
    assert.ok(!/\b(status-dot|pulse|live-dot)\b/.test(src), f);
  }
});
