import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';
import { compareImages, judge, loadMask } from './baselines.mjs';
import { writeHtml } from './report.mjs';
import { parseCli } from './cli.mjs';
import { serveFixtures } from './fixtures.mjs';
import { runMatrix } from './run.mjs';
import { resolveDevices } from './devices.mjs';

const W = 100, H = 100;
// White PNG; the first `rows` rows of 100px painted black (rows=1 -> 1% of pixels).
function png(rows = 0) {
  const p = new PNG({ width: W, height: H });
  for (let i = 0; i < W * H; i++) {
    const v = i < rows * W ? 0 : 255;
    p.data.set([v, v, v, 255], i * 4);
  }
  return PNG.sync.write(p);
}
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-bl-')); return d; };

test('identical PNGs pass', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'a.png'), png());
  const row = judge({ baselineFile: path.join(dir, 'a.png'), newBuf: png(), name: 'a', outDir: dir });
  assert.equal(row.pass, true);
  assert.equal(row.check, 'visual-diff');
  assert.ok(!fs.existsSync(path.join(dir, 'diffs')));
  fs.rmSync(dir, { recursive: true });
});

test('a 1% changed PNG fails and writes a diff file', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'a.png'), png());
  const row = judge({ baselineFile: path.join(dir, 'a.png'), newBuf: png(1), name: 'a', outDir: dir });
  assert.equal(row.pass, false);
  assert.match(row.details, /1\.00% pixels changed/);
  for (const f of [row.diff, row.baselineImg, row.newImg]) assert.ok(fs.existsSync(path.join(dir, f)), f);
  assert.ok(PNG.sync.read(fs.readFileSync(path.join(dir, row.diff))).width === W);
  fs.rmSync(dir, { recursive: true });
});

test('threshold flag lets small changes through', () => {
  const r = compareImages(png(), png(1));
  assert.ok(Math.abs(r.changedPct - 1) < 0.01);
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'a.png'), png());
  assert.equal(judge({ baselineFile: path.join(dir, 'a.png'), newBuf: png(1), name: 'a', outDir: dir, threshold: 2 }).pass, true);
  fs.rmSync(dir, { recursive: true });
});

test('missing baseline is an info row, not a fail', () => {
  const dir = tmp();
  const row = judge({ baselineFile: path.join(dir, 'none.png'), newBuf: png(), name: 'x', outDir: dir });
  assert.equal(row.pass, true);
  assert.equal(row.info, true);
  assert.match(row.details, /no baseline/);
  fs.rmSync(dir, { recursive: true });
});

test('size change fails without a diff image; update writes the baseline', () => {
  const dir = tmp();
  const big = new PNG({ width: 50, height: 50 });
  const bigBuf = PNG.sync.write(big);
  fs.writeFileSync(path.join(dir, 'a.png'), png());
  const row = judge({ baselineFile: path.join(dir, 'a.png'), newBuf: bigBuf, name: 'a', outDir: dir });
  assert.equal(row.pass, false);
  assert.match(row.details, /size changed 100x100 -> 50x50/);
  assert.equal(row.diff, undefined);
  const up = judge({ baselineFile: path.join(dir, 'sub', 'b.png'), newBuf: bigBuf, name: 'b', outDir: dir, update: true });
  assert.equal(up.pass, true);
  assert.ok(fs.existsSync(path.join(dir, 'sub', 'b.png')));
  fs.rmSync(dir, { recursive: true });
});

test('report.html puts a Changed section first, only for changed tiles', () => {
  const dir = tmp();
  const row = { page: '/a', device: 'Pixel 7', browser: 'chromium' };
  const results = [
    { ...row, check: 'visual-diff', pass: false, details: '1% changed', diff: 'diffs/a-diff.png', baselineImg: 'diffs/a-baseline.png', newImg: 'diffs/a-new.png' },
    { ...row, page: '/b', check: 'visual-diff', pass: true, details: '0% changed' },
  ];
  writeHtml(dir, results, { base: 'x' });
  const html = fs.readFileSync(path.join(dir, 'report.html'), 'utf8');
  assert.match(html, /<h2>Changed \(1\)<\/h2>/);
  assert.ok(html.indexOf('id="changed"') < html.indexOf('<h2>/a</h2>'));
  assert.match(html, /diffs\/a-baseline\.png/);
  assert.equal((html.match(/class="changed"/g) || []).length, 1);
  writeHtml(dir, [results[1]], { base: 'x' });
  assert.doesNotMatch(fs.readFileSync(path.join(dir, 'report.html'), 'utf8'), /id="changed"/);
  fs.rmSync(dir, { recursive: true });
});

test('flags parse and mask.txt ignores comments', () => {
  const c = parseCli(['--update-baselines', '--diff-threshold', '0.5']);
  assert.equal(c.updateBaselines, true);
  assert.equal(c.diffThreshold, 0.5);
  assert.equal(parseCli([]).diffThreshold, 0.2);
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'mask.txt'), '# blobs\n.blob\n\n  [data-anim]  \n');
  assert.deepEqual(loadMask(path.join(dir, 'mask.txt')), ['.blob', '[data-anim]']);
  assert.deepEqual(loadMask(path.join(dir, 'nope.txt')), []);
  fs.rmSync(dir, { recursive: true });
});

test('runMatrix: update, rerun is clean, a different page fails', async () => {
  const srv = await serveFixtures();
  const dir = tmp();
  const devices = resolveDevices({ names: ['Pixel 7'] });
  const visual = { dir: path.join(dir, 'bl'), update: false, threshold: 0.2, masks: [] };
  const go = (v) => runMatrix({ base: srv.base, pages: ['/clean'], devices, outDir: path.join(dir, 'out'), settleMs: 50, shots: false, visual: v });
  try {
    const first = (await go(visual)).find((r) => r.check === 'visual-diff');
    assert.equal(first.info, true);
    await go({ ...visual, update: true });
    assert.ok(fs.existsSync(path.join(dir, 'bl', 'clean-pixel-7.png')));
    const second = (await go(visual)).find((r) => r.check === 'visual-diff');
    assert.equal(second.pass, true);
    // /tap differs from /clean: compare it against /clean's baseline
    fs.copyFileSync(path.join(dir, 'bl', 'clean-pixel-7.png'), path.join(dir, 'bl', 'tap-pixel-7.png'));
    const third = (await runMatrix({ base: srv.base, pages: ['/tap'], devices, outDir: path.join(dir, 'out'), settleMs: 50, shots: false, visual: { ...visual, threshold: 0 } })).find((r) => r.check === 'visual-diff');
    assert.equal(third.pass, false);
    assert.ok(fs.existsSync(path.join(dir, 'out', third.diff)));
  } finally {
    await srv.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
