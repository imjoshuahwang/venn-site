import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildComment, upsertComment, findPrNumber, MARKER } from './pr-comment.mjs';

const row = (page, device, check, pass, details = '') => ({ page, device, browser: 'webkit', check, pass, details });
const fixture = [
  row('/b', 'Pixel 7', 'tap', false, '3 targets < 44px | one'),
  row('/a', 'iPhone SE', 'overflow', true),
  row('/b', 'iPhone SE', 'text', true),
  row('/a', 'Pixel 7', 'overflow', false, 'scrollWidth 420 > 390'),
  row('/a', 'Pixel 7', 'img', false, 'broken img'),
];

test('buildComment: marker first, matrix, failures sorted by page/device/check', () => {
  const md = buildComment(fixture, { url: 'https://p.example', runUrl: 'https://gh/run/1' });
  assert.ok(md.startsWith(MARKER + '\n'));
  assert.equal(md.split(MARKER).length, 2);
  assert.match(md, /3 failing checks/);
  assert.match(md, /Preview: https:\/\/p\.example/);
  assert.match(md, /\| page \| Pixel 7 \| iPhone SE \|/);
  assert.match(md, /\| `\/a` \| fail 2 \| pass \|/);
  assert.match(md, /\| `\/b` \| fail 1 \| pass \|/);
  const fails = md.split('\n').filter((l) => /^\| `\/[ab]` \| Pixel 7 \| /.test(l));
  assert.deepEqual(fails.map((l) => l.split('|')[3].trim()), ['img', 'overflow', 'tap']);
  assert.match(md, /3 targets < 44px \\\| one/);
  assert.match(md, /\[artifact `mobile-qa` on this run\]\(https:\/\/gh\/run\/1#artifacts\)/);
});

test('buildComment: caps at 10 failures and says how many', () => {
  const many = Array.from({ length: 14 }, (_, i) => row(`/p${String(i).padStart(2, '0')}`, 'Pixel 7', 'tap', false, 'x'));
  const md = buildComment(many);
  assert.match(md, /Top 10 failures\*\* \(of 14\)/);
  assert.equal(md.split('\n').filter((l) => /^\| `\/p\d+` \| Pixel 7 \| tap/.test(l)).length, 10);
  assert.ok(!md.includes('/p10` | Pixel 7 | tap |'));
});

test('buildComment: all pass has no failures table', () => {
  const md = buildComment([row('/', 'iPhone SE', 'tap', true)]);
  assert.match(md, /all pass/);
  assert.ok(!md.includes('Top '));
});

function fakeGh(comments) {
  const calls = [];
  const gh = (args, input) => {
    calls.push({ args, input });
    if (args.includes('--paginate')) return JSON.stringify([comments]);
    if (args[0] === 'api' && args[1] === '-X') return JSON.stringify({ html_url: 'https://gh/c/1' });
    return JSON.stringify([{ number: 7, state: 'open' }]);
  };
  return { gh, calls };
}

test('upsertComment: edits the marked comment instead of posting a new one', () => {
  const { gh, calls } = fakeGh([{ id: 5, body: 'hi' }, { id: 9, body: `${MARKER}\nold` }]);
  const r = upsertComment(gh, 'o/r', 7, `${MARKER}\nnew`);
  assert.equal(r.updated, true);
  const w = calls.at(-1);
  assert.deepEqual(w.args.slice(0, 4), ['api', '-X', 'PATCH', 'repos/o/r/issues/comments/9']);
  assert.equal(JSON.parse(w.input).body, `${MARKER}\nnew`);
});

test('upsertComment: posts when no marked comment exists; findPrNumber resolves from sha', () => {
  const { gh, calls } = fakeGh([{ id: 5, body: 'hi' }]);
  assert.equal(upsertComment(gh, 'o/r', 7, MARKER).updated, false);
  assert.deepEqual(calls.at(-1).args.slice(0, 4), ['api', '-X', 'POST', 'repos/o/r/issues/7/comments']);
  assert.equal(findPrNumber(gh, 'o/r', 'abc'), 7);
});
