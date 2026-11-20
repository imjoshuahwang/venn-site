import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import vercel from '@astrojs/vercel';

export default defineConfig({
  site: 'https://joinvenn.org',
  trailingSlash: 'ignore',
  adapter: vercel(),
  integrations: [sitemap({ filter: (page) => !page.includes('/apply') && !page.includes('/refer') && !page.includes('/unsubscribe') && !page.includes('/portal') })],
  security: { allowedDomains: [{ hostname: 'joinvenn.org', protocol: 'https' }, { hostname: 'www.joinvenn.org', protocol: 'https' }] },
  devToolbar: { enabled: false },
  redirects: { '/seasons': '/#seasons' },
  server: { host: true, port: 8000 },
  vite: { server: { allowedHosts: true } },
});
