import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { chromium, webkit, devices } from 'playwright';
import { modes } from './modes.mjs';
import { parseCli } from './cli.mjs';
import { runMatrix } from './run.mjs';
import { resolveDevices } from './devices.mjs';

const BODY = '<h1>Heading words</h1><p>Some body copy here.</p><script>window.copy=1</script>';
let server, base, out;
before(async () => {
  server = http.createServer((req, res) => {
    if (req.url.startsWith('/slow.txt')) return res.end('x'.repeat(60 * 1024));
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(`<!doctype html><meta name="viewport" content="width=device-width"><title>m</title><body style="margin:16px">${BODY}</body>`);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  out = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-modes-'));
});
after(async () => { server.closeAllConnections?.(); await new Promise((r) => server.close(r)); fs.rmSync(out, { recursive: true, force: true }); });

// Open a page the way run.mjs does: context options, beforePage, goto, afterLoad.
async function open(launcher, device, active) {
  const browser = await launcher.launch();
  const { defaultBrowserType, ...desc } = devices[device];
  const ctx = await browser.newContext(Object.assign({ ...desc }, ...active.map((m) => m.contextOptions || {})));
  const page = await ctx.newPage();
  for (const m of active) await m.beforePage?.(page);
  await page.goto(base + '/');
  for (const m of active) await m.afterLoad?.(page);
  return { page, close: () => browser.close() };
}

test('dark sets prefers-color-scheme; reduced-motion sets prefers-reduced-motion', async () => {
  const s = await open(chromium, 'Pixel 7', [modes.dark, modes['reduced-motion']]);
  try {
    assert.equal(await s.page.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches), true);
    assert.equal(await s.page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), true);
  } finally { await s.close(); }
  const plain = await open(chromium, 'Pixel 7', []);
  try { assert.equal(await plain.page.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches), false); } finally { await plain.close(); }
});

test('long-text triples every text node and leaves scripts alone', async () => {
  const s = await open(chromium, 'Pixel 7', []);
  try {
    const before = await s.page.evaluate(() => document.body.innerText.length);
    await modes['long-text'].afterLoad(s.page);
    const after = await s.page.evaluate(() => ({ len: document.body.innerText.length, h1: document.querySelector('h1').textContent }));
    assert.equal(after.h1, 'Heading words Heading words Heading words');
    assert.ok(after.len >= before * 3, `${before} -> ${after.len}`);
    assert.equal(await s.page.evaluate(() => window.copy), 1);
  } finally { await s.close(); }
});

test('zoom scales the document in chromium and webkit, and rejects nonsense', async () => {
  for (const [launcher, device] of [[chromium, 'Pixel 7'], [webkit, 'iPhone SE']]) {
    const s = await open(launcher, device, [modes.zoom.build('200')]);
    try {
      assert.equal(await s.page.evaluate(() => getComputedStyle(document.documentElement).zoom), '2');
      assert.ok(await s.page.evaluate(() => document.querySelector('h1').getBoundingClientRect().height) > 0);
    } finally { await s.close(); }
  }
  assert.equal(modes.zoom.build('150').name, 'zoom=150');
  assert.throws(() => modes.zoom.build('abc'), /--zoom/);
});

test('slow-3g throttles chromium via CDP and delays requests on webkit', async () => {
  const timed = async (launcher, device, active) => {
    const s = await open(launcher, device, active);
    try { return await s.page.evaluate(async () => { const t = performance.now(); await (await fetch('/slow.txt?' + Math.random())).text(); return performance.now() - t; }); } finally { await s.close(); }
  };
  for (const [launcher, device] of [[chromium, 'Pixel 7'], [webkit, 'iPhone SE']]) {
    const fast = await timed(launcher, device, []);
    const slow = await timed(launcher, device, [modes['slow-3g']]);
    assert.ok(slow > 350 && slow > fast + 300, `${device}: fast ${fast | 0}ms slow ${slow | 0}ms`);
  }
});

test('cli: valued and boolean mode flags combine from the real registry', () => {
  const c = parseCli(['--zoom', '200', '--dark', '--long-text', '--only', '/apply']);
  assert.deepEqual(c.activeModes.map((m) => m.name), ['zoom=200', 'dark', 'long-text']);
  assert.equal(c.only, '/apply');
  assert.deepEqual(parseCli([]).activeModes, []);
});

test('report rows carry the mode list', async () => {
  const results = await runMatrix({ base, pages: ['/p'], devices: resolveDevices({ names: ['Pixel 7'] }), outDir: out, settleMs: 50, shots: false, activeModes: [modes.dark, modes['long-text']] });
  assert.ok(results.length > 0);
  assert.ok(results.every((r) => JSON.stringify(r.modes) === '["dark","long-text"]'));
});
