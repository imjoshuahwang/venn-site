// Throwaway (#244): taps through every beat of /portal/dev/match at 390px and saves a screenshot each.
// Run: MATCH_BASE=<preview or local url> node --test e2e/match-shots.spec.mjs   (screenshots land in qa-shots/)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = (process.env.MATCH_BASE || 'http://127.0.0.1:8000').replace(/\/$/, '');
const SHOTS = new URL('../qa-shots/', import.meta.url).pathname;
let browser, ctx, page;
before(async () => {
  mkdirSync(SHOTS, { recursive: true });
  browser = await chromium.launch();
  ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, extraHTTPHeaders: process.env.MATCH_HEADERS ? JSON.parse(process.env.MATCH_HEADERS) : {} });
  page = await ctx.newPage();
});
after(async () => { await ctx?.close(); await browser?.close(); });

const shot = (n) => page.screenshot({ path: `${SHOTS}${n}.png` });
const beat = (b) => page.waitForFunction((x) => document.querySelector('[data-m]').dataset.beat === x, b, { timeout: 15000 });

test('every beat is reachable by tapping', async () => {
  await page.goto(`${BASE}/portal/dev/match`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelector('[data-line]').textContent.length > 30);
  await shot('1-stage');
  assert.match(await page.textContent('[data-line]'), /Searching/);
  await beat('wheel'); await page.waitForTimeout(1200); await shot('2-wheel');
  await beat('stop'); await shot('3-stop');
  await beat('rise'); await page.waitForTimeout(600); await shot('4-rise');
  assert.equal(await page.textContent('[data-line]'), 'Searching 223 partner organizations across 21 countries, reaching 500,320 students');
  await page.tap('[data-right]');
  await beat('lift'); await page.waitForTimeout(250); await shot('5-lift');
  await beat('card'); await page.waitForTimeout(500); await shot('6-card');
  await page.tap('[data-to-compose]'); await beat('compose'); await page.waitForTimeout(500); await shot('7-compose');
  await page.fill('[data-learn]', 'How they pick a first project');
  await page.tap('[data-compose] button[type=submit]'); await beat('end'); await page.waitForTimeout(500); await shot('8-requested');
  for (const s of ['accepted', 'declined', 'expired', 'unmatched']) { await page.tap(`[data-state=${s}]`); await page.waitForTimeout(500); await shot(`9-${s}`); }
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= 390), true, 'no horizontal scroll');
});
