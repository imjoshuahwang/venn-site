// Team click-path (add, list, remove), LOCAL stack only. Run: npm run test:e2e:team
// Test users are made through the local admin API with contact+portal-* emails; no email is sent.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { chromium, devices } from 'playwright';
import { localServerEnv } from '../scripts/qa/portal.mjs';
import { createClient } from '@supabase/supabase-js';

const st = JSON.parse(execFileSync('supabase', ['status', '-o', 'json'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().replace(/^[^{]*/, ''));
const API = st.API_URL;
assert.match(API, /127\.0\.0\.1|localhost/, 'refusing to run against a non-local stack');
const admin = createClient(API, st.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const PORT = 8129;
const BASE = `http://127.0.0.1:${PORT}`;
const PASSWORD = 'e2e-Team-pass-1';
const SHOTS = new URL('../qa/portal-shots/129/', import.meta.url).pathname;
const VIEWPORTS = { 'iphone-se': 'iPhone SE (3rd gen)', 'iphone-15': 'iPhone 15', 'pixel-7': 'Pixel 7' };
const run = Date.now().toString(36);
const created = [];
let server, browser;

before(async () => {
  server = spawn('npx', ['astro', 'dev', '--host', '127.0.0.1', '--port', String(PORT)], {
    env: localServerEnv(API, st.ANON_KEY),
    stdio: 'ignore',
  });
  for (let i = 0; i < 120; i++) {
    if (await fetch(`${BASE}/portal/login`).then((r) => r.ok, () => false)) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  server?.kill();
  for (const u of created) {
    await admin.from('team_members').delete().eq('lead_result_id', u.resId);
    await admin.from('consents').delete().eq('user_id', u.id);
    await admin.from('results').delete().eq('id', u.resId);
    await admin.from('applications').delete().eq('id', u.appId);
    await admin.auth.admin.deleteUser(u.id);
  }
});

async function makeLead(tag) {
  const email = `contact+portal-e2e-team-${run}-${tag}@joinvenn.org`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  assert.ifError(error);
  const app = await admin.from('applications').insert({ role: 'student', level: 'college', name: 'E2E Lead', email, working_on: 'e2e', source: 'test' }).select('id').single();
  assert.ifError(app.error);
  const res = await admin.from('results').insert({ application_id: app.data.id, season: 'e2e', outcome: 'cohort', status: 'approved', approved_at: new Date().toISOString() }).select('id').single();
  assert.ifError(res.error);
  for (const clause of ['coordinator_groups', 'highlights', 'full_name_photo', 'data_use', 'retention']) {
    const c = await admin.from('consents').insert({ user_id: data.user.id, clause, accepted: true, version: '2026-11-v3' });
    if (c.error) throw new Error('consent seed: ' + c.error.message);
  }
  created.push({ id: data.user.id, appId: app.data.id, resId: res.data.id });
  return { email, id: data.user.id, resId: res.data.id };
}

async function login(page, email) {
  await admin.from('portal_rate_hits').delete().gte('id', 0);
  await page.goto(`${BASE}/portal/login`);
  await page.fill('input[name=email]', email);
  await page.fill('input[name=password]', PASSWORD);
  await page.waitForFunction(() => document.querySelector('input[name="cf-turnstile-response"]')?.value);
  await page.click('button[type=submit]');
  await page.waitForURL(/\/portal(\/ceremony)?$/);
}

async function checkLayout(page, label) {
  const bad = await page.evaluate(() => {
    const out = [];
    if (document.documentElement.scrollWidth > innerWidth) out.push('horizontal overflow');
    for (const el of document.querySelectorAll('button, a.pill, .team a, .team input:not([type=hidden])')) {
      const r = el.getBoundingClientRect();
      if (r.width && r.height < 44) out.push(`small target ${el.tagName} ${r.width}x${r.height}`);
    }
    return out;
  });
  assert.deepEqual(bad, [], `${label}: ${bad.join('; ')}`);
}

for (const [slug, preset] of Object.entries(VIEWPORTS)) {
  test(`lead adds, lists and removes co-founders (${slug})`, async () => {
    const lead = await makeLead(slug);
    const { defaultBrowserType, ...d } = devices[preset];
    const ctx = await browser.newContext(d);
    const page = await ctx.newPage();
    const shot = (name) => page.screenshot({ path: `${SHOTS}${name}-${slug}.png`, fullPage: true, scale: 'css' });
    await login(page, lead.email);
    await page.goto(`${BASE}/portal`);
    await page.click('a[href="/portal/team"]');
    await page.waitForURL(`${BASE}/portal/team`);
    await page.locator('form.add').waitFor();
    await shot('team-empty');
    await checkLayout(page, 'empty');
    for (const n of [1, 2, 3]) {
      await page.fill('input[name=email]', `contact+portal-e2e-team-${run}-${slug}-m${n}@joinvenn.org`);
      await page.click('button.pill');
      await page.waitForURL(/added=1/);
      assert.equal(await page.locator('.list li').count(), n);
    }
    assert.equal(await page.locator('form.add').count(), 0, 'no add form once full');
    assert.equal((await page.locator('.state').allInnerTexts()).every((t) => t === 'invited'), true);
    await shot('team-full');
    await checkLayout(page, 'full');
    await page.locator('form.x button').first().click();
    await page.waitForURL(/removed=1/);
    assert.equal(await page.locator('.list li').count(), 2);
    await shot('team-removed');
    await checkLayout(page, 'removed');
    // Error state: duplicate live member is refused and nothing is written.
    await page.fill('input[name=email]', `contact+portal-e2e-team-${run}-${slug}-m2@joinvenn.org`);
    await page.click('button.pill');
    await page.locator('[role=alert]').waitFor();
    assert.equal(await page.locator('.list li').count(), 2);
    await shot('team-error');
    await checkLayout(page, 'error');
    await ctx.close();
  });
}
