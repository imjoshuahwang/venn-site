import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import vercel from '@astrojs/vercel';

// Dev-only /demo (#318): the route exists only while `astro dev` runs, so no build can contain it.
const demoRoute = { name: 'demo-route', hooks: { 'astro:config:setup': ({ command, injectRoute }) => {
  if (command === 'dev') injectRoute({ pattern: '/demo', entrypoint: './src/demo/demo.astro' });
} } };

export default defineConfig({
  site: 'https://joinvenn.org',
  trailingSlash: 'ignore',
  adapter: vercel(),
  integrations: [demoRoute, sitemap({ filter: (page) => !page.includes('/apply') && !page.includes('/refer') && !page.includes('/unsubscribe') && !page.includes('/portal') })],
  security: { allowedDomains: [{ hostname: 'joinvenn.org', protocol: 'https' }, { hostname: 'www.joinvenn.org', protocol: 'https' }] },
  devToolbar: { enabled: false },
  redirects: { '/seasons': '/#seasons' },
  server: { host: true, port: 8000 },
  vite: { server: { allowedHosts: true } },
});
