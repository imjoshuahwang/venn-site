// Share pill (#173), dev fixture page, no Supabase needed. Run: node --test e2e/share.spec.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium, devices } from 'playwright';

const PORT = 8173;
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = new URL('../qa/screens/173/', import.meta.url).pathname;
const VIEWPORTS = { 'iphone-se': 'iPhone SE (3rd gen)', 'iphone-15': 'iPhone 15', 'pixel-7': 'Pixel 7' };
let server, browser;

before(async () => {
  mkdirSync(SHOTS, { recursive: true });
  server = spawn('npx', ['astro', 'dev', '--host', '127.0.0.1', '--port', String(PORT)], {
    env: { ...process.env, PUBLIC_SUPABASE_URL: 'http://127.0.0.1:1', PUBLIC_SUPABASE_ANON_KEY: 'x', PORTAL_HOST: 'portal.invalid' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 120; i++) {
    if (await fetch(`${BASE}/portal/dev/result?outcome=cohort`).then((r) => r.ok, () => false)) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.kill(); });

for (const [tag, device] of Object.entries(VIEWPORTS)) {
  test(`share on ${tag}`, async () => {
    const ctx = await browser.newContext({ ...devices[device], permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      window.__shared = null;
      navigator.canShare = () => true;
      navigator.share = async (d) => {
        const f = d.files[0];
        window.__shared = { type: f.type, url: d.url, title: d.title, b64: await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result.split(',')[1]); r.readAsDataURL(f); }) };
      };
    });
    page.on('pageerror', (e) => console.log('PAGEERR', e.message)); page.on('console', (m) => console.log('CONSOLE', m.text()));
    await page.goto(`${BASE}/portal/dev/result?outcome=cohort`, { waitUntil: 'networkidle' });
    await page.locator('[data-share-btn]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOTS}${tag}-page.png`, fullPage: true });
    await page.click('[data-share-btn]');
    await page.waitForFunction(() => window.__shared);
    const s = await page.evaluate(() => window.__shared);
    assert.equal(s.type, 'image/png');
    assert.equal(s.url, 'https://joinvenn.org/');
    const buf = Buffer.from(s.b64, 'base64');
    writeFileSync(`${SHOTS}${tag}-card.png`, buf);
    assert.equal(buf.readUInt32BE(16), 1080);
    assert.equal(buf.readUInt32BE(20), 1920);

    // Fallback: no file-share support copies the link.
    await page.evaluate(() => { navigator.canShare = () => false; window.__shared = null; });
    await page.click('[data-share-btn]');
    await page.waitForFunction(() => document.querySelector('[data-share-state]').textContent === 'Copied');
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'https://joinvenn.org/');
    await page.screenshot({ path: `${SHOTS}${tag}-copied.png` });
    await ctx.close();
  });
}
