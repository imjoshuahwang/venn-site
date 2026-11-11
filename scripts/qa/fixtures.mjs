// Fixture pages for tests, served on 127.0.0.1 port 0. One clean page; one page per check that fails exactly that check.
import http from 'node:http';

const doc = (body, { css = '', head = '' } = {}) => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>fixture</title>${head}
<style>body{margin:0;font:16px/1.4 sans-serif;padding:16px}p{margin:0 0 12px}
.btn{display:inline-block;min-width:48px;min-height:48px;box-sizing:border-box}${css}</style></head><body>${body}</body></html>`;

const GOOD_IMG = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="green"/></svg>';
const clean = `<h1>Clean page</h1><p>Plain readable text.</p><img src='${GOOD_IMG}' width="40" height="40" alt="ok"><a class="btn" href="/x">Go</a>`;

export const PAGES = {
  '/clean': doc(clean),
  '/overflow': doc(`${clean}<div style="width:600px;height:20px;background:#ccc"></div>`),
  '/offscreen': doc(`${clean}<div style="position:fixed;left:100vw;top:0;width:100px;height:40px;background:#ccc">Hidden drawer</div>`),
  '/overlap': doc(`${clean}<div style="position:relative;height:60px"><p style="position:absolute;top:0;left:0;margin:0">Overlapping words here</p><p style="position:absolute;top:4px;left:10px;margin:0">Second layer text</p></div>`),
  '/tap': doc(`${clean}<a href="/y" style="display:inline-block;width:20px;height:20px;background:#ccc" aria-label="tiny"></a>`),
  // Pass-all fixtures: legitimate things the checks used to flag.
  '/tap-exempt': doc(`${clean}<input class="hp" name="hp_field" tabindex="-1" aria-hidden="true" style="position:absolute;left:-9999px;width:60px;height:8px">
<input aria-hidden="true" tabindex="-1" style="width:60px;height:8px">
<p>Read the <a href="/a">first guide</a> and then the <a href="/b">second one</a> before you apply.</p>
<ul><li>Items can carry <a href="/c">a link</a> in the middle of a sentence.</li></ul>`),
  '/tap-list': doc(`${clean}<ul style="list-style:none;padding:0"><li><a href="/p">Pricing</a></li><li><a href="/q">Contact</a></li></ul>`),
  '/details-closed': doc(`${clean}<div class="faq"><details><summary>Question one?</summary><p>Answer one is long enough to wrap on a phone screen.</p></details><details><summary>Question two?</summary><p>Answer two is also long enough to wrap on a phone screen.</p></details><details><summary>Question three?</summary><p>Answer three, hidden until the summary is opened.</p></details></div>`),
  '/smooth-fixed': doc(`<div style="position:fixed;top:0;left:0;right:0;height:60px;background:#fff;z-index:2">Fixed header text</div>
<div style="height:70px"></div>${Array.from({ length: 80 }, (_, i) => `<p>Paragraph ${i} of a very tall page with smooth scrolling.</p>`).join('')}`, { css: 'html{scroll-behavior:smooth}' }),
  '/text': doc(`${clean}<p style="font-size:9px">Tiny legal print</p>`),
  '/console': doc(clean, { head: '<script>console.error("boom fixture")</script>' }),
  '/cls': doc(`<div id="top"></div><div style="height:700px;background:#ddd">Content</div>
<script>setTimeout(()=>{const d=document.createElement('div');d.style.cssText='height:300px;background:#faa';document.getElementById('top').appendChild(d)},900)</script>`),
  '/img': doc(`${clean}<img src="data:image/png;base64,AAAA" width="40" height="40" alt="broken">`),
  '/sitemap-index.xml': { type: 'application/xml', body: (o) => `<sitemapindex><sitemap><loc>https://example.org/sitemap-0.xml</loc></sitemap></sitemapindex>` },
  '/sitemap-0.xml': { type: 'application/xml', body: () => `<urlset><url><loc>https://example.org/</loc></url><url><loc>https://example.org/clean</loc></url><url><loc>https://example.org/tap</loc></url></urlset>` },
};

export async function serveFixtures() {
  const seen = []; // { path, headers } per request, for header assertions
  const server = http.createServer((req, res) => {
    seen.push({ path: new URL(req.url, 'http://x').pathname, headers: req.headers });
    const hit = PAGES[new URL(req.url, 'http://x').pathname];
    if (!hit) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('nope'); }
    const typed = typeof hit === 'object';
    res.writeHead(200, { 'content-type': typed ? hit.type : 'text/html; charset=utf-8' });
    res.end(typed ? hit.body() : hit);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { seen, base: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(r); }) };
}
