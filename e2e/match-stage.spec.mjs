// Match stage (#247) on the dev stub at 390x844, no database. Boots its own dev server. Set MATCH_SHOTS=<dir> for screenshots.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { chromium, webkit } from 'playwright';
import { resolveDevices, contextOptions, slug } from '../scripts/qa/devices.mjs';

const SHOTS = process.env.MATCH_SHOTS;
let base, server;
const engines = { chromium, webkit };
const DEVICES = resolveDevices({ names: (process.env.MATCH_DEVICES || 'iPhone 15,Galaxy S9+').split(',') });
const browsers = {};
const freePort = () => new Promise((res) => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); });

before(async () => {
  const port = await freePort();
  base = `http://localhost:${port}`;
  server = spawn('npx', ['astro', 'dev', '--port', String(port), '--host', 'localhost'], { stdio: 'ignore', env: { ...process.env, PUBLIC_SUPABASE_URL: process.env.PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321', PUBLIC_SUPABASE_ANON_KEY: process.env.PUBLIC_SUPABASE_ANON_KEY || 'fixture-anon' } });
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${base}/portal/match?stub=unmatched`)).status < 500) break; } catch {} await new Promise((r) => setTimeout(r, 500)); }
  for (const d of DEVICES) browsers[d.browser] ??= await engines[d.browser].launch();
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
});
after(async () => { for (const b of Object.values(browsers)) await b.close(); server?.kill('SIGTERM'); });

let dev = DEVICES[0];
async function open(stub, reducedMotion = 'no-preference') {
  const ctx = await browsers[dev.browser].newContext({ ...contextOptions(dev), reducedMotion });
  const page = await ctx.newPage();
  await page.goto(`${base}/portal/match?stub=${stub}`);
  await page.waitForSelector('[data-match][data-ready]');
  return { ctx, page };
}
const shot = (page, n) => SHOTS && page.screenshot({ path: `${SHOTS}/${slug(dev.name)}-${n}.png` });
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
const beat = (page, b) => page.waitForFunction((x) => document.querySelector('[data-match]').dataset.beat === x, b, { timeout: 20000 });

for (const d of DEVICES) {
  const dev_ = d;
  test(`${d.name}: unmatched: calm card, no stage, no spin`, async () => { dev = d;
    const { ctx, page } = await open('unmatched');
    assert.equal(await page.locator('[data-card]').isVisible(), true);
    assert.equal(await page.locator('[data-stage]').isVisible(), false);
    assert.match(await page.locator('[data-card]').innerText(), /No one fits well enough yet/);
    await shot(page, 'unmatched'); assert.ok(await noOverflow(page)); await ctx.close();
  });

  test(`${d.name}: first view: wheel keeps your side visible, rise, tap to card`, async () => { dev = d;
    const { ctx, page } = await open('first');
    await beat(page, 'wheel');
    assert.match(await page.locator('[data-left]').innerText(), /Maya/, 'your side shows while the wheel spins');
    await shot(page, 'wheel'); assert.ok(await noOverflow(page));
    await beat(page, 'rise');
    assert.equal(await page.locator('[data-tags]').count(), 0, 'no You / Your peer tags');
    assert.equal(await page.locator('[data-line]').innerText(), 'Finding your peer in Texas. Searching 223 partner organizations across 21 countries, reaching 500,320 students');
    const who = await page.locator('[data-who]').innerText();
    assert.match(who, /Daniel/); assert.doesNotMatch(who, /Daniel[ \t]+[A-Z]/, 'first name only');
    await shot(page, 'rise');
    await page.locator('[data-right]').tap();
    await page.locator('[data-card]').waitFor({ state: 'visible' });
    const text = await page.locator('[data-card]').innerText();
    for (const t of ['You do', 'They do', 'Together', 'In common', 'Ask', "Let's write an email together"]) assert.ok(text.toLowerCase().includes(t.toLowerCase()), t);
    await shot(page, 'card'); assert.ok(await noOverflow(page));
    await page.locator('[data-compose-open]').tap();
    assert.equal(await page.locator('[data-compose-mount]').evaluate((e) => !e.hidden), true, 'mount opens for #248 (empty until then)');
    await ctx.close();
  });

  test(`${d.name}: replay: lands on the card, Replay plays the stage again`, async () => { dev = d;
    const { ctx, page } = await open('replay');
    assert.equal(await page.locator('[data-card]').isVisible(), true);
    for (const t of ['You do', 'They do', 'Together', 'In common', 'Ask']) assert.ok((await page.locator('[data-card]').innerText()).toLowerCase().includes(t.toLowerCase()), t);
    assert.equal(await page.locator('[data-compose-open]').isVisible(), true);
    assert.ok(await noOverflow(page));
    await shot(page, 'replay');
    await page.locator('[data-replay]').tap();
    await page.locator('[data-stage]').waitFor({ state: 'visible' });
    await ctx.close();
  });

  test(`${d.name}: reduced motion: crossfade to the card, no confetti`, async () => { dev = d;
    const { ctx, page } = await open('first', 'reduce');
    await page.locator('[data-card]').waitFor({ state: 'visible', timeout: 1500 });
    assert.equal(await page.locator('[data-stage]').isVisible(), false, 'no typing or rise first');
    assert.equal(await page.locator('[data-line]').innerText(), '');
    assert.equal(await page.locator('[data-confetti]').count(), 0);
    await shot(page, 'reduced'); await ctx.close();
  });

  test(`${d.name}: reduced motion marks viewed once, replay does not`, async () => { dev = d;
    const ctx = await browsers[dev.browser].newContext({ ...contextOptions(dev), reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    const posts = [];
    await page.route('**/portal/api/match', (r) => { posts.push(JSON.parse(r.request().postData())); r.fulfill({ status: 200, body: '{}' }); });
    await page.goto(`${base}/portal/match?stub=first&probe=1`);
    await page.waitForSelector('[data-match][data-ready]');
    await page.locator('[data-card]').waitFor({ state: 'visible' });
    assert.equal(posts.filter((b) => b.action === 'viewed').length, 1);
    assert.equal(posts.filter((b) => b.type === 'stage_opened').length, 1);
    await page.locator('[data-replay]').tap(); await page.waitForTimeout(500);
    assert.equal(posts.filter((b) => b.action === 'viewed').length, 1, 'replay never re-marks viewed');
    await ctx.close();
  });
  test(`${d.name}: frames across the wheel and rise, no jank`, async () => { dev = d;
    const { ctx, page } = await open('first');
    await beat(page, 'wheel');
    const pair = () => page.locator('[data-pair]').boundingBox();
    const box0 = await pair();
    for (const n of [1, 2, 3, 4]) { await page.waitForTimeout(500); await shot(page, `wheel-${n}`); assert.ok(await noOverflow(page)); const b = await pair(); assert.deepEqual([b.x, b.width, b.height], [box0.x, box0.width, box0.height], 'pair does not shift while spinning'); }
    await page.waitForFunction(() => document.querySelector('[data-match]').dataset.beat === 'wheel' && !document.querySelector('[data-strip]').getAnimations().length, null, { timeout: 20000 });
    await shot(page, 'stop');
    await beat(page, 'rise');
    for (const n of [1, 2, 3]) { await shot(page, `rise-${n}`); await page.waitForTimeout(120); }
    await page.waitForTimeout(500); await shot(page, 'rise-end');
    assert.ok(await noOverflow(page));
    await ctx.close();
  });
  test(`${d.name}: opener frame`, async () => { dev = d;
    const { ctx, page } = await open('first');
    await page.waitForTimeout(400); await shot(page, 'opener-typing');
    await beat(page, 'wheel'); await ctx.close();
  });
}
