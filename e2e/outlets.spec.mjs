// Outlet cohort slideshows (#172), LOCAL stack only. Run: npm run test:e2e:outlets
// Each outlet gets a placed test user (contact+portal-* email, no email sent); 6 slides, no phone or contact text.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium, devices } from 'playwright';
import { createClient } from '@supabase/supabase-js';

const st = JSON.parse(execFileSync('supabase', ['status', '-o', 'json'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().replace(/^[^{]*/, ''));
const API = st.API_URL;
assert.match(API, /127\.0\.0\.1|localhost/, 'refusing to run against a non-local stack');
const admin = createClient(API, st.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const PORT = 8172;
const BASE = `http://127.0.0.1:${PORT}`;
const PASSWORD = 'e2e-Outlet-pass-1';
const SHOTS = new URL('../qa/172/', import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });
const OUTLETS = ['kinetic', 'mercator-post', 'to-be-obsolete', 'thebaytable', 'imperial-review', 'yvette-labs'];
const VIEWPORTS = { 'iphone-se': 'iPhone SE (3rd gen)', 'iphone-15': 'iPhone 15', 'pixel-7': 'Pixel 7' };
const run = Date.now().toString(36);
const created = [];
let server, browser;

before(async () => {
  server = spawn('npx', ['astro', 'dev', '--host', '127.0.0.1', '--port', String(PORT)], {
    env: { ...process.env, PUBLIC_SUPABASE_URL: API, PUBLIC_SUPABASE_ANON_KEY: st.ANON_KEY, PORTAL_HOST: 'portal.invalid' },
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
    await admin.from('consents').delete().eq('user_id', u.id);
    await admin.from('results').delete().eq('id', u.resId);
    await admin.from('applications').delete().eq('id', u.appId);
    await admin.auth.admin.deleteUser(u.id);
  }
});

async function makePlaced(slug, tag) {
  const email = `contact+portal-e2e-outlet-${run}-${tag}@joinvenn.org`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  assert.ifError(error);
  const cohort = await admin.from('cohorts').select('id').eq('slug', slug).single();
  assert.ifError(cohort.error);
  const app = await admin.from('applications').insert({ role: 'student', level: 'college', name: 'E2E Outlet', email, working_on: 'e2e', source: 'test' }).select('id').single();
  assert.ifError(app.error);
  const res = await admin.from('results').insert({ application_id: app.data.id, season: 'fall-2026', outcome: 'cohort', cohort_id: cohort.data.id, status: 'approved', approved_at: new Date().toISOString() }).select('id').single();
  assert.ifError(res.error);
  for (const clause of ['coordinator_groups', 'highlights', 'full_name_photo', 'data_use', 'retention']) {
    const c = await admin.from('consents').insert({ user_id: data.user.id, clause, accepted: true, version: '2026-11-v1' });
    if (c.error) throw new Error('consent seed: ' + c.error.message);
  }
  created.push({ id: data.user.id, appId: app.data.id, resId: res.data.id });
  return email;
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

for (const [phone, preset] of Object.entries(VIEWPORTS)) {
  for (const slug of OUTLETS) {
    test(`${slug} slideshow (${phone})`, async () => {
      const email = await makePlaced(slug, `${slug}-${phone}`);
      const { defaultBrowserType, ...d } = devices[preset];
      const ctx = await browser.newContext(d);
      const page = await ctx.newPage();
      await login(page, email);
      await page.goto(`${BASE}/portal/result`);
      const deck = page.locator('[data-slides]');
      await deck.waitFor();
      assert.equal(await deck.locator('[data-slide]').count(), 6);
      const next = page.locator('[data-next]');
      for (let i = 0; i < 6; i++) {
        if (i > 0) await next.click();
        await page.waitForTimeout(450);
        if (i === 0 || i === 3) await deck.screenshot({ path: `${SHOTS}${slug}-${phone}${i === 3 ? '-role' : ''}.png`, scale: 'css' });
      }
      const text = await deck.innerText();
      assert.doesNotMatch(text, /(\+?\d[\d\s().-]{8,}\d)|tel:|phone|whatsapp|@\w+\.\w+/i, 'no phone or contact text');
      await ctx.close();
    });
  }
}
