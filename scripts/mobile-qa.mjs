// Mobile QA harness CLI. Usage: npm run qa:mobile [base-url] [-- --pages /,/apply --only x --devices "iPhone SE" --browsers webkit --workers 4 --header "Name: value"] (or env QA_EXTRA_HEADERS, one "Name: value" per line)
import path from 'node:path';
import { parseCli } from './qa/cli.mjs';
import { crawlSitemap, parsePages, filterOnly } from './qa/crawl.mjs';
import { resolveDevices } from './qa/devices.mjs';
import { runMatrix } from './qa/run.mjs';
import { loadMask } from './qa/baselines.mjs';
import { writeJson, writeHtml, summaryTable } from './qa/report.mjs';

const cli = parseCli(process.argv.slice(2));
const pages = filterOnly(cli.pages ? parsePages(cli.pages.join(','), cli.base) : await crawlSitemap(cli.base, (u) => fetch(u, { headers: cli.headers })), cli.only);
const devices = resolveDevices({ names: cli.devices, browsers: cli.browsers });
if (!pages.length || !devices.length) {
  console.error(`nothing to run: ${pages.length} pages, ${devices.length} devices`);
  process.exit(2);
}
const outDir = path.resolve(cli.out);
console.log(`qa:mobile ${cli.base}: ${pages.length} pages x ${devices.length} devices, ${cli.workers} workers`);
const results = await runMatrix({ base: cli.base, pages, devices, outDir, workers: cli.workers, activeModes: cli.activeModes, headers: cli.headers,
  visual: { dir: path.resolve('qa/baselines'), update: cli.updateBaselines, threshold: cli.diffThreshold, masks: loadMask('qa/mask.txt') } });
writeJson(outDir, results);
writeHtml(outDir, results, { base: cli.base });
console.log(summaryTable(results));
console.log(`\nreport: ${path.join(outDir, 'report.html')}`);
process.exit(results.some((r) => !r.pass) ? 1 : 0);
