// Universal mobile checks. Each check is async (page, state) => { check, pass, details }.
// `state` comes from prepare(page), which must run before page.goto (console/pageerror/CLS collectors).

const TAP_MIN = 44;
const TEXT_MIN = 12;
const CLS_MAX = 0.1;
const LIST_CAP = 8;

export async function prepare(page) {
  const state = { console: [], pageErrors: [] };
  page.on('console', (m) => { if (m.type() === 'error') state.console.push(m.text()); });
  page.on('pageerror', (e) => state.pageErrors.push(String(e)));
  await page.addInitScript(() => {
    window.__cls = 0;
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
      }).observe({ type: 'layout-shift', buffered: true });
    } catch { window.__clsUnsupported = true; }
  });
  return state;
}

// Scroll top to bottom in steps so lazy content loads, wait for images, return to top.
export async function scrollFullPage(page) {
  await page.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const step = Math.max(200, Math.floor(innerHeight * 0.8));
    for (let y = 0, i = 0; i < 80; i++, y += step) {
      scrollTo(0, y);
      await wait(60);
      if (y + innerHeight >= document.documentElement.scrollHeight) break;
    }
    await Promise.race([
      Promise.all([...document.images].map((im) => im.complete ? 0 : new Promise((r) => { im.onload = im.onerror = r; }))),
      wait(4000),
    ]);
    scrollTo(0, 0);
  });
}

// In-page helpers, installed once per document as window.__qa.
function installHelpers() {
  if (window.__qa) return;
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'HEAD', 'TITLE', 'META', 'LINK', 'TEMPLATE']);
  const isVisible = (el) => {
    if (SKIP.has(el.tagName)) return false;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const describe = (el) => {
    let s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    if (typeof el.className === 'string' && el.className.trim()) s += '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.');
    const t = (el.textContent || el.getAttribute('alt') || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ');
    return t ? `${s} "${t.slice(0, 30)}"` : s;
  };
  const ownText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
  const textRects = (el) => {
    const out = [];
    for (const n of el.childNodes) {
      if (n.nodeType !== 3 || !n.textContent.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      for (const r of range.getClientRects()) if (r.width > 0 && r.height > 0) out.push(r);
    }
    return out;
  };
  // true when an overflow-clipping ancestor keeps el inside the viewport width
  const clipped = (el, vw) => {
    for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.overflowX !== 'visible' && p.getBoundingClientRect().right <= vw + 1) return true;
    }
    return false;
  };
  window.__qa = { isVisible, describe, ownText, textRects, clipped };
}

const result = (check, bad, details) => ({ check, pass: bad === 0, details: bad === 0 ? '' : details });
const list = (items) => items.slice(0, LIST_CAP).join('; ') + (items.length > LIST_CAP ? `; +${items.length - LIST_CAP} more` : '');

// Mobile emulation grows window.innerWidth to fit wide content, so the reference width is the emulated viewport.
const viewportWidth = (page) => page.viewportSize()?.width ?? 0;

export async function overflow(page) {
  await page.evaluate(installHelpers);
  const r = await page.evaluate((vw) => {
    const q = window.__qa;
    const width = Math.max(document.documentElement.scrollWidth, document.body ? document.body.scrollWidth : 0);
    if (width <= vw) return { width, vw };
    let worst = null;
    for (const el of document.body.querySelectorAll('*')) {
      if (!q.isVisible(el)) continue;
      const right = el.getBoundingClientRect().right;
      if (!worst || right > worst.right) worst = { right, el };
    }
    return { width, vw, worst: worst && `${q.describe(worst.el)} right=${Math.round(worst.right)}` };
  }, viewportWidth(page));
  return r.width > r.vw
    ? { check: 'overflow', pass: false, details: `scrollWidth ${r.width} > ${r.vw}; widest: ${r.worst || 'pseudo-element or unknown'}` }
    : { check: 'overflow', pass: true, details: '' };
}

// Elements fully beyond the right edge (left >= viewport width) and not clipped by an ancestor.
export async function offscreen(page) {
  await page.evaluate(installHelpers);
  const bad = await page.evaluate((vw) => {
    const q = window.__qa;
    const out = [];
    for (const el of document.body.querySelectorAll('*')) {
      if (!q.isVisible(el) || el.closest('[aria-hidden="true"]')) continue;
      const r = el.getBoundingClientRect();
      if (r.left >= vw && !q.clipped(el, vw)) out.push(`${q.describe(el)} left=${Math.round(r.left)}`);
    }
    return out;
  }, viewportWidth(page));
  return result('offscreen', bad.length, list(bad));
}

