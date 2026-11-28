// Demo mode smoke (#318): /demo -> each outcome's result page at 390x844, no console errors, no request to supabase.co.
// Own dev server on port 8030 with no env at all: demo must boot without secrets.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import * as pw from 'playwright';
import { localServerEnv } from '../scripts/qa/portal.mjs';
import { stopServer } from '../scripts/qa/dev-server.mjs';

const BASE = 'http://127.0.0.1:8030';
let server, browser;
const CASES = [
  ['cohort-aws', /Accepted into AWS/], ['cohort-quadron', /Accepted into Quadron/], ['cohort-both', /Accepted into AWS/],
  ['peer', /Your Peer/], ['network_waitlist', /Network waitlist/], ['track_waitlist', /Track waitlist/], ['not_this_season', /Not this Season/],
];

before(async () => {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/SUPABASE|TURNSTILE|RESEND/.test(k)));
  server = spawn('npx', ['astro', 'dev', '--host', '127.0.0.1', '--port', '8030'], { env: localServerEnv('http://127.0.0.1:1', 'x', {}, env), stdio: 'ignore', detached: true });
  for (let i = 0; i < 120; i++) {
    if (await fetch(`${BASE}/demo`).then((r) => r.ok, () => false)) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  browser = await pw.chromium.launch();
});
after(async () => { await browser?.close(); stopServer(server); });

async function run(outcome, age) {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const errors = [], external = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('request', (r) => /supabase\.co/.test(r.url()) && external.push(r.url()));
  await page.goto(`${BASE}/demo`);
  if (age === 'minor') await page.getByLabel('Minor').check();
  await page.locator(`button[value="${outcome}"]`).click();
  await page.waitForURL(/\/portal\/set-password/);
  await page.goto(`${BASE}/portal/result`);
  return { page, errors, external };
}

for (const [outcome, heading] of CASES) {
  test(`demo ${outcome} reaches its result page`, async () => {
    const { page, errors, external } = await run(outcome, 'adult');
    await page.getByRole('heading', { name: heading }).first().waitFor();
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
    await page.context().close();
  });
}

test('any password creates the account, minor toggle is honoured, sessions are isolated', async () => {
  const a = await run('peer', 'adult');
  const b = await run('not_this_season', 'minor');
  await a.page.getByRole('heading', { name: /Your Peer/ }).first().waitFor();
  await b.page.getByRole('heading', { name: /Not this Season/ }).first().waitFor();
  await b.page.goto(`${BASE}/portal/set-password`);
  await b.page.locator('input[type="password"]').first().fill('whatever-123');
  const second = b.page.locator('input[type="password"]').nth(1);
  if (await second.count()) await second.fill('whatever-123');
  await b.page.locator('form button[type="submit"]').first().click();
  await b.page.waitForURL((u) => !/\/portal\/set-password/.test(u.pathname));
  assert.doesNotMatch(b.page.url(), /login/);
  assert.deepEqual([...a.errors, ...b.errors], []);
  assert.deepEqual([...a.external, ...b.external], []);
});
