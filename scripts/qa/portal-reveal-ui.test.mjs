// Phone QA for #226: cohort reveal (Play -> stat line -> "But you stood out." -> popup) on the dev stub at 390x844. Boots its own dev server.
// Set REVEAL_SHOTS=<dir> to also save a screenshot per beat.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { overflow } from './checks.mjs';
import { statLine } from '../../src/data/reveal-facts.ts';

const SHOTS = process.env.REVEAL_SHOTS;
let base, server, browser;
const freePort = () => new Promise((res) => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); });

before(async () => {
  const port = await freePort();
  base = `http://localhost:${port}`;
  server = spawn('npx', ['astro', 'dev', '--port', String(port), '--host', 'localhost'], { stdio: 'ignore', env: { ...process.env, PUBLIC_SUPABASE_URL: process.env.PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321', PUBLIC_SUPABASE_ANON_KEY: process.env.PUBLIC_SUPABASE_ANON_KEY || 'fixture-anon' } });
  for (let i = 0; i < 120; i++) { try { if ((await fetch(base + '/portal/result?stub=cohort')).status < 500) break; } catch {} await new Promise((r) => setTimeout(r, 500)); }
  browser = await chromium.launch();
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
});
after(async () => { await browser?.close(); server?.kill('SIGTERM'); });

const noOverflow = async (page, beat) => { const r = await overflow(page); assert.equal(r.pass, true, `${beat}: ${r.details}`); };
const shot = (page, name) => SHOTS && page.screenshot({ path: `${SHOTS}/${name}.png` });

async function run(partner, reducedMotion, tag) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/portal/result?stub=cohort${partner ? `&partner=${partner}` : ''}`);
  const root = page.locator('[data-cohort-reveal]');
  await root.waitFor({ state: 'visible' });
  await shot(page, `${tag}-1-play`);
  await noOverflow(page, 'play');
  assert.equal(await page.locator('[data-reveal-play]').isVisible(), true);
  await page.locator('[data-reveal-play]').tap();
  if (reducedMotion === 'reduce') {
    await page.locator('[data-popup]').waitFor({ state: 'visible', timeout: 500 });
    assert.equal(await page.locator('[data-confetti]').count(), 0, 'no confetti under reduced motion');
  } else {
    await page.waitForFunction(() => document.querySelector('[data-typed]').textContent.length > 20);
    await shot(page, `${tag}-2-typing`);
    await noOverflow(page, 'typing');
    await page.waitForFunction(() => document.querySelector('[data-cohort-reveal]').dataset.state === 'stood');
    await page.waitForTimeout(900);
    await shot(page, `${tag}-3-stood`);
    await noOverflow(page, 'stood');
    await page.locator('[data-popup]').waitFor({ state: 'visible', timeout: 2500 });
    await page.waitForTimeout(500);
    assert.ok((await page.locator('[data-confetti]').count()) > 0, 'confetti falls');
  }
  assert.equal(await page.locator('[data-typed]').textContent(), statLine());
  assert.doesNotMatch(await page.locator('[data-typed]').textContent(), /%/);
  await shot(page, `${tag}-4-popup`);
  await noOverflow(page, 'popup');
  assert.equal(await page.locator('[data-popup] a, [data-popup] button').count(), 1, 'popup has one primary action');
  assert.match(await page.locator('[data-popup-title]').textContent(), /^Welcome to Venn x .+ Fall Cohort 2026$/);
  assert.ok((await page.locator('[data-popup-logo]').evaluate((i) => i.naturalWidth)) > 0, 'logo loaded');
  assert.deepEqual(errors, []);
  await ctx.close();
}

test('aws reveal, full motion', () => run(null, 'no-preference', 'aws'));
test('aws reveal, reduced motion: popup straight after Play', () => run(null, 'reduce', 'aws-reduced'));
test('quadron reveal comes from config', () => run('quadron', 'no-preference', 'quadron'));
