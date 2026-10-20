import { test } from "node:test";
import assert from "node:assert/strict";
import { handle, tokenFor } from "./handler.ts";

const ENV: Record<string, string> = {
  SUPABASE_URL: "https://supabase.example.com",
  SUPABASE_SERVICE_ROLE_KEY: "svc",
  RS_UNSUB_SECRET: "test-secret",
};
const env = (k: string) => ENV[k];
const BASE = "https://fn.example.com/functions/v1/unsubscribe";
const VECTOR = "UaNW6S5bsCeqFt76ar0wJ6V_om1Lu6BfpZGKZJIaF6c";
const OK = "This unsubscribe link is not valid.";
const BODY = "List-Unsubscribe=One-Click";

type Call = { url: string; init?: RequestInit };

async function withFetch<T>(status: number, fn: (calls: Call[]) => Promise<T>): Promise<T> {
  const real = globalThis.fetch;
  const calls: Call[] = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(null, { status });
  }) as typeof fetch;
  try {
    return await fn(calls);
  } finally {
    globalThis.fetch = real;
  }
}

const url = (e: string | null, t: string | null) => {
  const q = new URLSearchParams();
  if (e !== null) q.set("e", e);
  if (t !== null) q.set("t", t);
  return `${BASE}?${q}`;
};
const post = (u: string, body: string | null = BODY) =>
  new Request(u, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

test("shared token vector", async () => {
  assert.equal(await tokenFor("Founder@Example.com", "test-secret"), VECTOR);
});

test("GET valid redirects to the site and touches nothing", async () => {
  await withFetch(200, async (calls) => {
    const res = await handle(new Request(url("founder@example.com", VECTOR)), env);
    assert.equal(res.status, 303);
    assert.equal(
      res.headers.get("Location"),
      `https://joinvenn.org/unsubscribe?e=${encodeURIComponent("founder@example.com")}&t=${VECTOR}`,
    );
    assert.equal(calls.length, 0);
  });
});

test("uppercase email in e still verifies against the lowercased token", async () => {
  await withFetch(200, async (calls) => {
    const res = await handle(new Request(url("  Founder@Example.com ", VECTOR)), env);
    assert.equal(res.status, 303);
    assert.match(res.headers.get("Location")!, /e=founder%40example\.com&/);
    assert.equal(calls.length, 0);
  });
});

for (const [name, e, t] of [
  ["wrong token", "founder@example.com", "A" + VECTOR.slice(1)],
  ["wrong-case token", "founder@example.com", VECTOR.toLowerCase()],
  ["missing token", "founder@example.com", null],
  ["missing e", null, VECTOR],
  ["oversize e", "a".repeat(250) + "@x.com", VECTOR],
] as const) {
  for (const method of ["GET", "POST"]) {
    test(`${method} ${name} -> 400, no fetch`, async () => {
      await withFetch(200, async (calls) => {
        const u = url(e, t);
        const res = await handle(method === "GET" ? new Request(u) : post(u), env);
        assert.equal(res.status, 400);
        assert.equal(await res.text(), OK);
        assert.match(res.headers.get("Content-Type")!, /^text\/plain/);
        assert.equal(calls.length, 0);
      });
    });
  }
}

test("POST valid inserts one rs_events row", async () => {
  await withFetch(201, async (calls) => {
    const res = await handle(post(url("Founder@Example.com", VECTOR)), env);
    assert.equal(res.status, 200);
    assert.equal(await res.text(), "You're unsubscribed from Venn emails.");
    assert.equal(res.headers.get("Access-Control-Allow-Origin"), "https://joinvenn.org");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://supabase.example.com/rest/v1/rs_events?on_conflict=event_id");
    assert.equal(calls[0].init!.method, "POST");
    const h = calls[0].init!.headers as Record<string, string>;
    assert.equal(h["apikey"], "svc");
    assert.equal(h["Authorization"], "Bearer svc");
    assert.equal(h["Prefer"], "resolution=ignore-duplicates,return=minimal");
    assert.deepEqual(JSON.parse(String(calls[0].init!.body)), {
      event_id: "unsub:founder@example.com",
      email: "founder@example.com",
      kind: "unsubscribed",
      source: "unsubscribe",
    });
  });
});

test("repeated POST is idempotent: same event_id, ignore-duplicates", async () => {
  await withFetch(201, async (calls) => {
    for (let i = 0; i < 2; i++) assert.equal((await handle(post(url("founder@example.com", VECTOR)), env)).status, 200);
    assert.equal(calls.length, 2);
    const ids = calls.map((c) => JSON.parse(String(c.init!.body)).event_id);
    assert.equal(ids[0], ids[1]);
    for (const c of calls) assert.match((c.init!.headers as Record<string, string>)["Prefer"], /ignore-duplicates/);
  });
});

test("POST without the one-click body -> 400, no fetch", async () => {
  await withFetch(201, async (calls) => {
    for (const b of [null, "", "foo=bar", "List-Unsubscribe=No"]) {
      const res = await handle(post(url("founder@example.com", VECTOR), b), env);
      assert.equal(res.status, 400);
      assert.equal(await res.text(), OK);
    }
    assert.equal(calls.length, 0);
  });
});

test("write failure -> 500 generic", async () => {
  await withFetch(500, async () => {
    const res = await handle(post(url("founder@example.com", VECTOR)), env);
    assert.equal(res.status, 500);
    assert.equal(await res.text(), "Something went wrong. Please try again.");
  });
});

test("missing RS_UNSUB_SECRET -> 500", async () => {
  await withFetch(200, async (calls) => {
    const res = await handle(new Request(url("founder@example.com", VECTOR)), (k) => (k === "RS_UNSUB_SECRET" ? undefined : ENV[k]));
    assert.equal(res.status, 500);
    assert.equal(calls.length, 0);
  });
});

test("other methods -> 405", async () => {
  const res = await handle(new Request(url("founder@example.com", VECTOR), { method: "PUT" }), env);
  assert.equal(res.status, 405);
});
