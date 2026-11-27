// Onboarding click-path (#223), LOCAL stack only (supabase start + astro dev). Run: npm run test:e2e
// Test users are made through the local admin API with plus-addressed contact+portal-*@joinvenn.org emails; no email is sent.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { chromium, devices } from 'playwright';
import { createClient } from '@supabase/supabase-js';

const st = JSON.parse(execFileSync('supabase', ['status', '-o', 'json'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().replace(/^[^{]*/, ''));
const API = st.API_URL;
assert.match(API, /127\.0\.0\.1|localhost/, 'refusing to run against a non-local stack');
const admin = createClient(API, st.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const PORT = 8223;
const BASE = `http://127.0.0.1:${PORT}`;
const PASSWORD = 'e2e-Onboard-pass-1';
const SHOTS = new URL('../qa/portal-shots/223/', import.meta.url).pathname;
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
    env: { ...process.env, PUBLIC_SUPABASE_URL: API, PUBLIC_SUPABASE_ANON_KEY: st.ANON_KEY },
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


const ctxOpts = () => ({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const shot = (page, name) => page.screenshot({ path: `${SHOTS}${name}.png`, fullPage: true, scale: 'css' });
const row = async (id) => (await admin.from('applications').select('*').eq('id', id).single()).data;
const path = (page) => new URL(page.url()).pathname;
const bday = (years, extraDays = 0) => { const d = new Date(); d.setUTCFullYear(d.getUTCFullYear() - years); d.setUTCDate(d.getUTCDate() + extraDays); return d.toISOString().slice(0, 10); };

async function overflow(page, label) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${label}: horizontal overflow`);
}
async function toProfile(page, u) {
  await login(page, u.email);
  await page.goto(`${BASE}/portal/set-password`);
  await shot(page, `${u.tag}-1-account`);
  await page.fill('input[name=password]', PASSWORD);
  await page.waitForFunction(() => document.querySelector('input[name="cf-turnstile-response"]')?.value);
  await page.click('button[type=submit]');
  await page.waitForURL('**/portal/onboarding/profile');
}
async function profile(page, u, birthday) {
  await page.fill('input[name=name]', 'Ada Tester'); await shot(page, `${u.tag}-2-name`);
  await page.click('[data-panel]:visible [data-next]');
  await page.fill('input[name=location]', 'Lagos, Nigeria'); await shot(page, `${u.tag}-3-location`);
  await page.click('[data-panel]:visible [data-next]');
  await page.fill('input[name=birthday]', birthday); await shot(page, `${u.tag}-4-birthday`);
  await page.click('button[type=submit]');
  await page.waitForURL('**/portal/onboarding/contact');
}
async function contact(page, u) {
  await shot(page, `${u.tag}-5-org`);
  await page.locator('label.ob-choice:has(input[value=yes])').first().click();
  await page.fill('input[name=phone]', '+1 415 555 0123'); await shot(page, `${u.tag}-6-phone`);
  await page.click('[data-panel]:visible [data-next]');
  await shot(page, `${u.tag}-7-whatsapp`);
  await page.locator('label.ob-choice:has(input[name=whatsapp][value=yes])').click();
  assert.match(await page.locator('[data-consent-text]').innerText(), /trusted Venn team member.*WhatsApp is the main channel/);
  await shot(page, `${u.tag}-8-consent`);
  await page.locator('.ob-consent').click();
  await page.click('button[type=submit]');
}

test('adult: set-password, profile, contact, then /portal (390px)', async () => {
  const u = { ...(await makeUser('adult', 'college')), tag: 'adult' };
  const ctx = await browser.newContext(ctxOpts()); const page = await ctx.newPage();
  await toProfile(page, u);
  assert.ok(!page.url().includes('Ada') && !page.url().includes('?'), 'no personal data in URLs');
  await overflow(page, 'profile');
  await profile(page, u, bday(30));
  await overflow(page, 'contact');
  // Portal home goes back to the next unfinished step while onboarding is open.
  await page.goto(`${BASE}/portal`);
  assert.equal(path(page), '/portal/onboarding/contact');
  await contact(page, u);
  await page.waitForURL(/\/portal(\/ceremony)?$/);
  const r = await row(u.appId);
  assert.equal(r.full_name, 'Ada Tester'); assert.equal(r.phone, '+14155550123'); assert.equal(r.whatsapp_opt_in, true); assert.ok(r.onboarding_consent_at);
  await ctx.close();
});

test('under 18: ends on the MOU step (390px)', async () => {
  const u = { ...(await makeUser('minor', 'high_school')), tag: 'minor' };
  const ctx = await browser.newContext(ctxOpts()); const page = await ctx.newPage();
  await toProfile(page, u);
  await profile(page, u, bday(18, 1)); // turns 18 tomorrow
  await contact(page, u);
  await page.waitForURL('**/portal/onboarding/mou');
  await shot(page, 'minor-9-mou');
  await page.goto(`${BASE}/portal`);
  assert.equal(path(page), '/portal/onboarding/mou');
  await ctx.close();
});

test('phone and WhatsApp are required: errors, no write', async () => {
  const u = { ...(await makeUser('req', 'college')), tag: 'req' };
  const ctx = await browser.newContext(ctxOpts()); const page = await ctx.newPage();
  await toProfile(page, u);
  await profile(page, u, bday(30));
  await page.locator('label.ob-choice:has(input[value=yes])').first().click();
  await page.click('[data-panel]:visible [data-next]'); // empty phone
  assert.match(await page.locator('[data-err]:visible').innerText(), /phone number/);
  await shot(page, 'req-phone-error');
  await page.fill('input[name=phone]', '+14155550123');
  await page.click('[data-panel]:visible [data-next]');
  assert.equal(await page.locator('input[name=whatsapp]').first().isVisible(), true); // no choice yet: the form cannot finish
  // Server side: a post without WhatsApp is refused and writes nothing.
  const res = await page.request.post(`${BASE}/portal/onboarding/contact`, { form: { orgOk: 'yes', phone: '+14155550123', consent: 'on' }, headers: { origin: BASE } });
  assert.match(await res.text(), /WhatsApp/);
  const r = await row(u.appId);
  assert.equal(r.phone, null); assert.equal(r.onboarding_consent_at, null);
  await ctx.close();
});
