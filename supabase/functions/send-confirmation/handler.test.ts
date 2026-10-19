import { test } from "node:test";
import assert from "node:assert/strict";
import { handle } from "./handler.ts";

const ENV: Record<string, string> = {
  SUPABASE_URL: "https://supabase.example.com",
  SUPABASE_SERVICE_ROLE_KEY: "svc",
  WEBHOOK_SECRET: "s3cret",
  RESEND_API_KEY: "re_fake",
  SEND_MODE: "all",
};
const env = (k: string) => ENV[k];
const row = {
  id: 7, role: "student", name: "ada lovelace", email: "ada@example.com", email_key: null,
  ref_code: "abc123", is_test: false, confirmed_at: null, email_status: null, share_due: "2026-10-20T22:40:00+00:00",
};
const req = (secret = "s3cret") =>
  new Request("https://fn.example.com/", {
    method: "POST", headers: { "x-webhook-secret": secret }, body: JSON.stringify({ record: { id: 7 } }),
  });

type Call = { url: string; init?: RequestInit };

// Every fetch is stubbed: Resend and Supabase get canned answers, anything else throws.
async function withFetch<T>(fn: (calls: Call[]) => Promise<T>): Promise<T> {
  const real = globalThis.fetch;
  const calls: Call[] = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    calls.push({ url: u, init });
    const j = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
    if (u.startsWith("https://api.resend.com/")) return j({ id: "re_1" });
    if (u.startsWith("https://supabase.example.com/")) return j(init?.method === "PATCH" ? [{ id: 7 }] : [row]);
    throw new Error(`unexpected network call ${u}`);
  }) as typeof fetch;
  try {
    return await fn(calls);
  } finally {
    globalThis.fetch = real;
  }
}

test("handler sends one Resend email carrying the deadline and the void rule", async () => {
  await withFetch(async (calls) => {
    const res = await handle(req(), env);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { id: "re_1" });
    const sends = calls.filter((c) => c.url === "https://api.resend.com/emails");
    assert.equal(sends.length, 1);
    const h = sends[0].init!.headers as Record<string, string>;
    assert.equal(h["Idempotency-Key"], "confirm-7");
    const body = JSON.parse(String(sends[0].init!.body));
    assert.deepEqual(body.to, ["ada@example.com"]);
    assert.equal(body.subject, "You're almost done, Ada");
    for (const part of [body.html, body.text]) {
      assert.match(part, /Tuesday, Oct 20, 3:40 PM PT/);
      assert.match(part, /abc123/);
      assert.ok(!part.includes("{{"));
    }
    assert.match(body.text, /void/);
  });
});

test("wrong webhook secret is rejected before any network call", async () => {
  await withFetch(async (calls) => {
    assert.equal((await handle(req("nope"), env)).status, 401);
    assert.equal(calls.length, 0);
  });
});
