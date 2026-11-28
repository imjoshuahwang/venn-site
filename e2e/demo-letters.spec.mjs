// Acceptance letters and share (#322): AWS, Quadron and dual at 390x844 on the demo (fake Supabase), PNG sizes, LinkedIn intent.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import * as pw from 'playwright';
import { localServerEnv } from '../scripts/qa/portal.mjs';
import { stopServer } from '../scripts/qa/dev-server.mjs';

const BASE = 'http://127.0.0.1:8039';
let server, browser;
before(async () => {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/SUPABASE|TURNSTILE|RESEND/.test(k)));
  server = spawn('npx', ['astro', 'dev', '--host', '127.0.0.1', '--port', '8039'], { env: localServerEnv('http://127.0.0.1:1', 'x', {}, env), stdio: 'ignore', detached: true });
  for (let i = 0; i < 120; i++) {
    if (await fetch(`${BASE}/demo`).then((r) => r.ok, () => false)) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  browser = await pw.chromium.launch();
});
after(async () => { await browser?.close(); stopServer(server); });

const current = (page) => page.locator('[data-slide][data-pos="current"]');
async function walk(outcome) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', acceptDownloads: true });
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
  await current(page).getByRole('button', { name: 'Open' }).click();
  await current(page).getByRole('button', { name: 'Continue' }).click();
  return { ctx, page, errors, external };
}
async function readLetters(page, n) {
  const seen = [];
  for (let i = 0; i < n; i++) {
    await page.locator('[data-slide][data-pos="current"] [data-letter-slot]').waitFor();
    seen.push(await current(page).innerText());
    await current(page).locator('[data-next]').click();
  }
  return seen;
}
const dims = async (page, size) => {
  const [dl] = await Promise.all([page.waitForEvent('download'), current(page).locator(`[data-card-dl="${size}"]`).click()]);
  const buf = readFileSync(await dl.path());
  assert.equal(buf.subarray(1, 4).toString(), 'PNG');
  return [buf.readUInt32BE(16), buf.readUInt32BE(20), dl.suggestedFilename()];
};

for (const [outcome, names, texts] of [
  ['cohort-aws', ['AWS'], [/one of ten students/, /Bias for Action/, /contact@joinvenn\.org/]],
  ['cohort-quadron', ['Quadron'], [/one of 20 students/, /Dan Pratl wants to talk to you/, /Email Dan/]],
  ['cohort-both', ['AWS', 'Quadron'], [/one of ten students/, /one of 20 students/, /Email Dan/]],
]) {
  test(`${outcome}: letters, share card sizes, LinkedIn intent`, async () => {
    const { ctx, page, errors, external } = await walk(outcome);
    const seen = (await readLetters(page, 4 * names.length)).join('\n');
    for (const t of texts) assert.match(seen, t);
    await page.screenshot({ path: `/tmp/322-${outcome}-share.png` });
    assert.match(await current(page).innerText(), new RegExp(`names ${names.join(' and ')}`));
    const [w, h, name] = await dims(page, 'square');
    assert.deepEqual([w, h], [1200, 1200]);
    for (const n of names) assert.match(name, new RegExp(n.toLowerCase()));
    assert.deepEqual((await dims(page, 'wide')).slice(0, 2), [1200, 627]);
    const href = new URL(await current(page).locator('[data-linkedin]').getAttribute('href'));
    assert.equal(href.origin + href.pathname, 'https://www.linkedin.com/feed/');
    assert.equal(href.searchParams.get('text'), 'I got accepted into Venn Fall 2026');
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
    await ctx.close();
  });
}
