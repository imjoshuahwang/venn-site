import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { chromium, devices } from 'playwright';
import { parseFlows, loadFlows, runFlows } from './flows.mjs';
import { runMatrix } from './run.mjs';
import { resolveDevices } from './devices.mjs';

const PAGE = `<!doctype html><meta name="viewport" content="width=device-width"><title>f</title><body style="margin:16px;font:16px sans-serif">
<h1>Flow page</h1><a id="go" href="/two" style="display:inline-block;min-width:48px;min-height:48px">Next page</a>
<input id="name" name="name" aria-label="name"><button id="reveal" type="button" onclick="document.getElementById('late').hidden=false" style="min-width:48px;min-height:48px">Reveal</button>
<p id="late" hidden>Revealed</p>
<script>fetch('http://abc.supabase.co:__PORT__/rest/v1/x',{method:'POST',body:'{}'}).catch(()=>{})</script></body>`;
const TWO = '<!doctype html><title>2</title><body><h1 id="two">Second page</h1></body>';
let server, base, out, supabaseHits = 0, port;
before(async () => {
  server = http.createServer((req, res) => { if (req.url.startsWith('/rest')) { supabaseHits++; res.writeHead(200, { 'access-control-allow-origin': '*' }); return res.end('{}'); }
    res.writeHead(200, { 'content-type': 'text/html' }); res.end(req.url.startsWith('/two') ? TWO : PAGE.replace('__PORT__', port)); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  port = server.address().port;
  base = `http://127.0.0.1:${port}`;
  out = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-flows-'));
});
after(async () => { server.closeAllConnections?.(); await new Promise((r) => server.close(r)); fs.rmSync(out, { recursive: true, force: true }); });

async function onPage(fn) {
  const browser = await chromium.launch({ args: ['--host-resolver-rules=MAP *.supabase.co 127.0.0.1'] });
  const { defaultBrowserType, ...desc } = devices['Pixel 7'];
  const ctx = await browser.newContext(desc);
    const page = await ctx.newPage();
  await page.goto(base + '/');
  try { return await fn(page); } finally { await browser.close(); }
}

test('shipped flows wait out the /apply double-tap guard before a second choice tap (#101)', () => {
  // ApplyForm ignores a .choice click within 300ms of a step change; a harness click lands ~35ms after the screen appears.
  for (const flow of loadFlows()) {
    flow.steps.forEach((step, i) => {
      if (!/^tap\s.*\.choice/.test(step) || !flow.steps.slice(0, i).some((s) => s.startsWith('tap '))) return;
      const prev = flow.steps[i - 1] ?? '';
      assert.ok(/^wait\s+\d+/.test(prev) && Number(prev.split(/\s+/)[1]) >= 350, `flow ${flow.name}: "${step}" must follow a wait >= 350`);
    });
  }
});

test('parseFlows reads names, pages and steps; the shipped flows.yaml parses', () => {
  const f = parseFlows('# c\n- name: a\n  on: /x\n  steps:\n    - tap #go\n    - "fill \\"#n\\" hi"\n- name: b\n  steps:\n    - goto /\n');
  assert.deepEqual(f.map((x) => [x.name, x.on, x.steps.length]), [['a', '/x', 2], ['b', '/', 1]]);
  assert.throws(() => parseFlows('- name: a\n  steps:\n'), /needs a name and steps/);
  const real = loadFlows();
  assert.deepEqual(real.map((x) => x.on), ['/', '/apply']);
});

test('a 3-step flow passes: tap, goto, expect-visible, fill, screenshot', async () => {
  const flows = parseFlows(`- name: ok\n  on: /\n  steps:\n    - tap #go\n    - expect-visible #two\n    - goto /\n    - fill "#name" Test Student\n    - tap #reveal\n    - expect-visible #late\n    - scroll-to #late\n    - screenshot after\n`);
  const rows = await onPage((page) => runFlows(page, { name: 'Pixel 7' }, { flows, outDir: out, stepTimeout: 1500 }));
  assert.deepEqual(rows.map((r) => [r.check, r.pass]), [['flow:ok', true]]);
  assert.ok(fs.existsSync(path.join(out, 'shots', 'flow-ok-home-pixel-7-after.jpg')));
});

test('a broken selector fails the flow with a screenshot, and flows for other pages are skipped', async () => {
  const flows = parseFlows(`- name: bad\n  on: /\n  steps:\n    - expect-visible h1\n    - tap #nope\n- name: elsewhere\n  on: /apply\n  steps:\n    - tap #go\n`);
  const rows = await onPage((page) => runFlows(page, { name: 'Pixel 7' }, { flows, outDir: out, stepTimeout: 1500 }));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].check, 'flow:bad');
  assert.equal(rows[0].pass, false);
  assert.match(rows[0].details, /step 2 "tap #nope"/);
  assert.ok(fs.existsSync(path.join(out, rows[0].flowShot)));
  assert.ok(fs.statSync(path.join(out, rows[0].flowShot)).size > 500);
});

test('an unknown verb fails the flow', async () => {
  const flows = parseFlows('- name: v\n  on: /\n  steps:\n    - hover #go\n');
  const rows = await onPage((page) => runFlows(page, { name: 'Pixel 7' }, { flows, outDir: out, stepTimeout: 1500 }));
  assert.match(rows[0].details, /unknown step "hover"/);
});

test('flows block Supabase requests: the page posts once, the flow page never gets through', async () => {
  const flows = parseFlows('- name: s\n  on: /\n  steps:\n    - expect-visible h1\n');
  supabaseHits = 0;
  const hitsAfterFlow = await onPage(async (page) => {
    await page.waitForTimeout(300);
    assert.equal(supabaseHits, 1, 'the main page (unblocked) reaches the fixture once');
    const rows = await runFlows(page, { name: 'Pixel 7' }, { flows, outDir: out });
    assert.equal(rows[0].pass, true);
    return supabaseHits;
  });
  assert.equal(hitsAfterFlow, 1, 'the flow page must add no supabase request');
});
