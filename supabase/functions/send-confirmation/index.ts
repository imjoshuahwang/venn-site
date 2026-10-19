// Instant "we got your application" email. Fired by a Postgres trigger (see migration 20261018030000).
// template.json is generated, not hand-edited: regenerate it with `python -m venn confirm --emit-template <path>`
// in venn-referrals (confirm.py is the single source of truth), then copy it here.
import template from "./template.json" with { type: "json" };

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE = "https://joinvenn.org";
const FROM = "Venn <hello@joinvenn.org>";
const REPLY_TO = "contact@joinvenn.org";

const rest = (path: string, init: RequestInit = {}) =>
  fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

// Python html.escape(quote=True)
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

// Port of confirm.first_name()
function firstName(name: string | null): string {
  const word = (name ?? "").trim().split(" ")[0];
  const lower = word !== word.toUpperCase() && word === word.toLowerCase();
  if (lower) {
    const chars = Array.from(word);
    return chars[0].toUpperCase() + chars.slice(1).join("");
  }
  return word || "there";
}

// Port of confirm.headline()
const headline = (first: string): string => first === "there" ? "You're almost done" : `You're almost done, ${first}`;

const fill = (tpl: string, vals: Record<string, string>, escape: (s: string) => string) =>
  tpl.split("{{headline}}").join(escape(vals.headline)).split("{{refer_link}}").join(escape(vals.refer_link));

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const unclaim = async (id: number | string) => {
  try {
    const r = await rest(`applications?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ confirmed_at: null }) });
    if (!r.ok) console.log(`unclaim failed ${r.status} for application ${id}`);
  } catch {
    console.log(`unclaim failed for application ${id}`);
  }
};

// Constant-time compare (length is not secret).
function safeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

Deno.serve(async (req) => {
  const secret = Deno.env.get("WEBHOOK_SECRET");
  if (!secret || !safeEqual(req.headers.get("x-webhook-secret") ?? "", secret)) return json({ error: "unauthorized" }, 401);

  let id: unknown;
  try {
    id = (await req.json())?.record?.id;
  } catch {
    return json({ error: "bad body" }, 400);
  }
  if (typeof id !== "number" && !(typeof id === "string" && /^[0-9a-f-]+$/i.test(id))) {
    return json({ error: "no record id" }, 400);
  }

  const got = await rest(`applications?id=eq.${id}&select=id,name,email,email_key,ref_code,is_test,confirmed_at`);
  if (!got.ok) return json({ error: "read failed" }, 502);
  const row = (await got.json())[0];
  if (!row) return json({ skipped: "not_found" });

  const mode = Deno.env.get("SEND_MODE") === "all" ? "all" : "test";
  if (mode === "test" && !row.is_test) return json({ skipped: "send_mode" });
  const email = (row.email ?? "").trim();
  if (!email || !row.ref_code) return json({ skipped: "no_email_or_ref_code" });

  // Same address applied earlier: that application gets the email, not this one.
  if (row.email_key) {
    const dup = await rest(`applications?email_key=eq.${encodeURIComponent(row.email_key)}&id=lt.${id}&select=id&limit=1`);
    if (!dup.ok) return json({ error: "dedupe read failed" }, 502);
    if ((await dup.json()).length) return json({ skipped: "duplicate" });
  }

  // Idempotent claim: only the call that flips confirmed_at from null sends.
  const claim = await rest(`applications?id=eq.${id}&confirmed_at=is.null`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ confirmed_at: new Date().toISOString() }),
  });
  if (!claim.ok) return json({ error: "claim failed" }, 502);
  if (!(await claim.json()).length) return json({ skipped: "already_sent" });

  try {
    const vals = {
      headline: headline(firstName(row.name)),
      refer_link: `${SITE}/refer?code=${encodeURIComponent(row.ref_code)}`,
    };
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
        "Content-Type": "application/json",
        "User-Agent": "venn",
        "Idempotency-Key": `confirm-${id}`,
      },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({
        from: FROM,
        to: [email],
        reply_to: REPLY_TO,
        subject: template.subject,
        html: fill(template.html, vals, esc),
        text: fill(template.text, vals, (s) => s),
      }),
    });
    if (!res.ok) {
      console.log(`resend ${res.status} for application ${id}`);
      await unclaim(id as number);
      return json({ error: "resend failed" }, 502);
    }
    const sent = await res.json();
    console.log(`sent application ${id} resend ${sent.id}`);
    return json({ id: sent.id });
  } catch {
    console.log(`send error for application ${id}`);
    await unclaim(id as number);
    return json({ error: "send failed" }, 502);
  }
});
