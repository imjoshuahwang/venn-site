// Visual baselines: viewport PNG per page x device, compared with pixelmatch. Committed in qa/baselines/.
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

export const DEFAULT_THRESHOLD = 0.2; // percent of pixels that may differ

// One CSS selector per line; blank lines and # comments ignored.
export function loadMask(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
}

const encode = (png) => PNG.sync.write(png, { deflateLevel: 9 });

// Returns { changedPct, diffPng (Buffer|null), sizeMismatch }. Both args are PNG buffers.
export function compareImages(baselineBuf, newBuf) {
  const a = PNG.sync.read(baselineBuf);
  const b = PNG.sync.read(newBuf);
  if (a.width !== b.width || a.height !== b.height) {
    return { changedPct: 100, diffPng: null, sizeMismatch: `${a.width}x${a.height} -> ${b.width}x${b.height}` };
  }
  const diff = new PNG({ width: a.width, height: a.height });
  const changed = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0.1 });
  return { changedPct: (changed / (a.width * a.height)) * 100, diffPng: encode(diff) };
}

// Decide one cell. Returns a result row: { check: 'visual-diff', pass, details, info?, diff?, baselineImg?, newImg? }.
// Paths in the row are relative to outDir so report.html can link them.
export function judge({ baselineFile, newBuf, name, outDir, update = false, threshold = DEFAULT_THRESHOLD }) {
  if (update) {
    fs.mkdirSync(path.dirname(baselineFile), { recursive: true });
    fs.writeFileSync(baselineFile, newBuf);
    return { check: 'visual-diff', pass: true, info: true, details: 'baseline updated' };
  }
  if (!fs.existsSync(baselineFile)) {
    return { check: 'visual-diff', pass: true, info: true, details: 'no baseline (run with --update-baselines)' };
  }
  const { changedPct, diffPng, sizeMismatch } = compareImages(fs.readFileSync(baselineFile), newBuf);
  if (!sizeMismatch && changedPct <= threshold) {
    return { check: 'visual-diff', pass: true, details: `${changedPct.toFixed(3)}% changed` };
  }
  const dir = path.join(outDir, 'diffs');
  fs.mkdirSync(dir, { recursive: true });
  const rel = (s) => `diffs/${name}-${s}.png`;
  fs.writeFileSync(path.join(outDir, rel('new')), newBuf);
  fs.copyFileSync(baselineFile, path.join(outDir, rel('baseline')));
  if (diffPng) fs.writeFileSync(path.join(outDir, rel('diff')), diffPng);
  return {
    check: 'visual-diff', pass: false,
    details: sizeMismatch ? `size changed ${sizeMismatch}` : `${changedPct.toFixed(2)}% pixels changed (limit ${threshold}%)`,
    diff: diffPng ? rel('diff') : undefined, baselineImg: rel('baseline'), newImg: rel('new'),
  };
}

// Take the viewport screenshot (masked, animations off, scrolled to top) and judge it.
export async function visualCheck(page, visual, { name, outDir }) {
  await page.evaluate(() => window.scrollTo(0, 0));
  const mask = (visual.masks || []).map((s) => page.locator(s));
  const newBuf = await page.screenshot({ type: 'png', animations: 'disabled', caret: 'hide', scale: 'css', mask });
  return judge({ baselineFile: path.join(visual.dir, `${name}.png`), newBuf, name, outDir, update: visual.update, threshold: visual.threshold });
}
