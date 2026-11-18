import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import vercel from '@astrojs/vercel';

export default defineConfig({
  site: 'https://joinvenn.org',
  trailingSlash: 'ignore',
  adapter: vercel(),
  // Without this Astro ignores the Host header in production and sees every request as localhost,
  // so same-origin form posts get a 403 and auth redirect links point at localhost.
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
