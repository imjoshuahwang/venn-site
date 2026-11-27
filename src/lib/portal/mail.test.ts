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

test('sends from the student domain with the student key', async () => {
  let init: RequestInit | undefined;
  const fetch = (async (_u: string, i: RequestInit) => { init = i; return new Response('{}'); }) as unknown as typeof globalThis.fetch;
  const real = process.env.STUDENT_RESEND_API_KEY;
  process.env.STUDENT_RESEND_API_KEY = 're_student';
  try {
    assert.equal(await sendParentLink('contact+portal-x1@joinvenn.org', 'https://p/l', { fetch }), true);
  } finally { if (real === undefined) delete process.env.STUDENT_RESEND_API_KEY; else process.env.STUDENT_RESEND_API_KEY = real; }
  assert.equal((init!.headers as Record<string, string>).Authorization, 'Bearer re_student');
  const body = JSON.parse(String(init!.body));
  assert.equal(body.from, 'Venn <hello@vennstudentorgs.com>');
  assert.equal(body.reply_to, 'contact@joinvenn.org');
});

test('RESEND_API_KEY is ignored: no student key means a clear error and no fetch', async () => {
  const { urls, fetch } = calls();
  const saved = { s: process.env.STUDENT_RESEND_API_KEY, r: process.env.RESEND_API_KEY };
  delete process.env.STUDENT_RESEND_API_KEY;
  process.env.RESEND_API_KEY = 're_cold';
  try {
    await assert.rejects(sendParentLink('contact+portal-x1@joinvenn.org', 'https://p/l', { fetch }), /STUDENT_RESEND_API_KEY/);
  } finally {
    if (saved.s !== undefined) process.env.STUDENT_RESEND_API_KEY = saved.s;
    if (saved.r === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = saved.r;
  }
  assert.equal(urls.length, 0);
});
