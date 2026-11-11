// Report writers: report.json, report.html (contact sheet), and the console summary table.
import fs from 'node:fs';
import path from 'node:path';
import { CHECK_NAMES } from './checks.mjs';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// results: [{ page, device, browser, check, pass, details, shot? }]
export function writeJson(outDir, results) {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(results, null, 1));
}

// Group rows into one entry per page x device (a "cell").
export function cells(results) {
  const map = new Map();
  for (const r of results) {
    const key = `${r.page}|${r.device}`;
    if (!map.has(key)) map.set(key, { page: r.page, device: r.device, browser: r.browser, shot: r.shot, rows: [] });
    const c = map.get(key);
    c.shot ||= r.shot;
    c.rows.push(r);
  }
  return [...map.values()];
}

export function writeHtml(outDir, results, meta = {}) {
  fs.mkdirSync(outDir, { recursive: true });
  const all = cells(results);
  const failTotal = results.filter((r) => !r.pass).length;
  const pages = [...new Set(all.map((c) => c.page))];
  const sections = pages.map((p) => {
    const cards = all.filter((c) => c.page === p).map((c) => {
      const bad = c.rows.filter((r) => !r.pass);
      const list = bad.map((r) => `<li><b>${esc(r.check)}</b> ${esc(r.details)}</li>`).join('');
      return `<figure class="card${bad.length ? ' fail' : ''}"><figcaption>${esc(c.device)} <small>${esc(c.browser)}</small>
<span>${bad.length ? bad.length + ' fail' : 'pass'}</span></figcaption>
${c.shot ? `<a href="${esc(c.shot)}"><img loading="lazy" src="${esc(c.shot)}" alt="${esc(p)} on ${esc(c.device)}"></a>` : ''}
${list ? `<ul>${list}</ul>` : ''}</figure>`;
    }).join('');
    return `<section><h2>${esc(p)}</h2><div class="grid">${cards}</div></section>`;
  }).join('');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Mobile QA</title>
<style>
*{box-sizing:border-box}body{margin:0;padding:16px;font:14px/1.4 system-ui,sans-serif;background:#fff;color:#111;overflow-x:hidden}
h1{font-size:20px;margin:0 0 4px}h2{font-size:16px;margin:24px 0 8px;overflow-wrap:anywhere}.meta{color:#555;margin:0 0 8px;overflow-wrap:anywhere}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
.card{margin:0;border:1px solid #ccc;border-radius:8px;padding:8px;min-width:0}.card.fail{border:2px solid #c00;background:#fff5f5}
figcaption{display:flex;flex-wrap:wrap;gap:4px;justify-content:space-between;font-weight:600;margin-bottom:6px}
figcaption small{font-weight:400;color:#666}figcaption span{color:#070}.fail figcaption span{color:#c00}
img{display:block;width:100%;max-height:320px;object-fit:cover;object-position:top;border-radius:4px;background:#eee}
ul{margin:6px 0 0;padding-left:16px;color:#c00;font-size:12px;overflow-wrap:anywhere}
</style></head><body><h1>Mobile QA: ${failTotal ? failTotal + ' failing checks' : 'all pass'}</h1>
<p class="meta">${esc(meta.base || '')} &middot; ${all.length} page x device runs &middot; ${esc(meta.when || new Date().toISOString())}</p>${sections}</body></html>`;
  fs.writeFileSync(path.join(outDir, 'report.html'), html);
}

const pad = (s, n) => String(s).slice(0, n).padEnd(n);

// Pass/fail table per page x device, plus fail count per check.
export function summaryTable(results) {
  const names = [...CHECK_NAMES, ...new Set(results.map((r) => r.check).filter((c) => !CHECK_NAMES.includes(c)))];
  const head = pad('page', 32) + pad('device', 20) + names.map((n) => pad(n, 9)).join('');
  const lines = [head];
  for (const c of cells(results)) {
    const by = Object.fromEntries(c.rows.map((r) => [r.check, r]));
    lines.push(pad(c.page, 32) + pad(c.device, 20) + names.map((n) => pad(!by[n] ? '-' : by[n].pass ? 'ok' : 'FAIL', 9)).join(''));
  }
  const totals = names.map((n) => `${n}=${results.filter((r) => r.check === n && !r.pass).length}`).join(' ');
  lines.push('', `fails per check: ${totals}`);
  return lines.join('\n');
}
