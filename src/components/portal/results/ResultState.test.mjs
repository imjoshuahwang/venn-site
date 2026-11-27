import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { getViteConfig } from 'astro/config';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';

async function render(state) {
  const config = await getViteConfig({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' })({ command: 'serve', mode: 'test' });
  const server = await createServer({ ...config, configFile: false });
  try {
    const mod = await server.ssrLoadModule('/src/components/portal/results/ResultState.astro');
    const container = await AstroContainer.create();
    return await container.renderToString(mod.default, { props: { state } });
  } finally {
    await server.close();
  }
}

for (const [state, subject] of [['error', 'Result%20could%20not%20load'], ['empty', 'Result%20letter%20not%20ready']]) {
  test(`${state} state offers Try again, Sign out and a prefilled mailto`, async () => {
    const html = await render(state);
    assert.match(html, />\s*Try again\s*</);
    assert.match(html, /<form[^>]*method="post"[^>]*action="\/portal\/logout"/);
    assert.match(html, />\s*Sign out\s*</);
    assert.ok(html.includes(`mailto:contact@joinvenn.org?subject=${subject}`), html);
  });
}
