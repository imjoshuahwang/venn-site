import templates from "./templates.json" with { type: "json" };
import { buildNotice, buildRequest, matchSendsEnabled, matchToken, sendMail, tokenHash, type Env, type SendResult } from "../../../src/lib/match/mail.ts";

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
type Row = { id: number; message: string | null; requester: Person | null; peer: Person | null };
const SELECT = "id,message,requester:results!requester_result_id(applications(name,email,org,is_test)),peer:results!peer_result_id(applications(name,email,org,is_test))";

export async function handle(req: Request, env: Env, deps: { fetch?: typeof fetch; log?: (m: string) => void } = {}): Promise<Response> {
  const secret = env("MATCH_SWEEP_SECRET");
  if (!secret || !safeEqual(req.headers.get("x-webhook-secret") ?? "", secret)) return json({ error: "unauthorized" }, 401);
  // Kill switch: off means no sends AND no state changes, so nothing is expired or marked reminded without its mail.
  if (!matchSendsEnabled(env)) return json({ disabled: true });
  const tokenSecret = env("MATCH_TOKEN_SECRET");
  if (!tokenSecret) return json({ error: "server misconfigured" }, 500);

  const f = deps.fetch ?? fetch;
  const log = deps.log ?? console.log;
  const KEY = env("SUPABASE_SERVICE_ROLE_KEY")!;
  const call = (path: string, init: RequestInit = {}) =>
    f(`${env("SUPABASE_URL")}/rest/v1/${path}`, { ...init, headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" } });
  const load = async (id: number): Promise<Row | null> => {
    const r = await call(`matches?id=eq.${id}&select=${SELECT}`);
    return r.ok ? ((await r.json()) as Row[])[0] ?? null : null;
  };
  const out: Record<string, number> = { remind: 0, expire: 0, request: 0, skipped: 0, failed: 0 };
  const tally = (key: string, r: SendResult) => { out[r.sent ? key : r.reason === "failed" ? "failed" : "skipped"]++; };

  // 1. First requests: requested matches that have no link yet. Issue the link, then mail it.
  const pending = await call("matches?status=eq.requested&token_hash=is.null&select=id");
  for (const { id } of pending.ok ? ((await pending.json()) as { id: number }[]) : []) {
    try {
      const row = await load(id);
      const rq = row?.requester?.applications, peer = row?.peer?.applications;
      if (!row || !rq || !peer || !row.message) continue;
      if (rq.is_test || peer.is_test) { out.skipped++; continue; }
      const token = await matchToken(tokenSecret, id);
      const issued = await call("rpc/match_issue_token", { method: "POST", body: JSON.stringify({ p_match_id: id, p_token_hash: await tokenHash(token) }) });
      if (!issued.ok) { out.failed++; continue; }
      tally("request", await sendMail(buildRequest(templates, "request", { matchId: id, peerEmail: peer.email, peerName: peer.name, requesterName: rq.name, requesterOrg: rq.org, message: row.message, token }), { env, fetch: f, log }));
    } catch { out.failed++; log(`match ${id} request failed`); }
  }

  // 2. Hour-48 reminders and 72h expiries, decided in the database.
  const sweep = await call("rpc/match_sweep", { method: "POST", body: "{}" });
  if (!sweep.ok) { log(`match_sweep failed ${sweep.status}`); return json({ ...out, error: "sweep failed" }, 500); }
  for (const { match_id: id, action } of (await sweep.json()) as { match_id: number; action: string }[]) {
    try {
      const row = await load(id);
      const rq = row?.requester?.applications, peer = row?.peer?.applications;
      if (!row || !rq || !peer) continue;
      const isTest = rq.is_test || peer.is_test;
      if (action === "remind" && row.message) {
        tally("remind", await sendMail(buildRequest(templates, "reminder", { matchId: id, peerEmail: peer.email, peerName: peer.name, requesterName: rq.name, requesterOrg: rq.org, message: row.message, token: await matchToken(tokenSecret, id) }), { env, fetch: f, log, isTest }));
      } else if (action === "expire") {
        tally("expire", await sendMail(buildNotice(templates, "expired", { matchId: id, email: rq.email, name: rq.name }), { env, fetch: f, log, isTest }));
      }
    } catch { out.failed++; log(`match ${id} ${action} failed`); }
  }
  return json(out);
}
