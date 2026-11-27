import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { handle } from "./handler.ts";

const KEY = Buffer.from("test-signing-key-0123456789abcdef");
const ENV: Record<string, string> = {
  SUPABASE_URL: "https://supabase.example.com",
  SUPABASE_SERVICE_ROLE_KEY: "svc",
  RESEND_WEBHOOK_SECRET: `whsec_${KEY.toString("base64")}`,
};
const env = (k: string) => ENV[k];
const NOW_S = 1_800_000_000;
const now = () => NOW_S * 1000;

const sign = (id: string, ts: string | number, body: string) =>
  "v1," + createHmac("sha256", KEY).update(`${id}.${ts}.${body}`).digest("base64");

function req(payload: unknown, o: { id?: string; ts?: number; sig?: string; drop?: string; method?: string } = {}) {
  const body = JSON.stringify(payload);
  const id = o.id ?? "msg_1";
  const ts = o.ts ?? NOW_S;
  const headers: Record<string, string> = {
    "svix-id": id,
    "svix-timestamp": String(ts),
    "svix-signature": o.sig ?? `v1,bogus ${sign(id, ts, body)}`,
  };
  if (o.drop) delete headers[o.drop];
  return new Request("https://fn.example.com/", { method: o.method ?? "POST", headers, body: o.method === "GET" ? undefined : body });
}

const bounced = {
  type: "email.bounced",
  created_at: "2026-10-20T00:00:00Z",
  data: { email_id: "re_1", to: [" Ada@Example.com ", "B@x.org"], bounce: { type: "Permanent", subType: "General" } },
};

type Call = { url: string; init?: RequestInit };
async function withFetch<T>(status: number, fn: (calls: Call[]) => Promise<T>): Promise<T> {
  const real = globalThis.fetch;
  const calls: Call[] = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    calls.push({ url: u, init });
    if (u === "https://supabase.example.com/rest/v1/rs_events?on_conflict=event_id") return new Response("", { status });
    throw new Error(`unexpected network call ${u}`);
  }) as typeof fetch;
  try {
    return await fn(calls);
  } finally {
    globalThis.fetch = real;
  }
}

test("valid signature writes one mapped row per recipient", async () => {
  await withFetch(201, async (calls) => {
    const res = await handle(req(bounced), env, now);
    assert.equal(res.status, 200);
    assert.equal(calls.length, 1);
    const h = calls[0].init!.headers as Record<string, string>;
    assert.equal(h.apikey, "svc");
    assert.equal(h.Authorization, "Bearer svc");
    assert.equal(h.Prefer, "resolution=ignore-duplicates,return=minimal");
    assert.deepEqual(JSON.parse(String(calls[0].init!.body)), [
      { event_id: "msg_1", email: "ada@example.com", kind: "bounced", source: "resend-webhook", resend_email_id: "re_1", detail: "Permanent/General" },
      { event_id: "msg_1:1", email: "b@x.org", kind: "bounced", source: "resend-webhook", resend_email_id: "re_1", detail: "Permanent/General" },
    ]);
  });
});

test("complained and delivered map, detail is null without a bounce", async () => {
  await withFetch(201, async (calls) => {
    for (const [type, kind] of [["email.complained", "complained"], ["email.delivered", "delivered"]]) {
      calls.length = 0;
      const res = await handle(req({ type, data: { email_id: "re_2", to: ["a@b.com"] } }), env, now);
      assert.equal(res.status, 200);
      const rows = JSON.parse(String(calls[0].init!.body));
      assert.equal(rows[0].kind, kind);
      assert.equal(rows[0].detail, null);
    }
  });
});

