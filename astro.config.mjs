import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import vercel from '@astrojs/vercel';

export default defineConfig({
  site: 'https://joinvenn.org',
  trailingSlash: 'ignore',
  // Middleware runs in the render function. Edge middleware handed every page empty locals, so a signed-in
  // visitor was sent back to login. Without allowedDomains Astro reads every request as localhost on Vercel's
  // Node runtime, and same-origin form posts get a 403.
  adapter: vercel(),
  security: {
    allowedDomains: [
      { protocol: 'https', hostname: 'joinvenn.org' },
      { protocol: 'https', hostname: 'portal.joinvenn.org' },
      { protocol: 'https', hostname: '*.vercel.app' },
    ],
  },
  integrations: [sitemap({ filter: (page) => !page.includes('/apply') && !page.includes('/refer') && !page.includes('/unsubscribe') && !page.includes('/portal') })],
  devToolbar: { enabled: false },
  redirects: { '/seasons': '/#seasons' },
  server: { host: true, port: 8000 },
  vite: { server: { allowedHosts: true } },
});
