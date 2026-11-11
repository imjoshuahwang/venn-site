import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { serveFixtures } from './fixtures.mjs';
import { runMatrix } from './run.mjs';
import { resolveDevices } from './devices.mjs';
import { writeJson, writeHtml, summaryTable } from './report.mjs';

let srv, out;
before(async () => { srv = await serveFixtures(); out = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-')); });
after(async () => { await srv.close(); fs.rmSync(out, { recursive: true, force: true }); });

test('runMatrix over fixtures writes report.json, report.html and shots; modes apply', async () => {
  let ran = 0;
  const mode = { contextOptions: { locale: 'de-DE' }, beforePage: async () => { ran++; } };
  const devices = resolveDevices({ names: ['Pixel 7', 'Galaxy S9+'] });
  const results = await runMatrix({ base: srv.base, pages: ['/clean', '/tap'], devices, outDir: out, workers: 2, activeModes: [mode], settleMs: 100 });
  assert.equal(ran, 4);
  assert.equal(results.length, 4 * 8);
  assert.ok(results.filter((r) => r.page === '/clean').every((r) => r.pass));
  const tapFails = results.filter((r) => r.page === '/tap' && !r.pass);
  assert.deepEqual([...new Set(tapFails.map((r) => r.check))], ['tap']);
  writeJson(out, results);
  writeHtml(out, results, { base: srv.base });
  assert.equal(JSON.parse(fs.readFileSync(path.join(out, 'report.json'))).length, 32);
  const html = fs.readFileSync(path.join(out, 'report.html'), 'utf8');
  assert.match(html, /class="card fail"/);
  assert.ok(fs.existsSync(path.join(out, 'shots', 'clean-pixel-7.jpg')));
  const table = summaryTable(results);
  assert.match(table, /\/tap\s+Pixel 7\s+.*FAIL/);
  assert.match(table, /fails per check: .*tap=2/);
});

test('a page that 404s is reported as a load failure', async () => {
  const results = await runMatrix({ base: srv.base, pages: ['/nope'], devices: resolveDevices({ names: ['Pixel 7'] }), outDir: out, settleMs: 50, shots: false });
  assert.ok(results.some((r) => r.check === 'load' && !r.pass && /404/.test(r.details)));
});