test("bad signature, missing headers, stale and future timestamps are 401 with no fetch", async () => {
  await withFetch(201, async (calls) => {
    const cases = [
      req(bounced, { sig: "v1,AAAA" }),
      req(bounced, { drop: "svix-id" }),
      req(bounced, { drop: "svix-timestamp" }),
      req(bounced, { drop: "svix-signature" }),
      req(bounced, { ts: NOW_S - 301 }),
      req(bounced, { ts: NOW_S + 301 }),
    ];
    for (const r of cases) {
      const res = await handle(r, env, now);
      assert.equal(res.status, 401);
      assert.deepEqual(await res.json(), { error: "unauthorized" });
    }
    assert.equal(calls.length, 0);
  });
});

test("non-POST is 405, missing secret is 500", async () => {
  await withFetch(201, async (calls) => {
    assert.equal((await handle(req(bounced, { method: "GET" }), env, now)).status, 405);
    assert.equal((await handle(req(bounced), () => undefined, now)).status, 500);
    assert.equal(calls.length, 0);
  });
});

test("unknown type is ignored without a write", async () => {
  await withFetch(201, async (calls) => {
    const res = await handle(req({ type: "email.opened", data: { email_id: "re_3", to: ["a@b.com"] } }), env, now);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ignored: true });
    assert.equal(calls.length, 0);
  });
});

test("replay sends the same event_id with ignore-duplicates", async () => {
  await withFetch(201, async (calls) => {
    await handle(req(bounced), env, now);
    await handle(req(bounced), env, now);
    assert.equal(calls.length, 2);
    for (const c of calls) {
      assert.equal(JSON.parse(String(c.init!.body))[0].event_id, "msg_1");
      assert.match((c.init!.headers as Record<string, string>).Prefer, /ignore-duplicates/);
    }
  });
});

test("write failure is 500 so svix retries", async () => {
  await withFetch(503, async () => {
    const res = await handle(req(bounced), env, now);
    assert.equal(res.status, 500);
  });
});

// Bounce alert gate (#251): switch off, failed PATCH, test rows or a non-allowlisted address send nothing.
async function bounceRun(e: Record<string, string>, o: { patch?: number; isTest?: boolean } = {}) {
  const real = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = (async (url: string | URL | Request) => {
    const u = String(url);
    urls.push(u);
    if (u.includes("rs_events")) return new Response("", { status: 201 });
    if (u.includes("/rest/v1/matches") && !u.includes("select=")) return new Response("", { status: o.patch ?? 200 });
    if (u.includes("/rest/v1/matches")) return new Response(JSON.stringify([{ requester: { applications: { is_test: !!o.isTest } }, peer: { applications: { is_test: false } } }]));
    if (u.includes("api.resend.com")) return new Response("{}");
    throw new Error(`unexpected ${u}`);
  }) as typeof fetch;
  try {
    const ev = { type: "email.bounced", data: { email_id: "re_1", to: ["a@b.com"], tags: { kind: "match_request", match_id: "7" } } };
    await handle(req(ev), (k) => ({ ...ENV, ...e })[k], now);
    return urls.filter((u) => u.includes("api.resend.com")).length;
  } finally {
    globalThis.fetch = real;
  }
}
const alertEnv = { MATCH_ALERT_TO: "contact+portal-a@joinvenn.org", STUDENT_RESEND_API_KEY: "k" };

test("bounce alert: switch unset sends nothing", async () => assert.equal(await bounceRun(alertEnv), 0));
test("bounce alert: switch on and PATCH ok sends one", async () => assert.equal(await bounceRun({ ...alertEnv, MATCH_SENDS_ENABLED: "1" }), 1));
test("bounce alert: failed PATCH sends nothing", async () => assert.equal(await bounceRun({ ...alertEnv, MATCH_SENDS_ENABLED: "1" }, { patch: 500 }), 0));
test("bounce alert: test row sends nothing", async () => assert.equal(await bounceRun({ ...alertEnv, MATCH_SENDS_ENABLED: "1" }, { isTest: true }), 0));
test("bounce alert: non-allowlisted address sends nothing", async () => assert.equal(await bounceRun({ ...alertEnv, MATCH_ALERT_TO: "x@example.com", MATCH_SENDS_ENABLED: "1" }), 0));
