// Consent click-path, LOCAL stack only (supabase start + astro dev). Run: npm run test:e2e
// Test users are made through the local admin API with plus-addressed contact+portal-*@joinvenn.org emails; no email is sent.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { chromium, devices } from 'playwright';
import { localServerEnv } from '../scripts/qa/portal.mjs';
import { freePort, stopServer, supabaseStatus } from '../scripts/qa/dev-server.mjs';
import { createClient } from '@supabase/supabase-js';

const st = supabaseStatus();
const API = st.API_URL;
const admin = createClient(API, st.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const PORT = await freePort();
const BASE = `http://127.0.0.1:${PORT}`;
const PASSWORD = 'e2e-Consent-pass-1';
const SHOTS = new URL('../qa/portal-shots/127/', import.meta.url).pathname;
const SHOTS128 = new URL('../qa/portal-shots/128/', import.meta.url).pathname;
const VIEWPORTS = { 'iphone-se': 'iPhone SE (3rd gen)', 'iphone-15': 'iPhone 15', 'pixel-7': 'Pixel 7' };
const run = Date.now().toString(36);
const created = [];
let server, browser;

// email_key strips +tags, so every contact+portal-* user maps to the same applications; keep one live at a time.
async function dropApps() {
  for (const u of created) {
    await admin.from('results').delete().eq('application_id', u.appId);
    await admin.from('applications').delete().eq('id', u.appId);
  }
}

async function makeUser(tag, level) {
  await dropApps();
  const email = `contact+portal-e2e-${run}-${tag}@joinvenn.org`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  assert.ifError(error);
  const app = await admin.from('applications').insert({ role: 'student', level, name: 'E2E Student', email, working_on: 'e2e' }).select('id').single();
  assert.ifError(app.error);
  // Home (#225) shows the consent link only for someone with a result; without one it is the "could not find a result" state.
  const res = await admin.from('results').insert({ application_id: app.data.id, season: 'e2e', outcome: 'cohort', status: 'approved', approved_at: new Date().toISOString(), viewed_at: new Date().toISOString(), ceremony_done_at: new Date().toISOString() });
  assert.ifError(res.error);
  created.push({ id: data.user.id, appId: app.data.id });
  return { email, id: data.user.id };
}

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
});

