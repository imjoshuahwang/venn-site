// G3 (#333): every /demo outcome, whole journey at 390x844: account, onboarding, consent, sealed reveal, letters, share, next steps.
// Own dev server on port 8037 with no secrets. Per path: zero supabase requests, zero console errors, ends on next steps.
// Screenshots (fixture names only) go to out/demo-all/<outcome>/<NN>-<slide>.png.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import * as pw from 'playwright';
import { localServerEnv } from '../scripts/qa/portal.mjs';
import { stopServer } from '../scripts/qa/dev-server.mjs';

const BASE = 'http://127.0.0.1:8037';
const OUT = new URL('../out/demo-all/', import.meta.url).pathname;
const CUR = '[data-slide][data-pos="current"]';
let server, browser;

before(async () => {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/SUPABASE|TURNSTILE|RESEND/.test(k)));
  server = spawn('npx', ['astro', 'dev', '--host', '127.0.0.1', '--port', '8037'], { env: localServerEnv('http://127.0.0.1:1', 'x', {}, env), stdio: 'ignore', detached: true });
  for (let i = 0; i < 120; i++) {
    if (await fetch(`${BASE}/demo`).then((r) => r.ok, () => false)) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  browser = await pw.chromium.launch();
});
after(async () => { await browser?.close(); stopServer(server); });

const cur = (page) => page.locator(CUR);
const title = (page) => page.locator(`${CUR} h1`);
async function sign(page) {
  const box = await page.locator(`${CUR} canvas`).boundingBox();
  await page.mouse.move(box.x + 20, box.y + 60);
  await page.mouse.down();
  await page.mouse.move(box.x + 160, box.y + 120, { steps: 8 });
  await page.mouse.up();
}
const fill = async (page, name, value) => { await page.locator(`${CUR} [name="${name}"]`).fill(value); await page.keyboard.press('Enter'); };

