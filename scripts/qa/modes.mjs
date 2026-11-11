// Stress-mode registry, keyed by CLI flag name (e.g. --slow-3g). Modes combine; each run's report rows carry the mode names.
// Entry = { name, contextOptions: {...merged into the Playwright context} or (optionsSoFar) => {...}, beforePage: async (page) => {...} (before goto),
// afterLoad: async (page) => {...} (after load, before checks) }. A valued flag (--zoom 200) is { arg: true, build(value) -> entry }.

const browserName = (page) => page.context().browser()?.browserType().name();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Merge the active modes' contextOptions (plain objects, or functions of the options so far) onto a device's base options.
export const mergeContextOptions = (base, active) => active.reduce((o, m) => ({ ...o, ...(typeof m.contextOptions === 'function' ? m.contextOptions(o) : m.contextOptions) }), { ...base });

export const modes = {
  zoom: {
    arg: true,
    build(value) {
      const pct = Number(value);
      if (!(pct >= 50 && pct <= 500)) throw new Error(`--zoom takes a percent between 50 and 500, got "${value}"`);
      return {
        name: `zoom=${pct}`,
        // Real browser zoom: a viewport 1/z the size at z x the pixel density. CSS `zoom` on <html> is not the same: it scales
        // vh/dvh units too, so a 100dvh app shell (like /apply) grows past the screen and strands its own buttons.
        contextOptions: (base) => ({
          viewport: { width: Math.round(base.viewport.width / (pct / 100)), height: Math.round(base.viewport.height / (pct / 100)) },
          deviceScaleFactor: (base.deviceScaleFactor || 1) * (pct / 100),
        }),
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
