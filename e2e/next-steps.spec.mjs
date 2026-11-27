// Next-steps page, LOCAL stack only (supabase start + astro dev). Run: npm run test:e2e
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { chromium, devices } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { mkdirSync } from 'node:fs';

const st = JSON.parse(execFileSync('supabase', ['status', '-o', 'json'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().replace(/^[^{]*/, ''));
const API = st.API_URL;
assert.match(API, /127\.0\.0\.1|localhost/, 'refusing to run against a non-local stack');
const admin = createClient(API, st.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const PORT = 8228;
const BASE = `http://127.0.0.1:${PORT}`;
const PASSWORD = 'e2e-NextSteps-pass-1';
const SHOTS = process.env.SHOTS || new URL('../.qa/228/', import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });
const run = Date.now().toString(36);
let server, browser, user, appId;

before(async () => {
  server = spawn('npx', ['astro', 'dev', '--host', '127.0.0.1', '--port', String(PORT)], {
    env: { ...process.env, PUBLIC_SUPABASE_URL: API, PUBLIC_SUPABASE_ANON_KEY: st.ANON_KEY },
    stdio: 'ignore',
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
  server?.kill();
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
  await page.click('[data-go="1"]');
  await page.waitForSelector('[data-step="1"]:not([hidden])');
  assert.match(await page.locator('[data-count]').innerText(), /Step 1 of 2/);
});

test('desktop 1280: progress sits left of the step on the same row', async () => {
  const page = await openPage({ viewport: { width: 1280, height: 800 } });
  const bar = await page.locator('.ns-bar').boundingBox();
  const step = await page.locator('[data-step="1"]').boundingBox();
  assert.ok(bar.x < step.x, 'bar left of step');
  assert.ok(Math.abs(bar.y - step.y) < 20, 'same row');
  await page.screenshot({ path: `${SHOTS}step1-1280.png`, fullPage: true, scale: 'css' });
});