function recorder(outcome) {
  const dir = `${OUT}${outcome}/`;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  let n = 0;
  return async (page, slide) => {
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${dir}${String(++n).padStart(2, '0')}-${slide}.png` });
    return n;
  };
}

async function journey(outcome, minor) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const errors = [], external = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('request', (r) => /supabase/.test(new URL(r.url()).hostname) && external.push(r.url()));
  const shot = recorder(outcome);

  await page.goto(`${BASE}/demo`);
  if (minor) await page.getByLabel('Minor').check();
  await shot(page, 'demo');
  await page.locator(`button[value="${outcome}"]`).click();
  await page.waitForURL(/\/portal\/set-password/);
  await title(page).filter({ hasText: 'Create your account' }).waitFor();
  await shot(page, 'account');
  await page.keyboard.press('Enter');
  await page.locator(`${CUR} input[type="password"]`).fill('demo-pass-123');
  await shot(page, 'password');
  await page.keyboard.press('Enter');
  await page.waitForURL(/\/portal\/onboarding\/profile/);
  await shot(page, 'profile-name');
  await fill(page, 'name', 'Maya Okafor');
  await shot(page, 'profile-location');
  await fill(page, 'location', 'Columbus, Ohio');
  await shot(page, 'profile-birthday');
  await fill(page, 'birthday', minor ? '2010-05-05' : '2005-05-05');

  if (minor) {
    await page.waitForURL(/\/portal\/mou\/minor/);
    await shot(page, 'mou-terms');
    await page.keyboard.press('Enter');
    await sign(page);
    await shot(page, 'mou-signed');
    await page.keyboard.press('Enter');
    await title(page).filter({ hasText: 'parent or guardian' }).waitFor();
    await shot(page, 'mou-parent');
    await page.getByRole('button', { name: 'They are here with me' }).click();
    await fill(page, 'parent_name', 'Ada Okafor');
    await title(page).filter({ hasText: 'please sign' }).waitFor();
    await sign(page);
    await shot(page, 'mou-cosigned');
    await page.keyboard.press('Enter');
    await title(page).filter({ hasText: 'everything' }).waitFor();
    await shot(page, 'mou-done');
    await cur(page).locator('[data-next]').click();
    await page.waitForURL((u) => !/\/mou\/minor/.test(u.pathname));
  }

  await page.waitForURL(/\/portal\/ceremony/);
  while (!(await title(page).filter({ hasText: 'sound fair' }).count())) await page.keyboard.press('Enter');
  await shot(page, 'consent');
  await cur(page).locator('[data-next]').click();
  await page.waitForURL(/\/portal(\?.*)?$/);

  // Sealed reveal, then every slide the outcome shows until the deck leaves for another page.
  await page.locator('[data-ceremony][data-ready]').waitFor({ state: 'attached' });
  await shot(page, 'sealed');
  await cur(page).getByRole('button', { name: 'Open' }).click();
  return { ctx, page, errors, external, shot };
}

const slug = async (page) => (await cur(page).locator('h1, h2, h3').first().innerText().catch(() => 'slide')).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24);
// Screenshots the current slide, and returns true when it holds `last` (the control that ends the deck).
async function step(page, shot, label, last) {
  await shot(page, `${label}-${await slug(page)}`);
  const end = cur(page).locator(last);
  if (await end.count()) return end.first();
  await cur(page).locator('[data-next]').first().click();
  return null;
}
async function walk(page, shot, label, last) {
  for (let i = 0; i < 30; i++) {
    const end = await step(page, shot, label, last);
    if (end) return end;
  }
  assert.fail(`${label}: no end slide`);
}

async function finish(outcome, page, shot) {
  const cohort = outcome.startsWith('cohort');
  // Reveal: answer, letters, share. The deck's last control leaves for the portal (or the match for a peer).
  const end = await walk(page, shot, 'reveal', cohort ? '[data-card-dl]' : 'button:has-text("Go to my portal"), button:has-text("See my match")');
  if (cohort) {
    assert.match(await cur(page).innerText(), /Your card names/);
    await cur(page).locator('[data-linkedin]').waitFor();
    await cur(page).locator('[data-next]').first().click();
  } else {
    await end.click();
  }
  await page.waitForURL(/\/portal(\/result)?(\?.*)?$/);
  await page.waitForTimeout(500);
  if (!cohort) {
    await page.goto(`${BASE}/portal/result`);
    await cur(page).waitFor();
    if (outcome === 'peer') {
      await cur(page).locator('[data-next]').first().click();
      await cur(page).getByRole('heading', { name: /You got matched with Maya/ }).waitFor();
      await shot(page, 'match');
      await cur(page).getByRole('button', { name: 'Accept' }).click();
      await cur(page).getByText('Your intro is unlocked').waitFor();
      await shot(page, 'accepted');
    } else {
      await walk(page, shot, 'result', outcome === 'not_this_season' ? '[data-optin]' : '.letter');
    }
  } else {
    await page.goto(`${BASE}/portal`);
    await cur(page).waitFor();
    await shot(page, 'home');
  }
  await page.goto(`${BASE}/portal/next-steps${cohort ? `?partner=${outcome === 'cohort-quadron' ? 'quadron' : 'aws'}` : ''}`);
  await cur(page).waitFor();
  if (cohort) {
    await shot(page, 'steps-intro');
    await cur(page).locator('[data-next]').first().click();
    await cur(page).locator('#ns-body').waitFor();
    await shot(page, 'steps-email');
    await page.evaluate(() => { window.open = () => null; });
    await cur(page).locator('[data-send]').click();
    await cur(page).locator('[data-tick]').first().waitFor();
    await shot(page, 'steps-done');
  } else {
    await walk(page, shot, 'steps', '[data-steps-done]');
  }
}

for (const [outcome, minor] of [
  ['cohort-aws', false], ['cohort-quadron', true], ['cohort-both', false],
  ['peer', false], ['network_waitlist', false], ['track_waitlist', true], ['not_this_season', false],
]) {
  test(`${outcome}${minor ? ' (minor)' : ''}: account to next steps`, { timeout: 120000 }, async () => {
    const { ctx, page, errors, external, shot } = await journey(outcome, minor);
    await finish(outcome, page, shot);
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
    await ctx.close();
  });
}