after(async () => {
  await browser?.close();
  stopServer(server);
  for (const u of created) {
    await admin.from('consents').delete().eq('user_id', u.id);
    await admin.from('results').delete().eq('application_id', u.appId);
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
  await page.waitForURL('**/portal/ceremony');
}
const readAll = async (page) => { while (await page.locator('[data-next]').isVisible()) await page.click('[data-next]'); };
const tick = (page, name) => page.locator(`label.clause:has(input[name=${name}])`).click();
const consentRows = async (id) => Object.fromEntries((await admin.from('consents').select('clause,accepted').eq('user_id', id)).data.map((r) => [r.clause, r.accepted]));

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

for (const [slug, preset] of Object.entries(VIEWPORTS)) {
  const ctxOpts = () => { const { defaultBrowserType, ...d } = devices[preset]; return d; };
  const shot = (page, name) => page.screenshot({ path: `${SHOTS}${name}-${slug}.png`, fullPage: true, scale: 'css' });

  test(`adult applicant consents (${slug})`, async () => {
    const u = await makeUser(`adult-${slug}`, 'college');
    const ctx = await browser.newContext(ctxOpts());
    const page = await ctx.newPage();
    await login(page, u.email);
    // Entry point 1: first visit to /portal lands in ceremony setup.
    assert.equal(new URL(page.url()).pathname, '/portal/ceremony');
    await page.waitForSelector('form.consent');
    assert.equal(await page.locator('[data-page]:visible').count(), 1);
    await shot(page, 'ceremony-consent-empty');
    await checkLayout(page, 'ceremony-consent-empty');
    await page.goto(`${BASE}/portal/consent`);
    await page.waitForSelector('form.consent');
    await shot(page, 'consent-empty');
    await checkLayout(page, 'consent-empty');
    for (let i = 0; i < 3; i++) await page.click('[data-next]');
    await tick(page, 'highlights');
    await readAll(page);
    assert.equal(await page.locator('[data-yes]').isVisible(), true);
    await shot(page, 'consent-ready');
    await page.click('[data-yes]');
    await page.waitForURL(`${BASE}/portal`);
    await shot(page, 'consent-done');
    assert.deepEqual(await consentRows(u.id), { coordinator_groups: true, highlights: false, full_name_photo: false, data_use: true, retention: true });
    await checkLayout(page, 'consent-done');
    // Later visits land on home, not ceremony.
    await page.goto(`${BASE}/portal`);
    assert.equal(new URL(page.url()).pathname, '/portal');
    // Entry point 2: home links to /portal/consent, which shows the saved state.
    await page.click('a[href="/portal/consent"]');
    await page.waitForURL(`${BASE}/portal/consent`);
    await page.waitForSelector('form.consent');
    for (let i = 0; i < 3; i++) await page.click('[data-next]');
    // The three required clauses are answered by the final Yes and have no box; only the two optional choices show saved state.
    for (const [n, on] of Object.entries({ highlights: false, full_name_photo: false })) {
      assert.equal(await page.locator(`input[name=${n}]`).isChecked(), on, n);
    }
    await shot(page, 'consent-reopened');
    await checkLayout(page, 'consent-reopened');
    await ctx.close();
  });

  const shot128 = (page, name) => page.screenshot({ path: `${SHOTS128}${name}-${slug}.png`, fullPage: true, scale: 'css' });

  test(`high school applicant goes to cosign (${slug})`, async () => {
    const u = await makeUser(`hs-${slug}`, 'high_school');
    const ctx = await browser.newContext(ctxOpts());
    const page = await ctx.newPage();
    await login(page, u.email);
    await readAll(page);
    await page.click('[data-yes]');
    await page.waitForURL(`${BASE}/portal`);
    await page.waitForSelector('[data-home]'); // #225 removed the home parent form; co-sign is the /portal/parent link, covered below
    await shot(page, 'cosign');
    await ctx.close();
  });

  test(`failed save keeps answers (${slug})`, async () => {
    const u = await makeUser(`fail-${slug}`, 'college');
    const ctx = await browser.newContext(ctxOpts());
    const page = await ctx.newPage();
    await login(page, u.email);
    const names = ['full_name_photo'];
    await page.goto(`${BASE}/portal/consent#page-4`);
    for (const n of names) await tick(page, n);
    await readAll(page);
    await page.route('**/portal/consent', (r) => (r.request().method() === 'POST' ? r.abort() : r.continue()));
    await page.click('[data-yes]');
    await page.locator('.err').waitFor({ state: 'visible' });
    assert.match(await page.locator('.err').innerText(), /did not save/);
    for (const n of names) assert.equal(await page.locator(`input[name=${n}]`).isChecked(), true);
    assert.equal(await page.locator('[data-yes]').isDisabled(), false);
    await shot(page, 'consent-error');
    await checkLayout(page, 'consent-error');
    assert.deepEqual(await consentRows(u.id), {});
    await ctx.close();
  });
  test(`home shows an error, not home or a redirect, when consent_state is missing (${slug})`, async () => {
    const u = await makeUser(`nofn-${slug}`, 'college');
    const ctx = await browser.newContext(ctxOpts());
    const page = await ctx.newPage();
    await login(page, u.email);
    const psql = (sql) => execFileSync('psql', [st.DB_URL, '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-c', sql]).toString();
    psql('revoke execute on function public.consent_state(text) from authenticated');
    try {
      await page.goto(`${BASE}/portal`);
      await page.locator('[role=alert]').waitFor({ state: 'visible' });
      assert.equal(new URL(page.url()).pathname, '/portal');
      assert.match(await page.locator('[role=alert]').innerText(), /We could not load this page/);
      assert.equal(await page.locator('a[href="/portal/consent"]').count(), 0);
      await shot(page, 'home-consent-load-error');
      await checkLayout(page, 'home-consent-load-error');
      assert.equal(await page.locator('[data-retry]').count(), 1);
    } finally {
      psql('grant execute on function public.consent_state(text) to authenticated');
    }
    // Retry after the function is back: the error clears and the signed-in user lands on the ceremony (consent not yet given).
    await page.click('[data-retry]');
    await page.waitForURL('**/portal/ceremony');
    assert.equal(await page.locator("[role=alert]:visible").count(), 0);
    await ctx.close();
  });
  test(`parent co-sign clears the home wait, a reused link is calm, an adult never sees it (${slug})`, async () => {
    const u = await makeUser(`parent-${slug}`, 'high_school');
    const ctx = await browser.newContext(ctxOpts());
    const page = await ctx.newPage();
    await login(page, u.email);
    await readAll(page);
    await page.click('[data-yes]');
    await page.waitForURL(`${BASE}/portal`);
    await page.goto(`${BASE}/portal`);
    await page.waitForSelector('[data-home]');
    await shot128(page, 'parent-waiting');
    await checkLayout(page, 'parent-waiting');
    // Mint the link the form would email, so the e2e never sends mail.
    const { data: token, error } = await admin.rpc('request_parent_consent', { p_user_id: u.id, p_parent_email: `contact+portal-e2e-${run}-p-${slug}@joinvenn.org` });
    assert.ifError(error);
    const parent = await browser.newContext(ctxOpts());
    const pp = await parent.newPage();
    await pp.goto(`${BASE}/portal/parent/${token}`);
    await pp.getByRole('button', { name: 'I agree' }).waitFor();
    await shot128(pp, 'parent-link');
    await checkLayout(pp, 'parent-link');
    await pp.getByRole('button', { name: 'I agree' }).click();
    await pp.getByText('this has been signed').waitFor();
    await pp.goto(`${BASE}/portal/parent/${token}`);
    await pp.getByText('this has been signed').waitFor();
    await shot128(pp, 'parent-reused');
    await parent.close();
    await page.goto(`${BASE}/portal`);
    await page.waitForSelector('[data-home]');
    await shot128(page, 'parent-signed');
    await ctx.close();
  });

  test(`an expired parent link is calm and a resend works (${slug})`, async () => {
    const u = await makeUser(`exp-${slug}`, 'high_school');
    const ctx = await browser.newContext(ctxOpts());
    const page = await ctx.newPage();
    await login(page, u.email);
    await readAll(page);
    await page.click('[data-yes]');
    await page.waitForURL(`${BASE}/portal`);
    const to = `contact+portal-e2e-${run}-x-${slug}@joinvenn.org`;
    const first = (await admin.rpc('request_parent_consent', { p_user_id: u.id, p_parent_email: to })).data;
    await admin.from('parent_consents').update({ expires_at: new Date(Date.now() - 60000).toISOString() }).eq('user_id', u.id);
    const parent = await browser.newContext(ctxOpts());
    const pp = await parent.newPage();
    await pp.goto(`${BASE}/portal/parent/${first}`);
    await pp.getByText('expired or is not valid').waitFor();
    assert.equal(await pp.getByRole('button', { name: 'I agree' }).count(), 0);
    await shot128(pp, 'parent-expired');
    await checkLayout(pp, 'parent-expired');
    // Resend goes through the RPC, not the form, so no mail is attempted.
    const second = (await admin.rpc('request_parent_consent', { p_user_id: u.id, p_parent_email: to })).data;
    await pp.goto(`${BASE}/portal/parent/${second}`);
    await pp.getByRole('button', { name: 'I agree' }).waitFor();
    await pp.goto(`${BASE}/portal/parent/${first}`);
    await pp.getByText('expired or is not valid').waitFor();
    await parent.close();
    await ctx.close();
  });

  test(`an adult never sees the parent route (${slug})`, async () => {
    const u = await makeUser(`noparent-${slug}`, 'college');
    const ctx = await browser.newContext(ctxOpts());
    const page = await ctx.newPage();
    await login(page, u.email);
    await readAll(page);
    await page.click('[data-yes]');
    await page.waitForURL(`${BASE}/portal`);
    assert.equal(await page.locator('form.parent-request').count(), 0);
    const res = await page.request.post(`${BASE}/portal/parent-request`, { form: { parent_email: 'p@example.org' }, headers: { origin: BASE } });
    assert.equal(res.status(), 403);
    await ctx.close();
  });
}
