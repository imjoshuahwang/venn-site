// Scanner-safe sign-in link, LOCAL stack only (supabase start + astro dev). A GET (mail scanner) must not spend the link; the POST does.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync, spawn } from 'node:child_process';
import { chromium, devices } from 'playwright';
import { createClient } from '@supabase/supabase-js';

// status exits 1 when an optional service (imgproxy, pooler) is stopped; the JSON is still valid.
const st = JSON.parse(spawnSync('supabase', ['status', '-o', 'json'], { stdio: ['ignore', 'pipe', 'ignore'] }).stdout.toString().replace(/^[^{]*/, ''));
const API = st.API_URL;
assert.match(API, /127\.0\.0\.1|localhost/, 'refusing to run against a non-local stack');
const admin = createClient(API, st.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const PORT = 8134;
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = new URL('../qa/portal-shots/234/', import.meta.url).pathname;
let server, browser, userId;

before(async () => {
  server = spawn('npx', ['astro', 'dev', '--host', '127.0.0.1', '--port', String(PORT)], {
    env: { ...process.env, PUBLIC_SUPABASE_URL: API, PUBLIC_SUPABASE_ANON_KEY: st.ANON_KEY, SUPABASE_URL: API, SUPABASE_SERVICE_ROLE_KEY: st.SERVICE_ROLE_KEY },
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
  if (userId) { await admin.from('portal_links').delete().eq('user_id', userId); await admin.auth.admin.deleteUser(userId); }
});

test('a scanner GET leaves the link live, one POST signs in, a replay lands on the expired page (390px)', async () => {
  const email = `contact+portal-e2e-link-${Date.now().toString(36)}@joinvenn.org`;
  const made = await admin.auth.admin.createUser({ email, password: 'e2e-Link-pass-1', email_confirm: true });
  assert.ifError(made.error);
  userId = made.data.user.id;
  const { data, error } = await admin.auth.admin.generateLink({ type: 'recovery', email });
  assert.ifError(error);
  const token = data.properties.hashed_token;
  const hash = createHash('sha256').update(token).digest('hex');
  assert.ifError((await admin.from('portal_links').insert({ user_id: userId, token_hash: hash })).error);
  const url = `${BASE}/portal/auth/callback?token_hash=${token}&type=recovery&next=${encodeURIComponent('/portal/set-password')}`;
  const used = async () => (await admin.from('portal_links').select('used_at').eq('token_hash', hash).single()).data.used_at;

  const scan = await fetch(url, { redirect: 'manual' });
  assert.equal(scan.status, 200);
  assert.match(scan.headers.get('cache-control'), /no-store/);
  assert.equal(scan.headers.get('referrer-policy'), 'same-origin');
  assert.equal(await used(), null);
  const evil = await fetch(`${BASE}/portal/auth/callback`, { method: 'POST', redirect: 'manual', headers: { origin: 'https://evil.example', 'content-type': 'application/x-www-form-urlencoded' }, body: `token_hash=${token}&type=recovery` });
  assert.equal(evil.status, 403);
  assert.equal(await used(), null);

  const { defaultBrowserType, ...d } = devices['iPhone SE (3rd gen)'];
  const ctx = await browser.newContext({ ...d, viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(url);
  await page.getByRole('button', { name: 'Continue to your result' }).click();
  await page.waitForURL('**/portal/set-password');
  assert.notEqual(await used(), null);

  const ctx2 = await browser.newContext({ ...d, viewport: { width: 390, height: 844 } });
  const p2 = await ctx2.newPage();
  await p2.goto(url);
  await p2.getByRole('button', { name: 'Continue to your result' }).click();
  await p2.waitForURL('**/portal/resend?expired=1');
  await p2.getByText('Already set your password?').waitFor();
  const lead = await p2.locator('.lead').boundingBox();
  const form = await p2.locator('.auth-form').boundingBox();
  assert.ok(lead.y < form.y, 'sign-in lead sits above the resend form');
  assert.equal(await p2.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await p2.screenshot({ path: `${SHOTS}expired-390.png`, fullPage: true, scale: 'css' });
  await ctx.close(); await ctx2.close();
});
