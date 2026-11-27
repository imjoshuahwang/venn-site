// Phone QA for #133: guiding questions on the dev fixture, at SE / iPhone 15 / Pixel 7. Boots its own dev server.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { chromium, webkit, devices } from 'playwright';

const PHONES = [['iPhone SE', webkit, 'iphone-se'], ['iPhone 15', webkit, 'iphone-15'], ['Pixel 7', chromium, 'pixel-7']];
const LOGO = 'https://wirjadichvbmrqzamwtp.supabase.co/storage/v1/object/public/cohort-logos/fixture.png';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const url = (p) => `${base}/portal/dev/result?outcome=cohort&${p}`;
let base, server;

const freePort = () => new Promise((res) => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); });

before(async () => {
  fs.mkdirSync('qa/portal-shots', { recursive: true });
  const port = await freePort();
  base = `http://localhost:${port}`;
  server = spawn('npx', ['astro', 'dev', '--port', String(port), '--host', 'localhost'], { stdio: 'ignore', env: { ...process.env, PUBLIC_SUPABASE_URL: process.env.PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321', PUBLIC_SUPABASE_ANON_KEY: process.env.PUBLIC_SUPABASE_ANON_KEY || 'fixture-anon' } });
  for (let i = 0; i < 120; i++) { try { if ((await fetch(base + '/portal/dev/result?outcome=cohort')).status < 500) return; } catch {} await new Promise((r) => setTimeout(r, 500)); }
  throw new Error('dev server did not start');
});
after(() => server?.kill('SIGTERM'));

const csp = JSON.parse(fs.readFileSync('vercel.json', 'utf8')).headers.flatMap((h) => h.headers).find((h) => h.key === 'Content-Security-Policy').value;

test('fixture logo origin is inside CSP img-src', () => {
  const img = csp.split(';').map((s) => s.trim().split(/\s+/)).find(([n]) => n === 'img-src').slice(1);
  assert.ok(img.includes(new URL(LOGO).origin));
});

for (const [name, engine, slug] of PHONES) {
  test(`${name}: guiding save and closed state`, async () => {
    const browser = await engine.launch();
    try {
      const ctx = await browser.newContext({ ...devices[name], reducedMotion: 'no-preference' });
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.route(LOGO, (r) => r.fulfill({ contentType: 'image/png', body: PNG }));
      await page.goto(url('state=signed'));

      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no horizontal scroll');

      await page.locator('[data-guiding] textarea[name=goal]').fill('Ship a pilot this term.');
      await page.locator('[data-guiding] [data-save]').click();
      await page.locator('[data-guiding] [data-status]', { hasText: 'Saved' }).waitFor();
      await page.locator('[data-guiding]').screenshot({ path: `qa/portal-shots/133-guiding-saved-${slug}.png` });

      for (const t of await page.locator('[data-guiding] textarea').all()) await t.fill('');
      await page.locator('[data-guiding] [data-save]').click();
      await page.locator('[data-guiding] [data-error]').waitFor({ state: 'visible' });
      assert.equal(await page.locator('[data-guiding] [data-error]').evaluate((e) => getComputedStyle(e).color), 'rgb(185, 28, 28)', 'error uses --err token');

      await page.goto(url('state=signed&gfail=closed'));
      await page.locator('[data-guiding] textarea[name=goal]').fill('x');
      await page.locator('[data-guiding] [data-save]').click();
      await page.locator('[data-guiding] [data-error]').waitFor({ state: 'visible' });
      assert.equal(await page.locator('[data-guiding] [data-save]').isVisible(), false, 'save hidden after closed');
      assert.equal(await page.locator('[data-guiding] textarea[name=goal]').isDisabled(), true);
      await page.locator('[data-guiding]').screenshot({ path: `qa/portal-shots/133-guiding-closed-${slug}.png` });

      await page.goto(url('state=signed&gfail=closed-load'));
      assert.equal(await page.locator('[data-guiding] [data-save]').isVisible(), false, 'save hidden when closed on load');
      assert.equal(await page.locator('[data-guiding] textarea[name=goal]').isDisabled(), true);

      const rctx = await browser.newContext({ ...devices[name], reducedMotion: 'reduce' });
      const rp = await rctx.newPage();
      await rp.goto(url('state=signed'));
      assert.equal(await rp.locator('[data-guiding]').isVisible(), true, 'guiding renders under reduced motion');
      assert.equal(await rp.locator('[data-track]').count(), 0, 'slideshow is gone');
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  });
}
