// Match stage (#247) on the dev stub at 390x844, no database. Boots its own dev server. Set MATCH_SHOTS=<dir> for screenshots.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { chromium, webkit } from 'playwright';
import { localServerEnv } from '../scripts/qa/portal.mjs';
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
  server = spawn('npx', ['astro', 'dev', '--port', String(port), '--host', 'localhost'], { stdio: 'ignore', env: localServerEnv('http://127.0.0.1:54321', 'fixture-anon') });
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
const shot = (page, n, fullPage = false) => SHOTS && page.screenshot({ path: `${SHOTS}/${slug(dev.name)}-${n}.png`, fullPage });
const settle = (page) => page.waitForFunction(() => { const c = document.querySelector('[data-card]'); return c && !c.hidden && c.getAnimations().every((a) => a.playState === 'finished') && getComputedStyle(c).opacity === '1'; }, null, { timeout: 5000 });
const settle_ = (page) => page.waitForFunction(() => { const c = document.querySelector('[data-invite]'); return c && c.getAnimations().every((a) => a.playState === 'finished'); }, null, { timeout: 5000 });
const MIN_TAP = 44;
async function taps(page, where) {
  const sizes = await page.evaluate(() => [...document.querySelectorAll('.match button, .match a, .match .pill')].filter((e) => e.offsetParent !== null && !e.closest('[hidden]')).map((e) => { const r = e.getBoundingClientRect(); return { n: e.getAttribute('data-compose-open') !== null ? 'compose' : e.dataset.replay !== undefined ? 'replay' : e.textContent.trim().slice(0, 20) || e.className, w: r.width, h: r.height }; }));
  const small = sizes.filter((s) => s.w < MIN_TAP || s.h < MIN_TAP);
  console.log(`tap ${dev.name} ${where}: min ${(sizes.length ? Math.min(...sizes.map((s) => Math.min(s.w, s.h))) : 0).toFixed(1)} of ${sizes.length}`);
  assert.deepEqual(small, [], `${where}: tap targets under ${MIN_TAP}px`);
}
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
const geometry = (page) => page.evaluate(() => {
  const r = (e) => { const b = e.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, h: b.height }; };
  return { win: r(document.querySelector('[data-win]')), strip: r(document.querySelector('[data-strip]')), tiles: [...document.querySelectorAll('[data-strip] i')].map((e) => ({ ...r(e), t: e.textContent })) };
});
const beat = (page, b) => page.waitForFunction((x) => document.querySelector('[data-match]').dataset.beat === x, b, { timeout: 20000 });

