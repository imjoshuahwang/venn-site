// Onboarding as slides (#320): /demo -> account, profile, (minor: MOU + parent co-sign), consent -> the reveal entry at 390x844.
// Own dev server on port 8033 with no env at all. Enter advances, Back retraces, no console errors, no request to supabase.co.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import * as pw from 'playwright';
import { localServerEnv } from '../scripts/qa/portal.mjs';
import { stopServer } from '../scripts/qa/dev-server.mjs';

const BASE = 'http://127.0.0.1:8033';
const CUR = '[data-slide][data-pos="current"]';
let server, browser;

before(async () => {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/SUPABASE|TURNSTILE|RESEND/.test(k)));
  server = spawn('npx', ['astro', 'dev', '--host', '127.0.0.1', '--port', '8033'], { env: localServerEnv('http://127.0.0.1:1', 'x', {}, env), stdio: 'ignore', detached: true });
  for (let i = 0; i < 120; i++) {
    if (await fetch(`${BASE}/demo`).then((r) => r.ok, () => false)) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  browser = await pw.chromium.launch();
});
after(async () => { await browser?.close(); stopServer(server); });

const title = (page) => page.locator(`${CUR} h1`);
async function sign(page) {
  const box = await page.locator(`${CUR} canvas`).boundingBox();
  await page.mouse.move(box.x + 20, box.y + 60);
  await page.mouse.down();
  await page.mouse.move(box.x + 160, box.y + 120, { steps: 8 });
  await page.mouse.up();
}
const fill = async (page, name, value) => { await page.locator(`${CUR} [name="${name}"]`).fill(value); await page.keyboard.press('Enter'); };

async function start(age) {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const errors = [], external = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('request', (r) => /supabase\.co/.test(r.url()) && external.push(r.url()));
  await page.goto(`${BASE}/demo`);
  if (age === 'minor') await page.getByLabel('Minor').check();
  await page.locator('button[value="cohort-aws"]').click();
  await page.waitForURL(/\/portal\/set-password/);
  await title(page).filter({ hasText: 'Create your account' }).waitFor();
  await page.keyboard.press('Enter');
  await page.locator(`${CUR} input[type="password"]`).fill('demo-pass-123');
  await page.keyboard.press('Enter');
  await page.waitForURL(/\/portal\/onboarding\/profile/);
  await fill(page, 'name', 'Maya Okafor');
  // Back retraces one slide, and Enter walks forward again.
  await page.locator('[data-back]').click();
  await title(page).filter({ hasText: 'call you' }).waitFor();
  await page.keyboard.press('Enter');
  await fill(page, 'location', 'Columbus, Ohio');
  await fill(page, 'birthday', age === 'minor' ? '2010-05-05' : '2005-05-05');
  return { page, errors, external };
}

async function consent(page) {
  await page.waitForURL(/\/portal\/ceremony/);
  while (!(await title(page).filter({ hasText: 'sound fair' }).count())) await page.keyboard.press('Enter');
  await page.locator(`${CUR} [data-next]`).click();
  await page.waitForURL(/\/portal(\?.*)?$/);
}

test('18+ path: account, profile, consent, then the reveal entry', async () => {
  const { page, errors, external } = await start('adult');
  await consent(page);
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  await page.context().close();
});

test('minor path: MOU, parent co-sign, consent, then the reveal entry', async () => {
  const { page, errors, external } = await start('minor');
  await page.waitForURL(/\/portal\/mou\/minor/);
  await page.keyboard.press('Enter'); // terms read
  await sign(page);
  await page.keyboard.press('Enter');
  await title(page).filter({ hasText: 'parent or guardian' }).waitFor();
  await page.getByRole('button', { name: 'They are here with me' }).click();
  await fill(page, 'parent_name', 'Ada Okafor');
  await title(page).filter({ hasText: 'please sign' }).waitFor();
  await page.locator('[data-back]').click();
  await title(page).filter({ hasText: 'full name' }).waitFor();
  await page.keyboard.press('Enter');
  await sign(page);
  await page.keyboard.press('Enter');
  await title(page).filter({ hasText: 'everything' }).waitFor();
  await page.locator(`${CUR} [data-next]`).click();
  await page.waitForURL((u) => !/\/mou\/minor/.test(u.pathname));
  if (/\/portal\/ceremony/.test(page.url())) await consent(page);
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  await page.context().close();
});
