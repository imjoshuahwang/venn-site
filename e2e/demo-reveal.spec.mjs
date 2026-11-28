// Sealed reveal (#321): seal -> pause -> open -> full-screen celebration, per outcome, at 390x844 on the demo (fake Supabase).
// The demo /portal redirects to onboarding (#320), so the /demo form's "Already onboarded" fixture flag (demo fake only) skips it.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import * as pw from 'playwright';
import { localServerEnv } from '../scripts/qa/portal.mjs';
import { stopServer } from '../scripts/qa/dev-server.mjs';

const BASE = 'http://127.0.0.1:8034';
let server, browser;

before(async () => {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/SUPABASE|TURNSTILE|RESEND/.test(k)));
  server = spawn('npx', ['astro', 'dev', '--host', '127.0.0.1', '--port', '8034'], { env: localServerEnv('http://127.0.0.1:1', 'x', {}, env), stdio: 'ignore', detached: true });
  for (let i = 0; i < 120; i++) {
    if (await fetch(`${BASE}/demo`).then((r) => r.ok, () => false)) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  browser = await pw.chromium.launch();
});
after(async () => { await browser?.close(); stopServer(server); });

async function open(outcome, reducedMotion = 'no-preference') {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion });
  const page = await ctx.newPage();
  const errors = [], external = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('request', (r) => /supabase\.co/.test(r.url()) && external.push(r.url()));
  await page.goto(`${BASE}/demo`);
  await page.getByLabel('Already onboarded').check();
  await page.locator(`button[value="${outcome}"]`).click();
  await page.waitForURL(/\/portal\/set-password/);
  await page.goto(`${BASE}/portal`);
  await page.locator('[data-ceremony][data-ready]').waitFor({ state: 'attached' });
  return { ctx, page, errors, external };
}

const current = (page) => page.locator('[data-slide][data-pos="current"]');
async function openSeal(page) {
  await page.evaluate(() => {
    window.__gaps = [];
    let last = performance.now();
    const tick = (t) => { window.__gaps.push(t - last); last = t; requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  await current(page).getByRole('button', { name: 'Open' }).click();
}

for (const [outcome, answer, partners] of [['cohort-aws', /You are in|Dear Applicant/, ['AWS']], ['cohort-quadron', /You are in|Dear Applicant/, ['Quadron']], ['cohort-both', /You are in|Dear Applicant/, ['AWS', 'Quadron']]]) {
  test(`${outcome}: seal, pause, celebration, answer first, letter slots`, async () => {
    const { ctx, page, errors, external } = await open(outcome);
    await page.waitForTimeout(300);
    assert.match(await current(page).innerText(), /Your Fall '26 Result/);
    await openSeal(page);
    await page.locator('[data-celebrate][data-state="running"]').waitFor({ timeout: 3000 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `/tmp/321-${outcome}-confetti.png` });
    const first = await current(page).innerText();
    assert.match(first, answer, 'first slide after the open answers "Am I in?"');
    for (const p of partners) assert.match(first, new RegExp(p));
    await page.locator('[data-celebrate][data-state="done"]').waitFor({ timeout: 6000 });
    const gaps = await page.evaluate(() => window.__gaps.slice(5).sort((a, b) => a - b));
    assert.ok(gaps[Math.floor(gaps.length * 0.95)] < 50, `rAF gap p95 ${gaps[Math.floor(gaps.length * 0.95)]}ms`);
    await current(page).getByRole('button', { name: 'Continue' }).click();
    await page.locator('[data-slide][data-pos="current"] [data-letter-slot]').waitFor();
    assert.deepEqual(await page.locator('[data-letter-slot]').evaluateAll((els) => [...new Set(els.map((e) => e.dataset.cohort))].length), partners.length);
    assert.equal(await page.locator('[data-celebrate][data-state="running"]').count(), 0, 'one celebration only');
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
    await ctx.close();
  });
}

test('peer: celebrates, then hands off to the result page', async () => {
  const { ctx, page, errors, external } = await open('peer');
  await openSeal(page);
  await page.locator('[data-celebrate][data-state="running"]').waitFor({ timeout: 3000 });
  await current(page).getByRole('button', { name: 'See my match' }).click();
  await page.waitForURL(/\/portal\/result/);
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  await ctx.close();
});

test('reduced motion skips the confetti', async () => {
  const { ctx, page, errors } = await open('cohort-aws', 'reduce');
  await openSeal(page);
  await page.locator('[data-celebrate][data-state="skipped"]').waitFor({ timeout: 3000 });
  assert.match(await current(page).innerText(), /AWS/);
  assert.equal(await page.locator('[data-celebrate][data-state="running"]').count(), 0);
  assert.deepEqual(errors, []);
  await ctx.close();
});
