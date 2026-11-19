// Judge script for #117: node qa/portal-117.spec.mjs [modes,comma] [devices,comma]
// Spawns astro dev per PORTAL_STUB mode (one at a time) and walks the ceremony with Playwright.
import { chromium, devices } from 'playwright';
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';

const OUT = 'qa/portal-shots/117';
mkdirSync(OUT, { recursive: true });
const MODES = (process.argv[2] || 'cohort,peer,network_waitlist,track_waitlist,not_this_season,none,error').split(',');
const DEVS = (process.argv[3] || 'iPhone SE,iPhone 15,Pixel 7').split(',');
const PORT = 8100;
const BASE = `http://127.0.0.1:${PORT}`;
const results = {};
const slug = (d) => d.toLowerCase().replace(/\s+/g, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function startServer(mode) {
  const p = spawn('npx', ['astro', 'dev', '--host', '127.0.0.1', '--port', String(PORT)], { env: { ...process.env, PORTAL_STUB: mode }, stdio: 'ignore', detached: true });
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`${BASE}/portal`); if (r.status < 500) { await sleep(500); return p; } } catch {}
    await sleep(500);
  }
  throw new Error('server did not start for ' + mode);
}
const stopServer = (p) => { try { process.kill(-p.pid); } catch {} return sleep(800); };

const INIT = `
  window.__cls = 0; window.__shifts = [];
  new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) { window.__cls += e.value; window.__shifts.push({ v: e.value, t: Math.round(e.startTime) }); } }).observe({ type: 'layout-shift', buffered: true });
  window.__confetti = 0;
  new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1 && (n.matches?.('[data-confetti], .confetti'))) window.__confetti++; }).observe(document, { childList: true, subtree: true });
`;

// rAF probe: first time (ms since reveal click) each visual event is observed.
const PROBE = `
  window.__probe = (() => {
    const t0 = performance.now(); const ev = {}; const mark = (k) => { if (!(k in ev)) ev[k] = Math.round(performance.now() - t0); };
    const q = (s) => document.querySelector(s);
    const op = (e) => e ? parseFloat(getComputedStyle(e).opacity) : 0;
    const tick = () => {
      const card = q('[data-card]'), glow = q('[data-glow]'), chars = [...document.querySelectorAll('[data-headline] .ch')], body = q('[data-body]'), act = q('[data-actions]');
      if (card && !card.closest('[hidden]')) mark('letterVisible');
      if (card) { const tr = getComputedStyle(card).transform; if (tr && tr !== 'none') { mark('cardTransformed'); if (parseFloat(tr.slice(7)) > 1.001) mark('cardScaleUp'); } }
      if (op(glow) > 0.05) mark('glowStart'); if (op(glow) > 0.95) mark('glowFull');
      if (chars.length) { const vis = chars.filter((c) => op(c) > 0.5).length; if (vis >= 1) mark('typeFirst'); if (vis === chars.length) mark('typeLast'); }
      if (op(body) > 0.05) mark('bodyStart'); if (op(body) > 0.95) mark('bodyFull');
      if (op(act) > 0.05) mark('actionsStart'); if (op(act) > 0.95) mark('actionsFull');
      if (window.__confetti > 0) mark('confettiFirst');
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return { ev };
  })();
`;

