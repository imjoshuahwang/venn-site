// Next-steps page, LOCAL stack only (supabase start + astro dev). Run: npm run test:e2e
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium, devices } from 'playwright';
import { localServerEnv } from '../scripts/qa/portal.mjs';
import { freePort, stopServer, supabaseStatus } from '../scripts/qa/dev-server.mjs';
import { createClient } from '@supabase/supabase-js';
import { mkdirSync } from 'node:fs';

const st = supabaseStatus();
const API = st.API_URL;
const admin = createClient(API, st.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const PORT = await freePort();
const BASE = `http://127.0.0.1:${PORT}`;
const PASSWORD = 'e2e-NextSteps-pass-1';
const SHOTS = process.env.SHOTS || '/private/tmp/claude-501/-Users-joshuahwang-venn/e6b0f322-fd8a-4214-84a0-62e119cfb2b2/scratchpad/qa243/';
mkdirSync(SHOTS, { recursive: true });
const run = Date.now().toString(36);
let server, browser, user, appId;

before(async () => {
  server = spawn('npx', ['astro', 'dev', '--host', '127.0.0.1', '--port', String(PORT)], {
    env: localServerEnv(API, st.ANON_KEY),
    stdio: 'ignore', detached: true,
  });
  for (let i = 0; i < 120; i++) {
    if (await fetch(`${BASE}/portal/login`).then((r) => r.ok, () => false)) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  browser = await chromium.launch();
  const email = `contact+portal-e2e-${run}-ns@joinvenn.org`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  assert.ifError(error);
  const app = await admin.from('applications').insert({ role: 'student', level: 'college', name: 'E2E Student', email, working_on: 'e2e' }).select('id').single();
  assert.ifError(app.error);
  user = { email, id: data.user.id }; appId = app.data.id;
});

after(async () => {
  await browser?.close();
  stopServer(server);
  if (user) {
    await admin.from('applications').delete().eq('id', appId);
    await admin.auth.admin.deleteUser(user.id);
  }
});

async function openPage(ctxOpts) {
  const ctx = await browser.newContext(ctxOpts);
  await ctx.addInitScript(() => { window.__opened = []; window.open = (...a) => { window.__opened.push(a); return null; }; });
  const page = await ctx.newPage();
  await admin.from('portal_rate_hits').delete().gte('id', 0);
  await page.goto(`${BASE}/portal/login`);
  await page.fill('input[name=email]', user.email);
  await page.fill('input[name=password]', PASSWORD);
  await page.waitForFunction(() => document.querySelector('input[name="cf-turnstile-response"]')?.value);
  await page.click('button[type=submit]');
  await page.waitForURL('**/portal/ceremony');
  await page.goto(`${BASE}/portal/next-steps`);
  await page.waitForSelector('[data-step="1"]:not([hidden])');
  return page;
}

const mobile = () => { const { defaultBrowserType, ...d } = devices['iPhone 15']; return { ...d, viewport: { width: 390, height: 844 } }; };

test('phone: step 1, next, type, send opens exact Gmail URL, back, hash', async () => {
  const page = await openPage(mobile());
  assert.match(await page.locator('[data-count]').innerText(), /Step 1 of 2/);
  assert.equal(await page.locator('[data-step="1"] img').count(), 0);
  assert.match(await page.locator('[data-step="1"]').innerText(), /Amazon Web Services, AWS and the AWS logo are trademarks of Amazon\.com, Inc\. or its affiliates\./);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  const bar = await page.locator('.ns-bar').boundingBox();
  const step = await page.locator('[data-step="1"]').boundingBox();
  assert.ok(bar.y < step.y, 'progress stacks on top at phone width');
  await page.screenshot({ path: `${SHOTS}step1-390.png`, fullPage: true, scale: 'css' });
  await page.click('[data-go="2"]');
  await page.waitForSelector('[data-step="2"]:not([hidden])');
  assert.match(await page.locator('[data-count]').innerText(), /Step 2 of 2/);
  assert.ok(page.url().endsWith('#step-2'));
  const ta = page.locator('#ns-body');
  await ta.fill('We are A&B Club.\nEvent: hack night\nTimeline: March');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: `${SHOTS}step2-390.png`, fullPage: true, scale: 'css' });
  await page.click('[data-send]');
  const opened = await page.evaluate(() => window.__opened);
  assert.equal(opened.length, 1);
  const e = encodeURIComponent;
  assert.equal(opened[0][0], `https://mail.google.com/mail/?view=cm&fs=1&to=contact%40joinvenn.org&cc=imjoshuahwang%40gmail.com&su=${e('Venn x AWS Fall Cohort 2026: hello from my organization')}&body=${e('We are A&B Club.\nEvent: hack night\nTimeline: March')}`);
  // end state after Send
  await page.waitForSelector('[data-done]:not([hidden])');
  assert.equal(await page.locator('[data-done] h2').innerText(), "You're in");
  assert.equal(await page.locator('[data-tick]').count(), 2);
  assert.match(await page.locator('[data-done]').innerText(), /WhatsApp/);
  assert.match(await page.locator('[data-count]').innerText(), /All done/);
  assert.equal(await page.locator('[data-step="2"]').isVisible(), false);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: `${SHOTS}done-390.png`, fullPage: true, scale: 'css' });
  await page.goBack();
  await page.waitForSelector('[data-step="2"]:not([hidden])');
  assert.match(await page.locator('[data-count]').innerText(), /Step 2 of 2/);
  await page.click('[data-go="1"]');
  await page.waitForSelector('[data-step="1"]:not([hidden])');
  assert.match(await page.locator('[data-count]').innerText(), /Step 1 of 2/);
});

test('phone: mailto fallback carries the same to, cc, body; I sent it ends on Venn', async () => {
  const page = await openPage(mobile());
  await page.click('[data-go="2"]');
  await page.waitForSelector('[data-step="2"]:not([hidden])');
  await page.locator('#ns-body').fill('We are A&B Club.\nEvent: hack night');
  assert.equal(await page.locator('[data-sent]').isVisible(), false);
  await page.locator('[data-mailto]').evaluate((a) => a.addEventListener('click', (e) => e.preventDefault()));
  await page.click('[data-mailto]');
  const href = await page.getAttribute('[data-mailto]', 'href');
  await page.click('[data-send]');
  const g = new URL((await page.evaluate(() => window.__opened))[0][0]);
  const m = new URL(href);
  assert.equal(m.pathname, g.searchParams.get('to'));
  assert.equal(m.searchParams.get('cc'), g.searchParams.get('cc'));
  assert.equal(m.searchParams.get('subject'), g.searchParams.get('su'));
  assert.equal(m.searchParams.get('body'), g.searchParams.get('body'));
  await page.goBack();
  await page.waitForSelector('[data-sent]:not([hidden])');
  await page.screenshot({ path: `${SHOTS}mailto-390.png`, fullPage: true, scale: 'css' });
  await page.click('[data-sent-btn]');
  await page.waitForSelector('[data-done]:not([hidden])');
  assert.equal(await page.locator('[data-done] h2').innerText(), "You're in");
});

test('desktop 1280: progress sits left of the step on the same row', async () => {
  const page = await openPage({ viewport: { width: 1280, height: 800 } });
  const bar = await page.locator('.ns-bar').boundingBox();
  const step = await page.locator('[data-step="1"]').boundingBox();
  assert.ok(bar.x < step.x, 'bar left of step');
  assert.ok(Math.abs(bar.y - step.y) < 20, 'same row');
  await page.screenshot({ path: `${SHOTS}step1-1280.png`, fullPage: true, scale: 'css' });
});
