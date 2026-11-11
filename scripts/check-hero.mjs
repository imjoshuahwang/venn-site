// Hero + Statement polish check (#80). Usage: node scripts/check-hero.mjs [baseUrl]
// Needs playwright resolvable (PLAYWRIGHT=/path/to/node_modules/playwright).
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium, devices } = require(process.env.PLAYWRIGHT || 'playwright');
const base = process.argv[2] || 'http://127.0.0.1:8000/';
const out = new URL('../qa/', import.meta.url).pathname;
const cfgs = [
  ['iphone12', { ...devices['iPhone 12'] }],
  ['360', { viewport: { width: 360, height: 740 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
  ['375', { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
  ['390', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
  ['768', { viewport: { width: 768, height: 1024 } }],
  ['1440', { viewport: { width: 1440, height: 900 } }],
];
const browser = await chromium.launch();
for (const [name, cfg] of cfgs) {
  const ctx = await browser.newContext(cfg);
  const page = await ctx.newPage();
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForTimeout(4500); // headline write + pills pop
  const m = await page.evaluate(() => {
    const r = (e) => e.getBoundingClientRect();
    const h1 = r(document.querySelector('.hero h1'));
    // Visual bottom of headline+pills block: lowest of h1 and the pills (animations settled; bob shifts <=6px).
    const bottom = Math.max(h1.bottom, ...[...document.querySelectorAll('.hero .kind')].map((k) => r(k).bottom));
    const sub = r(document.querySelector('.hero .sub'));
    const cta = r(document.querySelector('.hero-cta'));
    const hl = document.querySelector('.hero .hl');
    const cs = getComputedStyle(hl);
    return { gapAbove: +(sub.top - bottom).toFixed(1), gapBelow: +(cta.top - sub.bottom).toFixed(1), hl: cs.backgroundColor, hlColor: cs.color,
      sw: document.documentElement.scrollWidth, iw: innerWidth };
  });
  await page.screenshot({ path: `${out}hero-${name}.png` });
  // Scroll the whole statement slowly so every chip lights; record lit chip colors.
  const chips = await page.evaluate(async () => {
    const seen = new Set();
    const total = document.documentElement.scrollHeight;
    for (let y = 0; y < total; y += 120) {
      scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 40));
      document.querySelectorAll('.kw.lit .ico').forEach((e) => seen.add(getComputedStyle(e).backgroundColor));
    }
    return [...seen];
  });
  void chips;
  // Park with all keywords lit and screenshot.
  await page.evaluate(() => document.getElementById('statement').scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(1200);
  const lit = await page.evaluate(() => [...new Set([...document.querySelectorAll('.kw.lit .ico')].map((e) => getComputedStyle(e).backgroundColor))]);
  await page.screenshot({ path: `${out}statement-${name}.png` });
  console.log(name, JSON.stringify({ ...m, lit }), m.sw <= m.iw ? 'noHscroll' : 'HSCROLL', Math.abs(m.gapAbove - m.gapBelow) <= 12 ? 'gapOK' : 'GAPFAIL');
  await ctx.close();
}
await browser.close();
