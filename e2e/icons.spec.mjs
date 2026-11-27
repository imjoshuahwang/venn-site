// Favicon hrefs resolve (#233), local dev server only. Run: node --test e2e/icons.spec.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { localServerEnv } from '../scripts/qa/portal.mjs';

const PORT = 8233;
const BASE = `http://127.0.0.1:${PORT}`;
let server, browser;

before(async () => {
  server = spawn('npx', ['astro', 'dev', '--host', '127.0.0.1', '--port', String(PORT)], {
    env: localServerEnv('http://127.0.0.1:1', 'x', { PORTAL_HOST: 'portal.invalid' }),
    stdio: 'ignore',
  });
  for (let i = 0; i < 120; i++) {
    if (await fetch(`${BASE}/`).then((r) => r.ok, () => false)) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.kill(); });

for (const path of ['/', '/portal/login', '/portal/result?stub=cohort']) {
  test(`icons on ${path}`, async () => {
    const page = await browser.newPage();
    await page.goto(BASE + path);
    const hrefs = await page.$$eval('link[rel~="icon"], link[rel="apple-touch-icon"]', (ls) => ls.map((l) => l.href));
    assert.ok(hrefs.length >= 5, `icon links on ${path}: ${hrefs.length}`);
    for (const href of hrefs) {
      const res = await page.request.get(href);
      assert.equal(res.status(), 200, href);
      assert.match(res.headers()['content-type'], /^image\//, href);
    }
    await page.close();
  });
}
