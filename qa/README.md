# Mobile QA

`npm run qa:mobile [base-url] [-- flags]` (default base http://127.0.0.1:4321). Tests: `npm test`.
Crawls `<base>/sitemap-index.xml` (or sitemap.xml), runs 8 checks per page x device, exits 1 on any fail.
Flags: `--pages /,/apply` (skip crawl), `--only <substring>`, `--devices "iPhone SE,Pixel 7"`,
`--browsers webkit,chromium`, `--workers 4`, `--out qa/out`, plus any stress-mode flag from scripts/qa/modes.mjs.
Devices: iPhone SE, 15, 15 Pro Max, 15 landscape (webkit); Pixel 7, 7 landscape, Galaxy S9+ (chromium); iPad Mini (webkit).
Checks: overflow, offscreen, overlap, tap (<44px), text (<12px), console, cls (>0.1), img.
Output in `qa/out/` (gitignored): report.json, report.html (contact sheet), shots/*.jpg. Open report.html on a phone.
Seams: scripts/qa/modes.mjs (stress modes), flows.mjs (interaction flows), report.mjs (writers).
