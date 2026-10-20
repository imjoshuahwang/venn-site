// One-click unsubscribe for Venn's cold/outreach email (RFC 8058). Not called by a database trigger: the link
// and the List-Unsubscribe header are put in each email by the sender in the venn repo (Python).
//
// Link: https://wirjadichvbmrqzamwtp.supabase.co/functions/v1/unsubscribe?e=<encodeURIComponent(email_norm)>&t=<token>
//   email_norm = email.trim().toLowerCase()
//   token      = base64url(HMAC-SHA256(key = UTF-8 bytes of env RS_UNSUB_SECRET, msg = UTF-8 bytes of email_norm)),
//                RFC 4648 url-safe alphabet, no '=' padding (43 chars).
//   Shared test vector: secret "test-secret", email "Founder@Example.com" -> UaNW6S5bsCeqFt76ar0wJ6V_om1Lu6BfpZGKZJIaF6c
//
// GET never changes state (mail scanners prefetch links): it 303s to the confirm page on joinvenn.org, because
// Supabase serves text/html from the default domain as text/plain. POST with body List-Unsubscribe=One-Click
// records the unsubscribe in rs_events (idempotent). Every bad-link failure returns the same 400 text.
export type Env = (name: string) => string | undefined;

const SITE = "https://joinvenn.org";
const BAD = "This unsubscribe link is not valid.";
const text = (body: string, status: number, extra: Record<string, string> = {}) =>
  new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8", ...extra } });

const b64url = (buf: ArrayBuffer): string =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export async function tokenFor(email: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(email.trim().toLowerCase())));
}

// Constant-time compare (length is not secret).
function safeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export async function handle(req: Request, env: Env): Promise<Response> {
  if (req.method !== "GET" && req.method !== "POST") return text("Method not allowed.", 405);
  const secret = env("RS_UNSUB_SECRET");
  if (!secret) return text("Something went wrong. Please try again.", 500);

  const q = new URL(req.url).searchParams;
  const email = (q.get("e") ?? "").trim().toLowerCase();
  const t = q.get("t") ?? "";
  if (!email || email.length > 254 || !t || !safeEqual(await tokenFor(email, secret), t)) return text(BAD, 400);

  if (req.method === "GET") {
    return new Response(null, {
      status: 303,
      headers: { Location: `${SITE}/unsubscribe?e=${encodeURIComponent(email)}&t=${encodeURIComponent(t)}` },
    });
  }

  const form = new URLSearchParams(await req.text());
  if (form.get("List-Unsubscribe") !== "One-Click") return text(BAD, 400);

  const KEY = env("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  try {
    const r = await fetch(`${env("SUPABASE_URL")}/rest/v1/rs_events?on_conflict=event_id`, {
      method: "POST",
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=ignore-duplicates,return=minimal",
      },
      body: JSON.stringify({ event_id: `unsub:${email}`, email, kind: "unsubscribed", source: "unsubscribe" }),
    });
    if (!r.ok) {
      console.log(`unsubscribe write failed ${r.status}`);
      return text("Something went wrong. Please try again.", 500);
    }
  } catch {
    console.log("unsubscribe write threw");
    return text("Something went wrong. Please try again.", 500);
  }
  return text("You're unsubscribed from Venn emails.", 200, { "Access-Control-Allow-Origin": SITE });
}
