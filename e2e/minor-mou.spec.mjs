// Consent click-path, LOCAL stack only (supabase start + astro dev). Run: npm run test:e2e
// Test users are made through the local admin API with plus-addressed contact+portal-*@joinvenn.org emails; no email is sent.
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
const PORT = 8224;
const BASE = `http://127.0.0.1:${PORT}`;
const PASSWORD = 'e2e-Mou-pass-1';
const SHOTS = new URL('../qa/portal-shots/224/', import.meta.url).pathname;
const VIEWPORTS = { 'iphone-se': 'iPhone SE (3rd gen)', 'iphone-15': 'iPhone 15', 'pixel-7': 'Pixel 7' };
const run = Date.now().toString(36);
const created = [];
let server, browser;

// email_key strips +tags, so every contact+portal-* user maps to the same applications; keep one live at a time.
async function dropApps() {
  for (const u of created) await admin.from('applications').delete().eq('id', u.appId);
}

async function makeUser(tag, level) {
  await dropApps();
  const email = `contact+portal-e2e-${run}-${tag}@joinvenn.org`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  assert.ifError(error);
  const app = await admin.from('applications').insert({ role: 'student', level, name: 'E2E Student', email, working_on: 'e2e' }).select('id').single();
  assert.ifError(app.error);
  created.push({ id: data.user.id, appId: app.data.id });
  return { email, id: data.user.id };
}

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
    await admin.from('minor_mou').delete().eq('user_id', u.id);
    await admin.from('parent_consents').delete().eq('user_id', u.id);
    await admin.from('applications').delete().eq('id', u.appId);
    await admin.auth.admin.deleteUser(u.id);
  }
});

async function login(page, email) {
  await admin.from('portal_rate_hits').delete().gte('id', 0);
  await page.goto(`${BASE}/portal/login`);
  await page.fill('input[name=email]', email);
  await page.fill('input[name=password]', PASSWORD);
  await page.waitForFunction(() => document.querySelector('input[name="cf-turnstile-response"]')?.value);
  await page.click('button[type=submit]');
  await page.waitForURL((u) => !u.pathname.endsWith('/portal/login'));
}

async function checkLayout(page, label) {
  const bad = await page.evaluate(() => {
    const out = [];
    if (document.documentElement.scrollWidth > innerWidth) out.push('horizontal overflow');
    for (const el of document.querySelectorAll('button, a, label.clause')) {
      const r = el.getBoundingClientRect();
      if (r.width && (r.width < 44 || r.height < 44)) out.push(`small target ${el.tagName} ${r.width}x${r.height}`);
    }
    return out;
  });
  assert.deepEqual(bad, [], `${label}: ${bad.join('; ')}`);
}


const draw = async (page, sel) => {
  const b = await page.locator(sel).boundingBox();
  await page.mouse.move(b.x + 20, b.y + 40); await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(b.x + 20 + i * 10, b.y + 40 + (i % 2) * 40);
  await page.mouse.up();
};
const rows = async (id) => (await admin.from('minor_mou').select('minor_sig,parent_sig,confirmed_at').eq('user_id', id)).data[0];

for (const [slug, preset] of Object.entries(VIEWPORTS)) {
  const ctxOpts = () => { const { defaultBrowserType, ...d } = devices[preset]; return d; };
  const shot = (page, name) => page.screenshot({ path: `${SHOTS}${name}-${slug}.png`, fullPage: true, scale: 'css' });

  test(`minor MOU is blocked without both signatures, then confirms (${slug})`, async () => {
    const u = await makeUser(`mou-${slug}`, 'high_school');
    const ctx = await browser.newContext(ctxOpts());
    const page = await ctx.newPage();
    await login(page, u.email);
    await page.goto(`${BASE}/portal/mou/minor`);
    await page.locator('[data-step=terms]:visible').waitFor();
    await shot(page, 'mou-terms');
    await checkLayout(page, 'mou-terms');
    await page.click('[data-go=minor]');
    // an empty pad is refused
    await page.click('[data-save=minor]');
    await page.locator('[data-step=minor] .err').waitFor({ state: 'visible' });
    assert.equal(await rows(u.id), undefined);
    await draw(page, '[data-pad=minor]');
    await shot(page, 'mou-minor-sig');
    await checkLayout(page, 'mou-minor-sig');
    await page.click('[data-save=minor]');
    await page.locator('[data-step=parent]:visible').waitFor();
    // blocked: the server refuses to confirm with the parent missing
    const blocked = await page.evaluate(() => fetch('/portal/mou/minor/api', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'confirm' }) }).then((r) => r.status));
    assert.equal(blocked, 400);
    assert.equal((await rows(u.id)).confirmed_at, null);
    await shot(page, 'mou-parent-door');
    await checkLayout(page, 'mou-parent-door');
    // parent email may not be the student's own
    await page.click('[data-go=parent-link]');
    await page.fill('[name=parent_email]', u.email.replace('@', '+mom@'));
    await page.click('[data-send]');
    await page.locator('[data-step=parent-link] .err').waitFor({ state: 'visible' });
    await shot(page, 'mou-parent-link');
    await checkLayout(page, 'mou-parent-link');
    await page.click('[data-go=parent]');
    await page.click('[data-go=parent-here]');
    await page.click('[data-save=parent]');
    await page.locator('[data-step=parent-here] .err').waitFor({ state: 'visible' });
    await page.fill('[name=parent_name]', 'Pat Parent');
    await draw(page, '[data-pad=parent]');
    await shot(page, 'mou-parent-sig');
    await checkLayout(page, 'mou-parent-sig');
    await page.click('[data-save=parent]');
    await page.locator('[data-step=confirm]:visible').waitFor();
    await shot(page, 'mou-confirm');
    await checkLayout(page, 'mou-confirm');
    await page.click('[data-confirm]');
    await page.waitForURL(`${BASE}/portal`);
    const r = await rows(u.id);
    assert.ok(r.minor_sig && r.parent_sig && r.confirmed_at);
    await ctx.close();
  });
}
