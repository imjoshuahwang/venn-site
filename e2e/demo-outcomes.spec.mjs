// #323: non-cohort outcomes (peer, network_waitlist, track_waitlist, not_this_season) click through result, home, next steps at 390x844.
// Own dev server on port 8035 with no secrets; demo needs none. Zero console errors, no supabase.co request.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import * as pw from 'playwright';
import { localServerEnv } from '../scripts/qa/portal.mjs';
import { stopServer } from '../scripts/qa/dev-server.mjs';

const BASE = 'http://127.0.0.1:8035';
let server, browser;

before(async () => {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/SUPABASE|TURNSTILE|RESEND/.test(k)));
  server = spawn('npx', ['astro', 'dev', '--host', '127.0.0.1', '--port', '8035'], { env: localServerEnv('http://127.0.0.1:1', 'x', {}, env), stdio: 'ignore', detached: true });
  for (let i = 0; i < 120; i++) {
    if (await fetch(`${BASE}/demo`).then((r) => r.ok, () => false)) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  browser = await pw.chromium.launch();
});
after(async () => { await browser?.close(); stopServer(server); });

async function start(outcome) {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const errors = [], external = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('request', (r) => /supabase\.co/.test(r.url()) && external.push(r.url()));
  await page.goto(`${BASE}/demo`);
  await page.locator(`button[value="${outcome}"]`).click();
  await page.waitForURL(/\/portal\/set-password/);
  return { page, errors, external };
}
const cur = (page) => page.locator('[data-slide][data-pos="current"]');
const advance = async (page) => { await cur(page).locator('[data-next]').first().click(); await page.waitForTimeout(450); };

for (const outcome of ['network_waitlist', 'track_waitlist', 'not_this_season', 'peer']) {
  test(`${outcome}: result, home, next steps`, async () => {
    const { page, errors, external } = await start(outcome);
    await page.goto(`${BASE}/portal/result`);
    await cur(page).waitFor();
    if (outcome === 'peer') {
      await advance(page);
      await cur(page).getByRole('heading', { name: /You got matched with Maya/ }).waitFor();
      await cur(page).getByRole('button', { name: 'Accept' }).click();
      await page.waitForTimeout(450);
      await cur(page).getByText('Your intro is unlocked').waitFor();
    } else {
      await advance(page);
      await cur(page).locator('.letter').waitFor();
      if (outcome === 'not_this_season') {
        await advance(page);
        await advance(page);
        await cur(page).locator('[data-optin]').waitFor();
      }
    }
    await page.goto(`${BASE}/portal`);
    if (new URL(page.url()).pathname === '/portal') await cur(page).getByRole('heading', { name: /Your results are here/ }).waitFor();
    await page.goto(`${BASE}/portal/next-steps`);
    await cur(page).waitFor();
    await advance(page);
    await cur(page).locator('[data-steps-done]').waitFor();
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
    await page.context().close();
  });
}
