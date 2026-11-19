// Judge pass 2 for #117: per-frame sampling; t0 = first frame the reveal element is visible.
// node qa/portal-117-judge2.mjs  -> writes qa/portal-shots/117/judge2.json
import { chromium, devices } from 'playwright';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const PORT = 8200, BASE = `http://127.0.0.1:${PORT}`;
const MODES = ['cohort', 'peer', 'network_waitlist', 'track_waitlist', 'not_this_season', 'none', 'error'];
const DEVS = ['iPhone SE', 'iPhone 15', 'Pixel 7'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = {};
async function start(mode) {
  const p = spawn('npx', ['astro', 'dev', '--host', '127.0.0.1', '--port', String(PORT)], { env: { ...process.env, PORTAL_STUB: mode }, stdio: 'ignore', detached: true });
  for (let i = 0; i < 60; i++) { try { const r = await fetch(`${BASE}/portal`); if (r.status < 500) { await sleep(800); return p; } } catch {} await sleep(500); }
  throw new Error('no server');
}
const stop = (p) => { try { process.kill(-p.pid); } catch {} return sleep(800); };

const SAMPLER = `
window.__fr = []; window.__confetti = 0; window.__cls = 0; window.__small = new Set();
new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1 && n.matches?.('[data-confetti]')) window.__confetti++; }).observe(document, { childList: true, subtree: true });
const op = (e) => e ? parseFloat(getComputedStyle(e).opacity) : 0;
let last = 0;
const scan = () => { for (const el of document.querySelectorAll('button, a[href], input, select, textarea, [role=button]')) {
  const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
  if (!r.width || cs.visibility === 'hidden' || cs.display === 'none' || el.closest('[hidden]') || op(el) < 0.5) continue;
  if (r.width < 43.5 || r.height < 43.5) window.__small.add(el.tagName.toLowerCase() + ':' + (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 24) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
} };
const tick = (now) => {
  const q = (s) => document.querySelector(s);
  const rev = q('[data-reveal]'), card = q('[data-card]'), glow = q('[data-glow]'), seal = q('[data-seal]'), body = q('[data-body]'), act = q('[data-actions]');
  const chars = [...document.querySelectorAll('[data-headline] .ch')];
  const hs = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > document.documentElement.clientWidth;
  const f = { t: now, hs, revVisible: !!rev && !rev.hidden };
  if (f.revVisible) {
    const cs = getComputedStyle(card);
    f.scale = cs.transform === 'none' ? 1 : parseFloat(cs.transform.slice(7));
    f.shadow = cs.boxShadow; f.cardOp = parseFloat(cs.opacity);
    f.glow = op(glow); const sc = getComputedStyle(seal); f.sealOp = sc.display === 'none' ? null : parseFloat(sc.opacity); f.clip = sc.display === 'none' ? null : sc.clipPath;
    f.chars = chars.filter((c) => op(c) > 0.02).length; f.nch = chars.length; f.body = op(body); f.act = op(act); f.conf = window.__confetti;
  }
  window.__fr.push(f);
  if (now - last > 200) { last = now; scan(); }
  requestAnimationFrame(tick);
};
requestAnimationFrame(tick);
`;

function analyse(fr, big) {
  const i0 = fr.findIndex((f) => f.revVisible);
  if (i0 < 0) return { error: 'reveal never visible' };
  const t0 = fr[i0].t; const R = fr.slice(i0).filter((f) => f.revVisible).map((f) => ({ ...f, r: Math.round(f.t - t0) }));
  const first = (fn) => { const f = R.find(fn); return f ? f.r : null; };
  const at = (ms) => R.find((f) => f.r >= ms);
  const o = {
    hscrollFrames: fr.filter((f) => f.hs).length, frames: fr.length,
    glowStart: first((f) => f.glow > 0.01), glowFull: first((f) => f.glow > 0.95),
    typeFirst: first((f) => f.nch && f.chars >= 1), typeLast: first((f) => f.nch && f.chars === f.nch),
    bodyStart: first((f) => f.body > 0.02), actStart: first((f) => f.act > 0.02), actFull: first((f) => f.act > 0.98),
    confettiFirst: first((f) => f.conf > 0), scaleMax: +Math.max(...R.map((f) => f.scale)).toFixed(3),
  };
  if (big) {
    const a = at(400), b = at(0);
    o.scaleAt0 = +b.scale.toFixed(3); o.scaleAt400 = +a.scale.toFixed(3); o.shadowAt0 = b.shadow; o.shadowAt400 = a.shadow;
    const sb = R.filter((f) => f.r >= 1500 && f.r <= 2300 && f.clip);
    o.sealClipDistinct = new Set(sb.map((f) => f.clip)).size; o.sealOpDistinct = new Set(sb.map((f) => f.sealOp)).size;
    const base = R.find((f) => f.clip)?.clip;
    o.sealClipFirstChange = first((f) => f.clip && f.clip !== base);
    o.sealOpFirstChange = first((f) => f.sealOp != null && f.sealOp < 0.99); o.sealGone = first((f) => f.sealOp != null && f.sealOp < 0.02);
    o.sealClipAt1700 = at(1700)?.clip; o.sealClipAt2000 = at(2000)?.clip;
  }
  return o;
}

const browser = await chromium.launch();
for (const mode of MODES) {
  const srv = await start(mode);
  try {
    for (const dev of DEVS) {
      const plain = ['none', 'error'].includes(mode);
      for (const reduced of (plain ? [false] : [false, true])) {
        const key = `${dev}|${mode}${reduced ? '|reduced' : ''}`; const st = (out[key] = { errors: [] });
        const ctx = await browser.newContext({ ...devices[dev], reducedMotion: reduced ? 'reduce' : 'no-preference' });
        await ctx.addInitScript(SAMPLER);
        const page = await ctx.newPage();
        page.on('console', (m) => { if (m.type() === 'error') st.errors.push(m.text().slice(0, 140)); });
        page.on('pageerror', (e) => st.errors.push('pageerror ' + e.message.slice(0, 140)));
        try {
          await page.goto(`${BASE}/portal?setup=0`, { waitUntil: 'load' }); await sleep(900);
          if (!plain) {
            await page.waitForSelector('section[data-screen="sealed"]:not([hidden])');
            await page.evaluate(() => { window.__fr = []; });
            await page.click('[data-reveal-btn]');
            await sleep(['cohort', 'peer'].includes(mode) ? 6000 : 2600);
          }
          const fr = await page.evaluate(() => window.__fr);
          if (!plain) Object.assign(st, analyse(fr, !reduced && ['cohort', 'peer'].includes(mode)), reduced ? { confettiNodes: await page.evaluate(() => window.__confetti) } : {});
          else st.hscrollFrames = fr.filter((f) => f.hs).length;
          st.small = await page.evaluate(() => [...window.__small]);
          st.cls = +(await page.evaluate(() => window.__cls)).toFixed(4);
          if (plain) st.links = await page.$$eval('a[href]', (as) => as.map((a) => { const r = a.getBoundingClientRect(); return a.getAttribute('href') + ' ' + Math.round(r.width) + 'x' + Math.round(r.height); }));
        } catch (e) { st.FATAL = String(e).slice(0, 200); }
        await ctx.close(); console.log(key, JSON.stringify({ hs: st.hscrollFrames, small: st.small?.length, g: st.glowStart, conf: st.confettiFirst, fatal: st.FATAL }));
      }
    }
  } finally { await stop(srv); }
}
await browser.close();
writeFileSync('qa/portal-shots/117/judge2.json', JSON.stringify(out, null, 1));
