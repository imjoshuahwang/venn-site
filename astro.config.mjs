import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import vercel from '@astrojs/vercel';

export default defineConfig({
  site: 'https://joinvenn.org',
  trailingSlash: 'ignore',
  adapter: vercel({ edgeMiddleware: true }),
  integrations: [sitemap({ filter: (page) => !page.includes('/apply') && !page.includes('/refer') && !page.includes('/unsubscribe') && !page.includes('/portal') })],
  devToolbar: { enabled: false },
  redirects: { '/seasons': '/#seasons' },
  server: { host: true, port: 8000 },
  vite: { server: { allowedHosts: true } },
});