// Visible text line boxes of different elements that intersect by >= 25% of the smaller box.
export async function overlap(page) {
  await page.evaluate(installHelpers);
  const bad = await page.evaluate(() => {
    const q = window.__qa;
    const items = [];
    for (const el of document.body.querySelectorAll('*')) {
      if (!q.ownText(el) || !q.isVisible(el)) continue;
      for (const r of q.textRects(el)) items.push({ el, l: r.left, t: r.top, r: r.right, b: r.bottom });
    }
    items.sort((a, b) => a.l - b.l);
    const out = [];
    const seen = new Set();
    for (let i = 0; i < Math.min(items.length, 4000); i++) {
      for (let j = i + 1; j < items.length && items[j].l < items[i].r; j++) {
        const a = items[i], b = items[j];
        if (a.el === b.el) continue;
        const w = Math.min(a.r, b.r) - Math.max(a.l, b.l);
        const h = Math.min(a.b, b.b) - Math.max(a.t, b.t);
        if (w < 2 || h < 3) continue;
        const small = Math.min((a.r - a.l) * (a.b - a.t), (b.r - b.l) * (b.b - b.t));
        if (w * h < small * 0.25) continue;
        const key = q.describe(a.el) + ' x ' + q.describe(b.el);
        if (!seen.has(key)) { seen.add(key); out.push(key); }
      }
    }
    return out;
  });
  return result('overlap', bad.length, list(bad));
}

export async function tapTargets(page) {
  await page.evaluate(installHelpers);
  const bad = await page.evaluate((min) => {
    const q = window.__qa;
    const out = [];
    for (const el of document.querySelectorAll('a, button, input:not([type=hidden]), [role=button]')) {
      if (!q.isVisible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < min || r.height < min) out.push(`${q.describe(el)} ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    return out;
  }, TAP_MIN);
  return result('tap', bad.length, list(bad));
}

export async function smallText(page) {
  await page.evaluate(installHelpers);
  const bad = await page.evaluate((min) => {
    const q = window.__qa;
    const out = [];
    for (const el of document.body.querySelectorAll('*')) {
      if (!q.ownText(el) || !q.isVisible(el)) continue;
      const px = parseFloat(getComputedStyle(el).fontSize);
      if (px < min) out.push(`${q.describe(el)} ${px}px`);
    }
    return out;
  }, TEXT_MIN);
  return result('text', bad.length, list(bad));
}

export async function consoleErrors(page, state) {
  const all = [...state.console, ...state.pageErrors.map((e) => `pageerror: ${e}`)];
  return result('console', all.length, list(all.map((s) => s.slice(0, 120))));
}

export async function cls(page) {
  const r = await page.evaluate(() => ({ v: window.__cls || 0, unsupported: !!window.__clsUnsupported }));
  if (r.unsupported) return { check: 'cls', pass: true, details: 'layout-shift unsupported in this browser; skipped' };
  const v = Math.round(r.v * 1000) / 1000;
  return v > CLS_MAX ? { check: 'cls', pass: false, details: `CLS ${v} > ${CLS_MAX}` } : { check: 'cls', pass: true, details: `CLS ${v}` };
}

export async function brokenImages(page) {
  await page.evaluate(installHelpers);
  const bad = await page.evaluate(() => {
    const out = [];
    for (const im of document.images) {
      if (im.complete && im.naturalWidth === 0) out.push((im.currentSrc || im.src || '(no src)').slice(0, 80));
    }
    return out;
  });
  return result('img', bad.length, list(bad));
}

export const CHECKS = [overflow, offscreen, overlap, tapTargets, smallText, consoleErrors, cls, brokenImages];
export const CHECK_NAMES = ['overflow', 'offscreen', 'overlap', 'tap', 'text', 'console', 'cls', 'img'];

export async function runChecks(page, state) {
  const out = [];
  for (const fn of CHECKS) out.push(await fn(page, state));
  return out;
}
