# Mobile QA

`npm run qa:mobile [base-url] [-- flags]` (default base http://127.0.0.1:4321). Tests: `npm test`.
Crawls `<base>/sitemap-index.xml` (or sitemap.xml), runs 8 checks per page x device, exits 1 on any fail.
Flags: `--pages /,/apply` (skip crawl), `--only <substring>`, `--devices "iPhone SE,Pixel 7"`,
`--browsers webkit,chromium`, `--workers 4`, `--out qa/out`, plus stress modes (combine freely, rows carry the mode list):
`--zoom 200`, `--dark`, `--reduced-motion`, `--slow-3g` (CDP on Chromium, request delay on WebKit), `--long-text` (triples all copy).
Devices: iPhone SE, 15, 15 Pro Max, 15 landscape (webkit); Pixel 7, 7 landscape, Galaxy S9+ (chromium); iPad Mini (webkit).
Checks: overflow, offscreen, overlap, tap (<44px), text (<12px), console, cls (>0.1), img.
Output in `qa/out/` (gitignored): report.json, report.html (contact sheet), shots/*.jpg. Open report.html on a phone.
Visual diff: a viewport screenshot (CSS-pixel PNG) per page x device is compared with `qa/baselines/` (pixelmatch; fails above `--diff-threshold` percent, default 0.2) as a `visual-diff` row. Missing baseline = info, not fail. `--update-baselines` rewrites them (commit the result). Changed tiles (baseline | new | diff) lead report.html; diffs land in `qa/out/diffs/`. Volatile regions: one CSS selector per line in `qa/mask.txt`.
Seams: scripts/qa/modes.mjs (stress modes), flows.mjs (interaction flows), report.mjs (writers).
Flows: qa/flows.yaml, one line per step (`goto`, `tap <selector|text=>`, `fill "<sel>" <value>`, `expect-visible`, `scroll-to`, `wait <ms>`, `screenshot <name>`). A flow runs on every device on its `on:` page, never submits, blocks *.supabase.co; a failed step is a `flow:<name>` fail row with a screenshot.
