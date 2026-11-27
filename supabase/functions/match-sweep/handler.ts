import templates from "./templates.json" with { type: "json" };
import { buildIntro, buildNotice, buildRequest, matchSendsEnabled, matchToken, sendMail, sendThenMark, tokenHash, type Env, type SendResult } from "../../../src/lib/match/mail.ts";

// templates.json is generated: node scripts/match/templates.mjs
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function safeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

type Person = { applications: { name: string | null; email: string; org: string | null; is_test: boolean } | null };
type Row = { id: number; status: string; message: string | null; requester: Person | null; peer: Person | null };
const SELECT = "id,status,message,requester:results!requester_result_id(applications(name,email,org,is_test)),peer:results!peer_result_id(applications(name,email,org,is_test))";

export async function handle(req: Request, env: Env, deps: { fetch?: typeof fetch; log?: (m: string) => void } = {}): Promise<Response> {
  const secret = env("MATCH_SWEEP_SECRET");
  if (!secret || !safeEqual(req.headers.get("x-webhook-secret") ?? "", secret)) return json({ error: "unauthorized" }, 401);
  // Kill switch: off means no sends AND no state changes, so nothing is expired or marked reminded without its mail.
  if (!matchSendsEnabled(env)) return json({ disabled: true });
  const tokenSecret = env("MATCH_TOKEN_SECRET");
  if (!tokenSecret) return json({ error: "server misconfigured" }, 500);

  const f = deps.fetch ?? fetch;
  const log = deps.log ?? console.log;
  const KEY = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!KEY || !env("SUPABASE_URL")) return json({ error: "server misconfigured" }, 500);
  const call = (path: string, init: RequestInit = {}) =>
    f(`${env("SUPABASE_URL")}/rest/v1/${path}`, { ...init, headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" } });
  const load = async (id: number): Promise<Row | null> => {
    const r = await call(`matches?id=eq.${id}&select=${SELECT}`);
    return r.ok ? ((await r.json()) as Row[])[0] ?? null : null;
  };
  const out: Record<string, number> = { remind: 0, expire: 0, intro: 0, decline: 0, request: 0, skipped: 0, failed: 0 };
  const markFn = (id: number, kind: string) => async () => (await call("rpc/match_mail_done", { method: "POST", body: JSON.stringify({ p_match_id: id, p_kind: kind }) })).ok;
  const done = async (id: number, kind: string, r: SendResult) => { if (r.sent) await markFn(id, kind)(); };
  const tally = (key: string, r: SendResult) => { out[r.sent ? key : r.reason === "failed" ? "failed" : "skipped"]++; };

  // 1. First requests: requested matches whose request mail has not gone out. Issue (or re-derive) the link, mail it, then mark it sent.
  const pending = await call("matches?status=eq.requested&request_mailed_at=is.null&select=id");
  for (const { id } of pending.ok ? ((await pending.json()) as { id: number }[]) : []) {
    try {
      const row = await load(id);
      const rq = row?.requester?.applications, peer = row?.peer?.applications;
      if (!row || !rq || !peer || !row.message) continue;
      if (rq.is_test || peer.is_test) { out.skipped++; continue; }
      const token = await matchToken(tokenSecret, id);
      const issued = await call("rpc/match_issue_token", { method: "POST", body: JSON.stringify({ p_match_id: id, p_token_hash: await tokenHash(token) }) });
      if (!issued.ok) { out.failed++; continue; }
      const r = await sendMail(buildRequest(templates, "request", { matchId: id, peerEmail: peer.email, peerName: peer.name, requesterName: rq.name, requesterOrg: rq.org, message: row.message, token }), { env, fetch: f, log });
      tally("request", r);
      await done(id, "request", r);
    } catch { out.failed++; log(`match ${id} request failed`); }
  }

  // 2. Hour-48 reminders and expiries (including ones closed by a bounce or a late click), decided in the database; marked only after a send.
  const sweep = await call("rpc/match_sweep", { method: "POST", body: "{}" });
  if (!sweep.ok) { log(`match_sweep failed ${sweep.status}`); return json({ ...out, error: "sweep failed" }, 500); }
  for (const { match_id: id, action } of (await sweep.json()) as { match_id: number; action: string }[]) {
    try {
      const row = await load(id);
      const rq = row?.requester?.applications, peer = row?.peer?.applications;
      if (!row || !rq || !peer) continue;
      const isTest = rq.is_test || peer.is_test;
      if (action === "remind" && row.message) {
        if (row.status !== "requested") { out.skipped++; continue; } // the peer answered since the sweep ran: no nudge
        const r = await sendMail(buildRequest(templates, "reminder", { matchId: id, peerEmail: peer.email, peerName: peer.name, requesterName: rq.name, requesterOrg: rq.org, message: row.message, token: await matchToken(tokenSecret, id) }), { env, fetch: f, log, isTest });
        tally("remind", r);
        await done(id, "reminder", r);
      } else if (action === "intro" && row.status === "accepted") {
        const r = await sendThenMark(buildIntro(templates, { matchId: id, a: { name: rq.name, email: rq.email }, b: { name: peer.name, email: peer.email } }), { env, fetch: f, log, isTest }, markFn(id, "intro"));
        tally("intro", r);
      } else if (action === "decline" && row.status === "declined") {
        const r = await sendThenMark(buildNotice(templates, "declined", { matchId: id, email: rq.email, name: rq.name }), { env, fetch: f, log, isTest }, markFn(id, "decline"));
        tally("decline", r);
      } else if (action === "expire") {
        const r = await sendMail(buildNotice(templates, "expired", { matchId: id, email: rq.email, name: rq.name }), { env, fetch: f, log, isTest });
        tally("expire", r);
        await done(id, "expiry", r);
      }
    } catch { out.failed++; log(`match ${id} ${action} failed`); }
  }
  return json(out);
}
