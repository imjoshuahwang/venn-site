import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DUR, EASE } from './motion.ts';

const dir = new URL('../../styles/', import.meta.url);
const read = (f: string) => readFileSync(new URL(f, dir), 'utf8');
const css = read('base.css');
const esc = (s: string) => s.replace(/[().]/g, '\\$&');

test('slide transitions sit in the 350-500ms window', () => {
  assert.ok(DUR.slide >= 350 && DUR.slide <= 500);
});

test('base.css tokens mirror motion.ts', () => {
  assert.match(css, new RegExp(`--dur-slide:\\s*${DUR.slide}ms`));
  assert.match(css, new RegExp(`--dur-stagger:\\s*${DUR.stagger}ms`));
  assert.match(css, new RegExp(`--ease-spring:\\s*${esc(EASE.spring)}`));
});

test('there is exactly one :root token block across the style files', () => {
  for (const f of ['global.css', 'portal.css']) assert.doesNotMatch(read(f), /(^|\n):root\s*\{/, f);
  assert.equal((css.match(/(^|\n):root\s*\{/g) ?? []).length, 1);
});

test('one button definition across the style files', () => {
  const all = ['base.css', 'global.css', 'portal.css'].map(read).join('\n');
  assert.equal((all.match(/(^|\n)\.btn,\s*\.pill\s*\{/g) ?? []).length, 1);
});
