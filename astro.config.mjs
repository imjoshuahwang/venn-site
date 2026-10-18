import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://joinvenn.org',
  trailingSlash: 'ignore',
  integrations: [sitemap({ filter: (page) => !page.includes('/boost') })],
  devToolbar: { enabled: false },
  redirects: { '/seasons': '/#seasons' },
  server: { host: true, port: 8000 },
  vite: { server: { allowedHosts: true } },
});
