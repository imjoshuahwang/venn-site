// #227: the accept card, share fallbacks and the end screens, on the dev stub at 390x844. Boots its own dev server, no Supabase needed.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { localServerEnv } from '../scripts/qa/portal.mjs';
import { ACCEPT_W, ACCEPT_H } from '../src/lib/portal/accept-card.ts';

const SHOTS = process.env.SHOTS;
let base, server, browser;
const freePort = () => new Promise((res) => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); });

before(async () => {
  const port = await freePort();
  base = `http://localhost:${port}`;
  server = spawn('npx', ['astro', 'dev', '--port', String(port), '--host', 'localhost'], { stdio: 'ignore', env: localServerEnv('http://127.0.0.1:54321', 'fixture-anon') });
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${base}/portal/result?stub=cohort`)).status < 500) break; } catch {} await new Promise((r) => setTimeout(r, 500)); }
  browser = await chromium.launch();
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
});
after(async () => { await browser?.close(); server?.kill('SIGTERM'); });

const URL_ = (q = '') => `/portal/result?stub=cohort&birthday=2000-01-01${q}`;
async function open(init, q) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  if (init) await page.addInitScript(init);
  await page.goto(base + URL_(q));
  await page.locator('[data-reveal-play]:enabled').tap();
  await page.locator('[data-popup]').waitFor({ state: 'visible', timeout: 15000 });
  return { ctx, page };
}
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
const png = (buf) => ({ sig: buf.subarray(1, 4).toString(), w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) });
const stubShare = () => {
  window.__shared = null;
  addEventListener('click', () => { window.__inClick = true; setTimeout(() => { window.__inClick = false; }, 0); }, true);
  navigator.canShare = () => true;
  navigator.share = (d) => { window.__shared = { sync: window.__inClick === true, files: d.files.length, type: d.files[0]?.type, name: d.files[0]?.name, size: d.files[0]?.size }; return Promise.resolve(); };
};

test('every screen has one primary button and fits the width; the LinkedIn steps show at 16+', async () => {
  const { ctx, page } = await open();
  const seen = [];
  for (let i = 0; i < 12; i++) {
    const screen = await page.locator('[data-actions] [data-screen]:not([hidden])').getAttribute('data-screen');
    seen.push(screen);
    assert.equal(await page.locator('[data-actions] [data-primary]:visible').count(), 1, `${screen}: one primary`);
    assert.equal(await noOverflow(page), true, `${screen}: no horizontal scroll`);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/screen-${i + 1}-${screen}.png` });
    if (screen === 'share') await page.locator('[data-actions] [data-share-btn]:enabled').waitFor();
    const next = page.locator('[data-actions] [data-screen]:not([hidden]) [data-go]:visible').last();
    if (!(await next.count()) || screen === 'email') break;
    await next.tap();
  }
  assert.deepEqual(seen, ['intro', 'share', 'letter', 'experience', 'post', 'phone', 'mou', 'email']);
  assert.match(await page.locator('[data-screen="email"] [data-primary]').getAttribute('href'), /^\/portal\/next-steps\?partner=aws$/);
  await ctx.close();
});

test('unknown birthday and under 16 hide the LinkedIn steps', async () => {
  for (const b of ['', '&birthday=2015-01-01']) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await page.goto(`${base}/portal/result?stub=cohort${b}`);
    assert.equal(await page.locator('[data-screen="experience"], [data-screen="post"]').count(), 0);
    await ctx.close();
  }
});

test('share hands a PNG File to navigator.share in the click task, and the card is the right size', async () => {
  const { ctx, page } = await open(stubShare);
  await page.locator('[data-actions] [data-go]').first().tap();
  const btn = page.locator('[data-actions] [data-share-btn]:enabled');
  await btn.waitFor();
  assert.equal(await page.locator('[data-preview]').isVisible(), true, 'blob exists before Share enables');
  await btn.tap();
  await page.waitForFunction(() => window.__shared);
  const s = await page.evaluate(() => window.__shared);
  assert.deepEqual([s.sync, s.files, s.type, s.name], [true, 1, 'image/png', 'venn-accepted.png']);
  const b64 = await page.evaluate(async () => { const r = await fetch(document.querySelector('[data-preview]').src); const buf = new Uint8Array(await r.arrayBuffer()); let o = ''; buf.forEach((c) => { o += String.fromCharCode(c); }); return btoa(o); });
  const buf = Buffer.from(b64, 'base64');
  assert.deepEqual([png(buf).sig, png(buf).w, png(buf).h], ['PNG', ACCEPT_W, ACCEPT_H]);
  const px = await page.evaluate(async () => { const i = document.querySelector('[data-preview]'); const c = document.createElement('canvas'); c.width = 54; c.height = 68; const g = c.getContext('2d'); g.drawImage(i, 0, 0, 54, 68); const d = g.getImageData(0, 0, 54, 68).data; return new Set(Array.from({ length: d.length / 4 }, (_, k) => `${d[k * 4]},${d[k * 4 + 1]},${d[k * 4 + 2]}`)).size; });
  assert.ok(px > 8, `card is not blank (${px} colours)`);
  if (SHOTS) { fs.writeFileSync(`${SHOTS}/share-card.png`, buf); await page.screenshot({ path: `${SHOTS}/share-sent.png` }); }
  await ctx.close();
});