for (const d of DEVICES) {
  const dev_ = d;
  test(`${d.name}: unmatched: calm card, no stage, no spin`, async () => { dev = d;
    const { ctx, page } = await open('unmatched');
    assert.equal(await page.locator('[data-card]').isVisible(), true);
    assert.equal(await page.locator('[data-stage]').isVisible(), false);
    assert.match(await page.locator('[data-card]').innerText(), /No one fits well enough yet/);
    await settle(page); await taps(page, 'unmatched'); await shot(page, 'unmatched', true); assert.ok(await noOverflow(page)); await ctx.close();
  });

  test(`${d.name}: first view: wheel keeps your side visible, rise, tap to card`, async () => { dev = d;
    const { ctx, page } = await open('first');
    await beat(page, 'wheel');
    assert.match(await page.locator('[data-left]').innerText(), /Maya/, 'your side shows while the wheel spins');
    await taps(page, 'wheel'); await shot(page, 'wheel'); assert.ok(await noOverflow(page));
    await beat(page, 'rise');
    assert.equal(await page.locator('[data-tags]').count(), 0, 'no You / Your peer tags');
    assert.equal(await page.locator('[data-line]').innerText(), 'Finding your peer in Texas. Searching 223 partner organizations across 21 countries, reaching 500,320 students');
    const who = await page.locator('[data-who]').innerText();
    assert.match(who, /Daniel/); assert.doesNotMatch(who, /Daniel[ \t]+[A-Z]/, 'first name only');
    await taps(page, 'rise'); await shot(page, 'rise');
    await page.locator('[data-right]').tap();
    await page.locator('[data-card]').waitFor({ state: 'visible' });
    const text = await page.locator('[data-card]').innerText();
    for (const t of ['You do', 'They do', 'Together', 'In common', 'Ask', "Let's write an email together"]) assert.ok(text.toLowerCase().includes(t.toLowerCase()), t);
    await settle(page); await taps(page, 'card'); await shot(page, 'card', true); assert.ok(await noOverflow(page));
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
    await settle(page); await taps(page, 'replay'); await shot(page, 'replay', true);
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
    await settle(page); await taps(page, 'reduced'); await shot(page, 'reduced', true); await ctx.close();
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
    for (const n of [1, 2, 3, 4]) { await page.waitForTimeout(500); await shot(page, `wheel-${n}`); { const f = await geometry(page); const filled = f.tiles.filter((t) => t.bottom > f.win.top && t.top < f.win.bottom); assert.ok(filled[0].top <= f.win.top + 0.75 && filled.at(-1).bottom >= f.win.bottom - 0.75, `wheel-${n}: window is filled edge to edge`); } assert.ok(await noOverflow(page)); const b = await pair(); assert.deepEqual([b.x, b.width, b.height], [box0.x, box0.width, box0.height], 'pair does not shift while spinning'); }
    await page.waitForFunction(() => document.querySelector('[data-match]').dataset.beat === 'wheel' && !document.querySelector('[data-strip]').getAnimations().length, null, { timeout: 20000 });
    await shot(page, 'stop');
    const g = await geometry(page), EPS = 0.75;
    const seen = g.tiles.filter((t) => t.bottom > g.win.top + EPS && t.top < g.win.bottom - EPS);
    console.log(`geometry ${dev.name} stop: win ${g.win.top.toFixed(1)}..${g.win.bottom.toFixed(1)} tiles ${seen.map((t) => `${t.t}@${t.top.toFixed(1)}`).join(' | ')}`);
    for (const t of seen) assert.ok(t.top >= g.win.top - EPS && t.bottom <= g.win.bottom + EPS, `stop: ${t.t} is partly outside the window`);
    const pitch = Math.max(...g.tiles.map((t) => t.h));
    assert.ok(seen.length >= 3, 'stop: window holds at least three whole tiles');
    assert.ok(seen[0].top - g.win.top <= EPS + 0.01 && g.win.bottom - seen.at(-1).bottom <= EPS + 0.01, 'stop: tiles reach both window edges');
    for (let i = 1; i < seen.length; i++) assert.ok(seen[i].top - seen[i - 1].bottom <= pitch, 'stop: gap between tiles over one pitch');
    const mid = (g.win.top + g.win.bottom) / 2, c = seen.find((t) => t.top <= mid && t.bottom >= mid);
    assert.ok(c && Math.abs((c.top + c.bottom) / 2 - mid) <= EPS, 'stop: a tile is centred in the window');
    await beat(page, 'rise');
    for (const n of [1, 2, 3]) { await shot(page, `rise-${n}`); await page.waitForTimeout(120); }
    await page.waitForTimeout(500); await shot(page, 'rise-end');
    assert.ok(await noOverflow(page));
    await ctx.close();
  });
  test(`${d.name}: opener frame`, async () => { dev = d;
    const { ctx, page } = await open('first');
    await page.waitForTimeout(400); await shot(page, 'opener-typing');
    const reserve = page.locator('[data-line] s'); assert.equal(await reserve.count(), 1, 'untyped remainder is rendered'); assert.equal(await reserve.getAttribute('aria-hidden'), 'true', 'reserve stays out of the live region');
    await beat(page, 'wheel'); await ctx.close();
  });

  test(`${d.name}: invited: who asked, Accept and Decline`, async () => { dev = d;
    const ctx = await browsers[dev.browser].newContext({ ...contextOptions(dev) });
    const page = await ctx.newPage();
    await page.goto(`${base}/portal/match?stub=invited`);
    await page.locator('[data-invite]').waitFor({ state: 'visible' });
    const text = await page.locator('[data-invite]').innerText();
    assert.match(text, /Daniel/); assert.match(text, /Ohio STEM Collective/); assert.match(text, /build nights/);
    assert.equal(await page.locator('[data-stage]').count(), 0, 'no stage for an ask');
    assert.doesNotMatch(text, /@|\d{3}[-. ]\d{3}/, 'no contact before accept');
    await settle_(page); await taps(page, 'invited'); await shot(page, 'invited', true); assert.ok(await noOverflow(page));
    await page.locator('[data-answer="accept"]').tap();
    await page.locator('[data-invite-result]').waitFor({ state: 'visible' });
    assert.match(await page.locator('[data-invite-result]').innerText(), /said yes/);
    assert.equal(await page.locator('[data-invite-actions]').isVisible(), false);
    await shot(page, 'invited-yes', true); assert.ok(await noOverflow(page)); await ctx.close();
  });
  test(`${d.name}: invited: Decline`, async () => { dev = d;
    const { ctx, page } = await (async () => { const c = await browsers[dev.browser].newContext({ ...contextOptions(dev) }); const p = await c.newPage(); await p.goto(`${base}/portal/match?stub=invited`); return { ctx: c, page: p }; })();
    await page.locator('[data-answer="decline"]').tap();
    assert.match(await page.locator('[data-invite-result]').innerText(), /Declined/); await ctx.close();
  });
}
