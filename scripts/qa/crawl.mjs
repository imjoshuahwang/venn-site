// Sitemap crawl: follows sitemap indexes, rewrites every host to the base URL so previews work.
const locs = (xml) => [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, '&'));

const toPath = (u, base) => {
  const url = new URL(u, base);
  return url.pathname + url.search;
};

async function fetchText(url, fetchFn) {
  try {
    const res = await fetchFn(url);
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

export async function crawlSitemap(base, fetchFn = fetch) {
  const root = new URL(base);
  const seen = new Set();
  const paths = new Set();
  async function walk(url, depth) {
    if (seen.has(url) || depth > 3) return false;
    seen.add(url);
    const xml = await fetchText(url, fetchFn);
    if (!xml) return false;
    const entries = locs(xml).map((l) => new URL(toPath(l, root), root).href);
    if (/<sitemapindex/i.test(xml)) {
      for (const e of entries) await walk(e, depth + 1);
    } else {
      for (const e of entries) paths.add(toPath(e, root));
    }
    return true;
  }
  for (const name of ['sitemap-index.xml', 'sitemap.xml']) {
    if (await walk(new URL('/' + name, root).href, 0) && paths.size) break;
  }
  return paths.size ? [...paths] : ['/'];
}

// --pages "/,/apply" (paths or full URLs) -> paths
export function parsePages(csv, base) {
  return csv.split(',').map((s) => s.trim()).filter(Boolean).map((s) => toPath(s, base));
}

// Pages missing from the sitemap (e.g. /apply) still run when --only is a path.
export function filterOnly(paths, only) {
  if (!only) return paths;
  const hit = paths.filter((p) => p.includes(only));
  return hit.length || !only.startsWith('/') ? hit : [only];
}

// Pages a flow runs on but the sitemap omits (/apply is noindexed) still get crawled, so their flow and checks run by default.
export function withFlowPages(paths, flows) {
  const bare = (p) => p.replace(/\/+$/, '') || '/';
  const have = new Set(paths.map(bare));
  const extra = [];
  for (const { on } of flows) if (!have.has(bare(on))) { have.add(bare(on)); extra.push(on.replace(/\/+$/, '') || '/'); }
  return [...paths, ...extra];
}