async function metrics(page, label, store) {
  const m = await page.evaluate(() => {
    const vw = innerWidth;
    const hs = document.documentElement.scrollWidth > vw + 1 || document.body.scrollWidth > vw + 1;
    const small = [];
    for (const el of document.querySelectorAll('button, a[href], input, select, textarea, [role=button]')) {
      const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
      if (!r.width || cs.visibility === 'hidden' || cs.display === 'none' || el.closest('[hidden]') || parseFloat(cs.opacity) === 0) continue;
      if (r.width < 44 || r.height < 44) small.push(`${el.tagName.toLowerCase()}:${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 24)} ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    return { hs, small, sw: document.documentElement.scrollWidth, vw };
  });
  store.hscroll ??= []; store.tap ??= [];
  if (m.hs) store.hscroll.push(`${label} sw=${m.sw} vw=${m.vw}`);
  if (m.small.length) store.tap.push(`${label}: ${m.small.join('; ')}`);
}

async function shot(page, dev, name, step, store) {
  await page.screenshot({ path: `${OUT}/${slug(dev)}-${name}-${step}.png` });
  await metrics(page, step, store);
}

async function walk(browser, dev, mode, { setup = true, full = true, reduced = false, tag = '' }) {
  const store = (results[`${dev}|${mode}${tag}`] = { errors: [] });
  const ctx = await browser.newContext({ ...devices[dev], reducedMotion: reduced ? 'reduce' : 'no-preference' });
  await ctx.addInitScript(INIT);
  const page = await ctx.newPage();
  let viewedCalls = 0;
  page.on('console', (m) => { if (m.type() === 'error') store.errors.push(m.text().slice(0, 160)); });
  page.on('pageerror', (e) => store.errors.push('pageerror ' + e.message.slice(0, 160)));
  page.on('request', (r) => { if (r.url().includes('/portal/api/ceremony') && (r.postData() || '').includes('viewed')) viewedCalls++; });
  const name = mode + tag;
  await page.goto(`${BASE}/portal${setup ? '' : '?setup=0'}`, { waitUntil: 'load' });
  await page.waitForSelector('[data-ceremony][data-ready]');
  if (setup) for (const s of ['consent', 'parent']) {
    await page.waitForSelector(`section[data-screen="setup:${s}"]:not([hidden])`);
    if (full) await shot(page, dev, name, `1-setup-${s}`, store);
    await page.click(`section[data-screen="setup:${s}"] [data-next]`);
  }
  await page.waitForSelector('section[data-screen="sealed"]:not([hidden])');
  await shot(page, dev, name, '2-sealed', store);
  const big = ['cohort', 'peer'].includes(mode);
  await page.evaluate(PROBE);
  const click0 = Date.now();
  await page.dblclick('[data-reveal-btn]'); // double tap: idempotence
  const marks = reduced ? [[100, '3-crossfade-100ms']]
    : !full ? [] : big ? [[200, '3-lift'], [1000, '4-bloom'], [1900, '5-seal-break'], [3300, '6-typing'], [4700, '7-confetti']] : [[500, '3-warm'], [1100, '4-fade']];
  for (const [t, n] of marks) { const w = t - (Date.now() - click0); if (w > 0) await sleep(w); await shot(page, dev, name, n, store); }
  const total = reduced ? 500 : big ? 5600 : 1900;
  const w = total - (Date.now() - click0); if (w > 0) await sleep(w);
  store.probe = await page.evaluate(() => window.__probe.ev);
  store.confetti = await page.evaluate(() => window.__confetti);
  store.viewedCalls = viewedCalls;
  store.letterOpacity = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('[data-card]')).opacity));
  await shot(page, dev, name, '8-letter', store);
  store.letterText = (await page.innerText('[data-body]')).slice(0, 40);
  if (!reduced && full) {
    await page.evaluate(() => { try { Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }); } catch {} });
    await page.click('[data-share]'); await sleep(300);
    store.shareNote = await page.innerText('[data-note]');
    await shot(page, dev, name, '9-share', store);
  }
  await page.click('[data-actions] [data-next]');
  if (setup) {
    await page.waitForSelector('section[data-screen="setup:phone"]:not([hidden])');
    if (full) await shot(page, dev, name, '10-setup-phone', store);
    await page.click('section[data-screen="setup:phone"] [data-next]');
  }
  await page.waitForURL(/\/portal$/, { timeout: 5000 }).catch(() => {});
  await page.waitForLoadState('load'); await sleep(400);
  store.homeText = (await page.innerText('body')).slice(0, 80).replace(/\s+/g, ' ');
  if (full) await shot(page, dev, name, '11-home', store);
  store.cls = +(await page.evaluate(() => window.__cls)).toFixed(4);
  await ctx.close();
}

async function plainShot(browser, dev, mode) {
  const store = (results[`${dev}|${mode}`] = { errors: [] });
  const ctx = await browser.newContext({ ...devices[dev] });
  await ctx.addInitScript(INIT);
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') store.errors.push(m.text().slice(0, 160)); });
  page.on('pageerror', (e) => store.errors.push('pageerror ' + e.message.slice(0, 160)));
  await page.goto(`${BASE}/portal`, { waitUntil: 'load' }); await sleep(500);
  await shot(page, dev, mode, '1-load', store);
  store.text = (await page.innerText('body')).replace(/\s+/g, ' ').slice(0, 200);
  store.links = await page.$$eval('a', (as) => as.map((a) => a.getAttribute('href')));
  store.btns = await page.$$eval('button', (bs) => bs.map((b) => b.textContent.trim()));
  store.cls = +(await page.evaluate(() => window.__cls)).toFixed(4);
  await ctx.close();
}

async function extras(browser, dev) {
  const st = (results[`${dev}|cohort-extras`] = { errors: [] });
  let ctx = await browser.newContext({ ...devices[dev], javaScriptEnabled: false });
  let page = await ctx.newPage();
  await page.goto(`${BASE}/portal`, { waitUntil: 'load' });
  await shot(page, dev, 'cohort', 'loading-skeleton', st);
  await ctx.close();
  ctx = await browser.newContext({ ...devices[dev] });
  page = await ctx.newPage();
  await page.route('**/portal/api/ceremony', (r) => r.fulfill({ status: 500, body: '{}' }));
  await page.goto(`${BASE}/portal?setup=0`); await page.waitForSelector('[data-ready]');
  await page.click('[data-reveal-btn]'); await sleep(5700);
  st.letterAfterViewedFail = await page.isVisible('[data-card]');
  await page.click('[data-actions] [data-next]'); await sleep(800);
  st.errorShown = await page.isVisible('section[data-screen="error"]');
  if (st.errorShown) {
    st.errorText = (await page.innerText('section[data-screen="error"]')).replace(/\s+/g, ' ');
    await shot(page, dev, 'cohort', 'finish-error', st);
    await page.unroute('**/portal/api/ceremony');
    await page.click('[data-retry]'); await sleep(1500);
    st.afterRetryUrl = page.url(); st.afterRetryText = (await page.innerText('body')).slice(0, 60).replace(/\s+/g, ' ');
  }
  await ctx.close();
}

const browser = await chromium.launch();
for (const mode of MODES) {
  const srv = await startServer(mode);
  try {
    for (const dev of DEVS) {
      console.log(mode, dev);
      try {
        if (['none', 'error'].includes(mode)) { await plainShot(browser, dev, mode); continue; }
        const walkSetup = ['cohort', 'peer', 'not_this_season'].includes(mode);
        await walk(browser, dev, mode, { setup: walkSetup, full: true });
        if (walkSetup) await walk(browser, dev, mode, { setup: false, full: false, reduced: true, tag: '-reduced' });
        if (mode === 'cohort') await extras(browser, dev);
      } catch (e) { results[`${dev}|${mode}|FATAL`] = String(e).slice(0, 300); console.log('FATAL', e.message.slice(0, 200)); }
    }
  } finally { await stopServer(srv); }
}
await browser.close();
writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 1));
console.log('done');
