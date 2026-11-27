// Peer accept/decline page at 390px, against astro dev with stub env and the dev-only `fixture-*` tokens (no database).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import * as pw from 'playwright';
import { localServerEnv } from '../scripts/qa/portal.mjs';

const PORT = 8135;
const BASE = `http://127.0.0.1:${PORT}`;
let server, browser;

before(async () => {
  server = spawn('npx', ['astro', 'dev', '--host', '127.0.0.1', '--port', String(PORT)], {
    env: localServerEnv('http://127.0.0.1:1', 'x', { PORTAL_HOST: 'portal.invalid' }), stdio: 'ignore',
  });
  for (let i = 0; i < 120; i++) {
    if (await fetch(`${BASE}/intro/fixture-open`).then((r) => r.ok, () => false)) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  browser = await pw.chromium.launch();
});
after(async () => { await browser?.close(); server?.kill(); });

const phone = async () => {
  const { defaultBrowserType, ...d } = pw.devices['iPhone SE (3rd gen)'];
  const page = await (await browser.newContext({ ...d, viewport: { width: 390, height: 844 } })).newPage();
  const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  // Turnstile test keys pass instantly, but the token lands a beat after load; submit only once it is there.
  const token = () => page.waitForFunction(() => document.querySelector('[name="cf-turnstile-response"]')?.value);
  return { page, fits, token };
};

test('GET shows the request without a last name or contact, noindex', async () => {
  const r = await fetch(`${BASE}/intro/fixture-open`);
  const html = await r.text();
  assert.match(r.headers.get('cache-control'), /no-store/);
  assert.match(html, /noindex/);
  assert.match(html, /Maya would like an intro/);
  assert.doesNotMatch(html.replace(/contact@joinvenn.org/g, ""), /[\w.]+@[\w-]+\.(com|org|edu)|tel:/);
});

test('Accept at 390px', async () => {
  const { page, fits, token } = await phone();
  await page.goto(`${BASE}/intro/fixture-open`);
  assert.ok(await fits());
  await token();
  await page.getByRole('button', { name: 'Accept' }).click();
  await page.getByRole('heading', { name: 'Accepted' }).waitFor();
  assert.ok(await fits());
});

test('Not now at 390px, and Report asks before it acts', async () => {
  const { page, fits, token } = await phone();
  await page.goto(`${BASE}/intro/fixture-open`);
  await token();
  await page.getByRole('button', { name: 'Not now' }).click();
  await page.getByRole('heading', { name: 'Not now' }).waitFor();
  await page.goto(`${BASE}/intro/fixture-open`);
  await token();
  await page.getByRole('button', { name: 'Report' }).click();
  await page.getByRole('heading', { name: 'Report this request?' }).waitFor();
  assert.ok(await fits());
  await page.getByRole('link', { name: 'Back' }).click();
  await page.getByRole('heading', { name: /would like an intro/ }).waitFor();
});

test('every other state has its own page', async () => {
  for (const [s, h] of [['accepted', 'Accepted'], ['declined', 'Not now'], ['expired', 'This request expired'], ['withdrawn', 'This request was withdrawn'], ['reported', 'Reported'], ['unknown', 'This link is not valid']]) {
    assert.match(await (await fetch(`${BASE}/intro/fixture-${s}`)).text(), new RegExp(`<h1[^>]*>${h}</h1>`));
  }
});
