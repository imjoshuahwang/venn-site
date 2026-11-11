// Stress-mode registry, keyed by CLI flag name (e.g. --slow-3g). Modes combine; each run's report rows carry the mode names.
// Entry = { name, contextOptions: {...merged into the Playwright context}, beforePage: async (page) => {...} (before goto),
// afterLoad: async (page) => {...} (after load, before checks) }. A valued flag (--zoom 200) is { arg: true, build(value) -> entry }.

const browserName = (page) => page.context().browser()?.browserType().name();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const modes = {
  zoom: {
    arg: true,
    build(value) {
      const pct = Number(value);
      if (!(pct >= 50 && pct <= 500)) throw new Error(`--zoom takes a percent between 50 and 500, got "${value}"`);
      return {
        name: `zoom=${pct}`,
        // CSS zoom on <html> scales text and boxes like browser zoom or large text, in Chromium and WebKit alike.
        beforePage: (page) => page.addInitScript((z) => {
          const apply = () => { if (document.documentElement) document.documentElement.style.zoom = String(z); };
          apply();
          document.addEventListener('DOMContentLoaded', apply);
        }, pct / 100),
      };
    },
  },
  dark: { name: 'dark', contextOptions: { colorScheme: 'dark' } },
  'reduced-motion': { name: 'reduced-motion', contextOptions: { reducedMotion: 'reduce' } },
  'slow-3g': {
    name: 'slow-3g',
    async beforePage(page) {
      if (browserName(page) === 'chromium') {
        const cdp = await page.context().newCDPSession(page);
        await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 400, downloadThroughput: 50 * 1024, uploadThroughput: 25 * 1024 });
      } else {
        // WebKit has no throttle API: delay every request instead.
        await page.route('**/*', async (route) => { await sleep(400); await route.continue().catch(() => {}); });
      }
    },
  },
  'long-text': {
    name: 'long-text',
    // Triple every text node's copy: the German/Spanish/overly-wordy-CMS case.
    afterLoad: (page) => page.evaluate(() => {
      const skip = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'TEMPLATE']);
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const nodes = [];
      for (let n = walker.nextNode(); n; n = walker.nextNode()) if (n.textContent.trim() && !skip.has(n.parentElement?.tagName)) nodes.push(n);
      for (const n of nodes) { const t = n.textContent.trim(); n.textContent = `${t} ${t} ${t}`; }
    }),
  },
};
