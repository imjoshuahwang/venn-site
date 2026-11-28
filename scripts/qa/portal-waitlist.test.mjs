import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pageFor, viewFor, COPY, CONTACT } from '../../src/data/portal-copy.ts';

const read = (p) => fs.readFileSync(p, 'utf8');
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));

test('outcome -> page mapping', () => {
  assert.equal(pageFor('network_waitlist'), 'waitlist');
  assert.equal(pageFor('track_waitlist'), 'waitlist');
  assert.equal(pageFor('not_this_season'), 'not_this_season');
  assert.equal(pageFor('cohort'), null);
  assert.equal(pageFor('peer'), null);
});

test('Track copy mentions the 5-day seat fill; Network differs and keeps contact', () => {
  const t = viewFor('track_waitlist', 'Hi');
  const n = viewFor('network_waitlist', 'Hi');
  assert.match(t.note, /5 days/);
  assert.match(t.note, /seat/i);
  assert.notEqual(t.heading, n.heading);
  assert.notEqual(t.note, n.note);
  assert.doesNotMatch(n.note, /5 days/);
  assert.equal(CONTACT, 'contact@joinvenn.org');
});

test('Not this Season never mentions seats or claim windows', () => {
  const v = viewFor('not_this_season', 'Hi');
  const text = JSON.stringify(v) + JSON.stringify(COPY.not_this_season);
  assert.doesNotMatch(text, /seat|claim|waitlist|5 days/i);
  assert.ok(v.tips.length > 0);
});

test('null, blank or non-string letter gives the empty state', () => {
  for (const l of [null, undefined, '', '   \n', 42]) assert.equal(viewFor('track_waitlist', l).letter, null);
  assert.equal(viewFor('track_waitlist', ' Dear you ').letter, 'Dear you');
});

test('letter renders as escaped text only', () => {
  for (const f of walk('src').filter((f) => /portal/.test(f) && /\.(astro|ts)$/.test(f))) {
    assert.doesNotMatch(read(f), /set:html|innerHTML|dangerouslySetInnerHTML/, f);
  }
});

test('result pages link contact and carry no confetti', () => {
  for (const f of ['Waitlist', 'NotThisSeason']) {
    const s = read(`src/components/portal/results/${f}.astro`);
    assert.match(s, /mailto:/, f);
    assert.doesNotMatch(s, /confetti|<canvas/i, f);
  }
});

test('production fixture route is DEV-guarded', () => {
  assert.match(read('src/pages/portal/dev/result.astro'), /import\.meta\.env\.DEV/);
});

test('real /portal renders results via the adapter', () => {
  const s = read('src/pages/portal/result.astro');
  assert.match(s, /getMyResult/);
  assert.match(s, /rpc-adapter/);
});

// Beauty bar: sizes, spacing, motion only from portal.css tokens.
const css = read('src/styles/base.css');
const FS = [13, 15, 17, 22, 28, 40, 56];
const SP = [4, 8, 12, 16, 24, 32, 48, 64];

test('portal.css holds the #112 token lists', () => {
  for (const n of FS) assert.match(css, new RegExp(`--fs-${n}:\\s*${n}px`));
  for (const n of SP) assert.match(css, new RegExp(`--sp-${n}:\\s*${n}px`));
  for (const [k, v] of [['--dur-1', '120ms'], ['--dur-2', '240ms'], ['--dur-3', '480ms']]) assert.match(css, new RegExp(`${k}:\\s*${v}`));
  assert.match(css, /--ease:\s*cubic-bezier\(0\.2, 0\.8, 0\.2, 1\)/);
  for (const n of [12, 20]) assert.match(css, new RegExp(`--r-${n}:\\s*${n}px`));
  assert.match(css, /--r-pill:\s*999px/);
});

test('result css/astro use no raw sizes, spacing or motion values', () => {
  const files = ['src/layouts/Portal.astro', ...walk('src/components/portal/results').filter((f) => f.endsWith('.astro')), 'src/pages/portal/result.astro', 'src/pages/portal/dev/result.astro'].filter((f) => fs.existsSync(f));
  const re = /(?:^|[;{\s])(font-size|padding(?:-[a-z]+)?|margin(?:-[a-z]+)?|gap|row-gap|column-gap|animation(?:-duration)?|transition(?:-duration)?|animation-timing-function|transition-timing-function|border-radius):\s*([^;}]+)/g;
  const bad = [];
  for (const f of [...files, 'src/styles/portal.css']) {
    const src = read(f).replace(/\/\*[\s\S]*?\*\//g, '');
    const isTokens = f.endsWith('portal.css');
    for (const m of src.matchAll(re)) {
      const val = m[2].replace(/var\(--[a-z0-9-]+\)/g, '').replace(/\b0\b/g, '');
      if (/\d\s*(px|ms|s|rem|em)\b|cubic-bezier|\d%/.test(val)) bad.push(`${f}: ${m[1]}: ${m[2]}`);
    }
    if (!isTokens) assert.doesNotMatch(src, /cubic-bezier|\d+ms\b/, f);
  }
  assert.deepEqual(bad, []);
});
