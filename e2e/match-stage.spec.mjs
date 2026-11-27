// Match stage (#247) on the dev stub at 390x844, no database. Boots its own dev server. Set MATCH_SHOTS=<dir> for screenshots.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const SHOTS = process.env.MATCH_SHOTS;
let base, server, browser;
const freePort = () => new Promise((res) => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); });

before(async () => {
  const port = await freePort();
  base = `http://localhost:${port}`;
  server = spawn('npx', ['astro', 'dev', '--port', String(port), '--host', 'localhost'], { stdio: 'ignore', env: { ...process.env, PUBLIC_SUPABASE_URL: process.env.PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321', PUBLIC_SUPABASE_ANON_KEY: process.env.PUBLIC_SUPABASE_ANON_KEY || 'fixture-anon' } });
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${base}/portal/match?stub=unmatched`)).status < 500) break; } catch {} await new Promise((r) => setTimeout(r, 500)); }
  browser = await chromium.launch();
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
});
after(async () => { await browser?.close(); server?.kill('SIGTERM'); });

async function open(stub, reducedMotion = 'no-preference') {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion });
  const page = await ctx.newPage();
  await page.goto(`${base}/portal/match?stub=${stub}`);
  await page.waitForSelector('[data-match][data-ready]');
  return { ctx, page };
}
const shot = (page, n) => SHOTS && page.screenshot({ path: `${SHOTS}/${n}.png` });
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
const beat = (page, b) => page.waitForFunction((x) => document.querySelector('[data-match]').dataset.beat === x, b, { timeout: 20000 });

test('unmatched: calm card, no stage, no spin', async () => {
  const { ctx, page } = await open('unmatched');
  assert.equal(await page.locator('[data-card]').isVisible(), true);
  assert.equal(await page.locator('[data-stage]').isVisible(), false);
  assert.match(await page.locator('[data-card]').innerText(), /No one fits well enough yet/);
  await shot(page, 'unmatched'); assert.ok(await noOverflow(page)); await ctx.close();
});

test('first view: wheel keeps your side visible, rise, tap to card', async () => {
  const { ctx, page } = await open('first');
  await beat(page, 'wheel');
  assert.match(await page.locator('[data-left]').innerText(), /Maya/, 'your side shows while the wheel spins');
  await shot(page, 'wheel'); assert.ok(await noOverflow(page));
  await beat(page, 'rise');
  assert.equal(await page.locator('[data-line]').innerText(), 'Finding your peer in Texas. Searching 223 partner organizations across 21 countries, reaching 500,320 students');
  const who = await page.locator('[data-who]').innerText();
  assert.match(who, /Daniel/); assert.doesNotMatch(who, /Daniel[ \t]+[A-Z]/, 'first name only');
  await shot(page, 'rise');
  await page.locator('[data-right]').tap();
  await page.locator('[data-card]').waitFor({ state: 'visible' });
  const text = await page.locator('[data-card]').innerText();
  for (const t of ['You do', 'They do', 'Together', 'In common', 'Ask', "Let's write an email together"]) assert.ok(text.toLowerCase().includes(t.toLowerCase()), t);
  await shot(page, 'card'); assert.ok(await noOverflow(page));
  await page.locator('[data-compose-open]').tap();
  assert.equal(await page.locator('[data-compose-mount]').evaluate((e) => !e.hidden), true, 'mount opens for #248 (empty until then)');
  await ctx.close();
});

test('replay: lands on the card, Replay plays the stage again', async () => {
  const { ctx, page } = await open('replay');
  assert.equal(await page.locator('[data-card]').isVisible(), true);
  await shot(page, 'replay');
  await page.locator('[data-replay]').tap();
  await page.locator('[data-stage]').waitFor({ state: 'visible' });
  await ctx.close();
});

test('reduced motion: crossfade to the card, no confetti', async () => {
  const { ctx, page } = await open('first', 'reduce');
  await page.locator('[data-card]').waitFor({ state: 'visible', timeout: 10000 });
  assert.equal(await page.locator('[data-confetti]').count(), 0);
  await shot(page, 'reduced'); await ctx.close();
});
