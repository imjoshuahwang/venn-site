import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../../layouts/Portal.astro', import.meta.url), 'utf8');

test('viewport covers the safe area', () => {
  assert.match(src, /name="viewport"[^>]*viewport-fit=cover/);
});

test('top bar signs out with a no-JS POST form', () => {
  assert.match(src, /<form[^>]*method="post"[^>]*action="\/portal\/logout"|<form[^>]*action="\/portal\/logout"[^>]*method="post"/);
  assert.match(src, /<header[^>]*class="topbar"/);
  assert.match(src, /Astro\.locals\.user/);
});

test('tap targets are at least 44px', () => {
  assert.match(src, /\.data-line a\s*\{[^}]*min-height:\s*44px/);
  assert.match(src, /\.topbar summary\s*\{[^}]*min-height:\s*44px/);
  assert.match(src, /\.topbar button\s*\{[^}]*min-height:\s*44px/);
});

test('top bar and footer pad for the safe area', () => {
  assert.match(src, /\.topbar\s*\{[^}]*env\(safe-area-inset-top\)/);
  assert.match(src, /\.data-line\s*\{[^}]*env\(safe-area-inset-bottom\)/);
});
