// Resend delivery webhook (svix-signed): records bounces, complaints and deliveries in rs_events (venn#397 G5).
// Verification follows https://docs.svix.com/receiving/verifying-payloads/how-manual
export type Env = (name: string) => string | undefined;

const TOLERANCE_S = 300;
const KINDS: Record<string, string> = {
  "email.bounced": "bounced",
  "email.complained": "complained",
  "email.delivered": "delivered",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const unauthorized = () => json({ error: "unauthorized" }, 401);

// Constant-time compare (length is not secret).
function safeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

const b64decode = (s: string): Uint8Array => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const b64encode = (b: ArrayBuffer): string => btoa(String.fromCharCode(...new Uint8Array(b)));

async function verify(secret: string, id: string, ts: string, sigHeader: string, raw: string, nowMs: number) {
  if (!/^\d{1,12}$/.test(ts)) return false;
  if (Math.abs(nowMs / 1000 - Number(ts)) > TOLERANCE_S) return false;
  let key: CryptoKey;
  try {
    const keyBytes = b64decode(secret.startsWith("whsec_") ? secret.slice(6) : secret);
    key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  } catch {
    return false;
  }
  const expected = b64encode(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${ts}.${raw}`)));
  let ok = false;
  for (const entry of sigHeader.split(" ")) {
    const [version, sig] = entry.split(",");
    if (version === "v1" && sig && safeEqual(sig, expected)) ok = true;
  }
  return ok;
}

// The whole request path. index.ts wires it to Deno.serve and Deno.env; tests pass a fake env, a fixed clock and stub fetch.
export async function handle(req: Request, env: Env, now: () => number = Date.now): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  const secret = env("RESEND_WEBHOOK_SECRET");
  if (!secret) return json({ error: "server misconfigured" }, 500);

  const id = req.headers.get("svix-id");
  const ts = req.headers.get("svix-timestamp");
  const sig = req.headers.get("svix-signature");
  if (!id || !ts || !sig) return unauthorized();
  const raw = await req.text();
  if (!(await verify(secret, id, ts, sig, raw, now()))) return unauthorized();

  let payload: any;
  try {
    payload = JSON.parse(raw);
  } catch {
    return json({ error: "bad request" }, 400);
  }
  const kind = KINDS[String(payload?.type)];
  if (!kind) return json({ ignored: true });

  const data = payload.data ?? {};
  const to: unknown[] = Array.isArray(data.to) ? data.to : [];
  const bounce = data.bounce;
  const detail = bounce ? [bounce.type, bounce.subType].filter(Boolean).join("/") || null : null;
  const rows = to.filter((e): e is string => typeof e === "string" && e.trim() !== "").map((e, i) => ({
    event_id: i === 0 ? id : `${id}:${i}`,
    email: e.trim().toLowerCase(),
    kind,
    source: "resend-webhook",
    resend_email_id: data.email_id ?? null,
    detail,
  }));
  if (rows.length === 0) return json({ ignored: true });

  const res = await fetch(`${env("SUPABASE_URL")}/rest/v1/rs_events?on_conflict=event_id`, {
    method: "POST",
    headers: {
      apikey: env("SUPABASE_SERVICE_ROLE_KEY")!,
      Authorization: `Bearer ${env("SUPABASE_SERVICE_ROLE_KEY")}`,
      "Content-Type": "application/json",
      Prefer: "resolution=ignore-duplicates,return=minimal",
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    console.log(`rs_events write failed ${res.status}`);
    return json({ error: "write failed" }, 500);
  }
  return json({ ok: true });
}
