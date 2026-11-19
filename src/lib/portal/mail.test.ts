import test from 'node:test';
import assert from 'node:assert/strict';
import { sendParentLink } from './mail.ts';

const calls = () => {
  const urls: string[] = [];
  const fetch = (async (u: string) => { urls.push(u); return new Response('{}'); }) as unknown as typeof globalThis.fetch;
  return { urls, fetch };
};

test('sends to plus-addressed test inboxes only', async () => {
  const { urls, fetch } = calls();
  assert.equal(await sendParentLink('contact+portal-x1@joinvenn.org', 'https://p/l', { fetch, apiToken: 't' }), true);
  assert.equal(urls.length, 1);
});

for (const to of ['mom@gmail.com', 'contact@joinvenn.org', 'contact+portal-x@joinvenn.org.evil.com', 'a@b.org,contact+portal-x@joinvenn.org']) {
  test(`logs and skips ${to}`, async () => {
    const { urls, fetch } = calls();
    const logs: string[] = [];
    assert.equal(await sendParentLink(to, 'https://p/l', { fetch, apiToken: 't', log: (m) => logs.push(m) }), false);
    assert.equal(urls.length, 0);
    assert.equal(logs.length, 1);
  });
}
