// Matrix runner: page x device jobs over a worker pool. mobile-qa.mjs is a thin CLI over this.
import fs from 'node:fs';
import path from 'node:path';
import { chromium, webkit } from 'playwright';
import { contextOptions, slug } from './devices.mjs';
import { mergeContextOptions } from './modes.mjs';
import { prepare, scrollFullPage, runChecks } from './checks.mjs';
import { runFlows } from './flows.mjs';
import { visualCheck } from './baselines.mjs';

const LAUNCH = { chromium, webkit };

// opts: { base, pages, devices, outDir, workers, activeModes: [{contextOptions, beforePage}], settleMs, shots, headers, visual: {dir, update, threshold, masks} }
// headers ({ name: value }) go only to requests for the base origin, so a bypass secret never reaches third parties.
export async function runMatrix(opts) {
  const { base, pages, devices, outDir, workers = 4, activeModes = [], settleMs = 600, shots = true, headers = {}, visual } = opts;
  const origin = new URL(base).origin;
  const shotDir = path.join(outDir, 'shots');
  if (shots) fs.mkdirSync(shotDir, { recursive: true });
  const browsers = {};
  for (const name of new Set(devices.map((d) => d.browser))) browsers[name] = await LAUNCH[name].launch();
  const jobs = pages.flatMap((p) => devices.map((d) => ({ p, d })));
  const results = [];
  let next = 0;

  async function runJob({ p, d }) {
    const meta = { page: p, device: d.name, browser: d.browser, modes: activeModes.map((m) => m.name).filter(Boolean) };
    const ctxOpts = mergeContextOptions(contextOptions(d), activeModes);
    const ctx = await browsers[d.browser].newContext(ctxOpts);
    if (Object.keys(headers).length) await ctx.route((u) => u.origin === origin, (r) => r.continue({ headers: { ...r.request().headers(), ...headers } }));
    const rows = [];
    try {
      const page = await ctx.newPage();
      const state = await prepare(page);
      for (const m of activeModes) await m.beforePage?.(page);
      const res = await page.goto(new URL(p, base).href, { waitUntil: 'load', timeout: 45000 });
      if (res && res.status() >= 400) rows.push({ check: 'load', pass: false, details: `HTTP ${res.status()}` });
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
      for (const m of activeModes) await m.afterLoad?.(page);
      await scrollFullPage(page);
      await page.waitForTimeout(settleMs);
      rows.push(...await runChecks(page, state));
      rows.push(...await runFlows(page, d, { outDir, shots, modes: activeModes }));
      if (visual) rows.push(await visualCheck(page, visual, { name: `${slug(p === '/' ? 'home' : p)}-${slug(d.name)}`, outDir }));
      if (shots) {
        const file = `shots/${slug(p === '/' ? 'home' : p)}-${slug(d.name)}.jpg`;
        await page.screenshot({ path: path.join(outDir, file), fullPage: true, type: 'jpeg', quality: 60 }).catch(() => {});
        meta.shot = file;
      }
    } catch (e) {
      rows.push({ check: 'load', pass: false, details: String(e.message || e).split('\n')[0] });
    } finally {
      await ctx.close();
    }
    for (const r of rows) results.push({ ...meta, ...r });
  }

  async function worker() {
    while (next < jobs.length) await runJob(jobs[next++]);
  }
  try {
    await Promise.all(Array.from({ length: Math.min(workers, jobs.length) }, worker));
  } finally {
    await Promise.all(Object.values(browsers).map((b) => b.close()));
  }
  const order = (r) => pages.indexOf(r.page) * 1000 + devices.findIndex((d) => d.name === r.device);
  return results.sort((a, b) => order(a) - order(b));
}