test('without share a download fires', async () => {
  const { ctx, page } = await open(() => { navigator.share = undefined; navigator.canShare = undefined; });
  await ctx.setDefaultTimeout(8000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('[data-actions] [data-go]').first().tap();
  await page.locator('[data-actions] [data-share-btn]:enabled').waitFor();
  const dl = page.waitForEvent('download');
  // Touch contexts copy the link; force the desktop branch so this test sees the download.
  await page.evaluate(() => { const m = window.matchMedia; window.matchMedia = (q) => (q.includes('pointer: fine') ? { matches: true, addEventListener() {}, removeEventListener() {} } : m.call(window, q)); });
  await page.locator('[data-actions] [data-share-btn]').tap();
  assert.equal((await dl).suggestedFilename(), 'venn-accepted.png');
  await ctx.close();
});

test('no share and no clipboard shows the manual fallback', async () => {
  const { ctx, page } = await open(() => { navigator.share = undefined; navigator.canShare = undefined; Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true }); });
  await page.locator('[data-actions] [data-go]').first().tap();
  await page.locator('[data-actions] [data-share-btn]:enabled').tap();
  const manual = page.locator('[data-actions] [data-share-manual]');
  await manual.waitFor({ state: 'visible' });
  assert.equal(await manual.locator('[data-download]').getAttribute('href').then((h) => h.startsWith('blob:')), true);
  assert.equal(await manual.locator('[data-url]').inputValue(), 'https://joinvenn.org/');
  assert.equal(await noOverflow(page), true);
  assert.equal(await page.locator('[data-actions] [data-primary]:visible').count(), 1);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/share-manual.png` });
  await ctx.close();
});

// Body markup only: dev-server style tags carry file paths such as this worktree's name.
const bodyHtml = (page) => page.evaluate(() => document.body.outerHTML);
// #229: Quadron variant. The partner comes from the cohort row (stub `partner=` here); unknown is a neutral Venn reveal.
test('quadron: Dan note has a clickable compose action, the card is non-blank, and no AWS or Amazon anywhere', async () => {
  const { ctx, page } = await open(stubShare, '&partner=quadron');
  assert.match(await page.locator('[data-popup-title]').innerText(), /Quadron/);
  await page.locator('[data-actions] [data-go]').first().tap();
  const btn = page.locator('[data-actions] [data-share-btn]:enabled');
  await btn.waitFor();
  const b64 = await page.evaluate(async () => { const r = await fetch(document.querySelector('[data-preview]').src); const buf = new Uint8Array(await r.arrayBuffer()); let o = ''; buf.forEach((c) => { o += String.fromCharCode(c); }); return btoa(o); });
  const buf = Buffer.from(b64, 'base64');
  assert.deepEqual([png(buf).sig, png(buf).w, png(buf).h], ['PNG', ACCEPT_W, ACCEPT_H]);
  const px = await page.evaluate(async () => { const i = document.querySelector('[data-preview]'); const c = document.createElement('canvas'); c.width = 54; c.height = 68; const g = c.getContext('2d'); g.drawImage(i, 0, 0, 54, 68); const d = g.getImageData(0, 0, 54, 68).data; return new Set(Array.from({ length: d.length / 4 }, (_, k) => `${d[k * 4]},${d[k * 4 + 1]},${d[k * 4 + 2]}`)).size; });
  assert.ok(px > 8, `quadron card is not blank (${px} colours)`);
  if (SHOTS) fs.writeFileSync(`${SHOTS}/quadron-share-card.png`, buf);
  await page.locator('[data-actions] [data-go]:visible').last().tap();
  const dan = page.locator('[data-dan]');
  await dan.waitFor({ state: 'visible' });
  assert.match(await dan.innerText(), /Dan Pratl wants to talk to you/);
  const compose = dan.locator('[data-dan-compose]');
  const href = await compose.getAttribute('href');
  assert.match(href, /^https:\/\/mail\.google\.com\/mail\/\?view=cm&fs=1&to=contact%40joinvenn\.org/);
  assert.match(decodeURIComponent(href), /talk to Dan/);
  assert.equal(await dan.locator('[data-dan-bio]').getAttribute('href'), 'https://pratl.me');
  for (const el of [compose, dan.locator('[data-dan-bio]')]) assert.ok((await el.boundingBox()).height >= 44);
  assert.equal(await noOverflow(page), true);
  assert.equal(await page.locator('[data-actions] [data-primary]:visible').count(), 1);
  assert.doesNotMatch(await bodyHtml(page), /aws|amazon/i);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/quadron-letter.png` });
  await ctx.close();
});

test('aws page never says Quadron, and an unknown partner shows no company reveal', async () => {
  const aws = await open(null);
  assert.doesNotMatch(await bodyHtml(aws.page), /quadron/i);
  await aws.ctx.close();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const n = { ctx, page: await ctx.newPage() };
  await n.page.goto(base + URL_('&partner=unknown-co'));
  assert.doesNotMatch(await bodyHtml(n.page), /aws|amazon|quadron/i);
  assert.equal(await n.page.locator('[data-popup-title]').count(), 0);
  await n.ctx.close();
});
