// Instant "we got your application" email. Fired by a Postgres trigger (see migration 20261018030000).
// template.json is generated, not hand-edited: regenerate it with `python -m venn confirm --emit-template <path>`
// in the venn repo (confirm.py is the single source of truth), then copy it here.
import template from "./template.json" with { type: "json" };
import { mailable } from "./mailable.ts";
import { formatDeadline } from "./deadline.ts";

const SITE = "https://joinvenn.org";
const FROM = "Venn <hello@joinvenn.org>";
const REPLY_TO = "contact@joinvenn.org";

export type Env = (name: string) => string | undefined;

// Python html.escape(quote=True)
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

// Port of confirm.first_name(): first whitespace token, only if it looks like a plain name
// (letters, apostrophe, hyphen, max 20); anything else gets no name at all. Capitalize the first letter.
const NAME_RE = /^[\p{L}][\p{L}'-]{0,19}$/u;
function firstName(name: string | null): string {
  const word = (name ?? "").trim().split(/\s+/)[0] ?? "";
  if (!NAME_RE.test(word)) return "there";
  const chars = Array.from(word);
  return chars[0].toUpperCase() + chars.slice(1).join("");
}

// Port of confirm.headline()
const headline = (first: string): string => first === "there" ? "You're almost done" : `You're almost done, ${first}`;

const fill = (tpl: string, vals: Record<string, string>, escape: (s: string) => string) =>
  tpl.split("{{headline}}").join(escape(vals.headline)).split("{{refer_link}}").join(escape(vals.refer_link))
    .split("{{deadline}}").join(escape(vals.deadline));

// Same list as TYPO_DOMAINS in the venn repo's confirm.py.
const TYPO_DOMAINS = new Set(
  `gmial.com gmai.com gamil.com gmal.com gmil.com gmail.co gmail.con gmail.cm gmaill.com gmail.om gmail.vom gmsil.com
gnail.com gmaul.com gemail.com hotmial.com hotmai.com hotmal.com hotmail.con hotmail.co hotnail.com homail.com yaho.com
yahooo.com yahoo.con yahoo.co yhoo.com yahho.com outlok.com outloo.com outlook.con iclod.com icoud.com iclould.com
icloud.con icloud.co`.split(/\s+/),
);

// Port of confirm.valid_email(): ONE plain address. submit_application stores any text up to 320 chars, so without
// this a caller could put "a@x.com, b@y.com" or "Any Text <victim@x.com>" in email and Resend would mail several
// people, or show attacker text as the To name, from our domain.
const EMAIL_RE = /^[A-Za-z0-9._%+'-]+@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,24}$/;
const validEmail = (e: string) => e.length <= 254 && !e.includes("..") && EMAIL_RE.test(e);
// Same set as ROLE_LOCALS in the venn repo's mail.py: not a student, never mailed.
const ROLE_LOCALS = new Set(["noreply", "no-reply", "donotreply", "do-not-reply", "postmaster", "mailer-daemon"]);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const unclaim = async (rest: Rest, id: number | string) => {
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

type Rest = (path: string, init?: RequestInit) => Promise<Response>;

// The whole request path. index.ts wires it to Deno.serve and Deno.env; tests pass a fake env and stub fetch.
export async function handle(req: Request, env: Env): Promise<Response> {
  const SUPABASE_URL = env("SUPABASE_URL")!;
  const KEY = env("SUPABASE_SERVICE_ROLE_KEY")!;
  const rest: Rest = (path, init = {}) =>
    fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
  const secret = env("WEBHOOK_SECRET");
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

  const got = await rest(`applications?id=eq.${id}&select=id,role,name,email,email_key,ref_code,page_token,is_test,confirmed_at,email_status,share_due`);
  if (!got.ok) return json({ error: "read failed" }, 502);
  const row = (await got.json())[0];
  if (!row) return json({ skipped: "not_found" });

  // Only student applications get this email (venn confirm sweeps students only too).
  if (row.role !== "student") return json({ skipped: "not_student" });

  const mode = env("SEND_MODE") === "all" ? "all" : "test";
  if (mode === "test" && !row.is_test) return json({ skipped: "send_mode" });
  const email = (row.email ?? "").trim();
  if (!email || !row.page_token) return json({ skipped: "no_email_or_page_token" });
  if (!validEmail(email)) return json({ skipped: "invalid_email" });

  // A known bounce/complaint (synced from Resend by `venn confirm`) is never mailed again.
  if (row.email_status) return json({ skipped: "email_status" });
  const domain = email.slice(email.lastIndexOf("@") + 1).toLowerCase();
  if (TYPO_DOMAINS.has(domain)) return json({ skipped: "typo_domain" });
  if (ROLE_LOCALS.has(email.slice(0, email.lastIndexOf("@")).toLowerCase().split("+")[0])) return json({ skipped: "role_address" });
  if (!(await mailable(domain))) return json({ skipped: "no_mx" });

  // Same address applied earlier: that application gets the email, not this one.
  if (row.email_key) {
    // Only an earlier non-test student row counts: a test row or a club/company row never got the email.
    const dup = await rest(
      `applications?email_key=eq.${encodeURIComponent(row.email_key)}&id=lt.${id}&role=eq.student&is_test=eq.false&select=id&limit=1`,
    );
    if (!dup.ok) return json({ error: "dedupe read failed" }, 502);
    if ((await dup.json()).length) {
      // Mark the repeat as handled so the `venn confirm` sweeper never picks it up (it skips repeats too).
      const mark = await rest(`applications?id=eq.${id}&confirmed_at=is.null`, {
        method: "PATCH",
        body: JSON.stringify({ confirmed_at: new Date().toISOString() }),
      });
      if (!mark.ok) console.log(`duplicate mark failed ${mark.status} for application ${id}`);
      return json({ skipped: "duplicate" });
    }
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
      refer_link: `${SITE}/refer?code=${encodeURIComponent(row.page_token)}`,
      deadline: formatDeadline(row.share_due),
    };
    const post = () =>
      fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env("RESEND_API_KEY")}`,
          "Content-Type": "application/json",
          "User-Agent": "venn",
          "Idempotency-Key": `confirm-${id}`,
        },
        signal: AbortSignal.timeout(10000),
        body: JSON.stringify({
          from: FROM,
          to: [email],
          reply_to: REPLY_TO,
          subject: fill(template.subject, vals, (s) => s),
          html: fill(template.html, vals, esc),
          text: fill(template.text, vals, (s) => s),
        }),
      });
    let res = await post();
    // A burst can trip Resend's per-second rate limit (429) or hit a 5xx. Retry ONCE with the same Idempotency-Key
    // (Resend dedupes it for 24h, so a retry can never double-send). A daily/monthly quota 429 is not retried:
    // the claim is released below and `venn confirm` sends the row once the quota resets (00:00 UTC).
    if (res.status === 429 || res.status >= 500) {
      const err = await res.clone().json().catch(() => ({}));
      if (!/quota/.test(String(err?.name ?? ""))) {
        const wait = Math.min(Math.max(Number(res.headers.get("retry-after")) || 1, 1), 3);
        await new Promise((r) => setTimeout(r, wait * 1000));
        res = await post();
      }
    }
    if (!res.ok) {
      // Resend answered with an error, so nothing was sent: release the claim so a retry can send.
      const err = await res.json().catch(() => ({}));
      console.log(`resend ${res.status} ${err?.name ?? ""} for application ${id}`);
      await unclaim(rest, id as number);
      return json({ error: "resend failed" }, 502);
    }
    const sent = await res.json();
    console.log(`sent application ${id} resend ${sent.id}`);
    return json({ id: sent.id });
  } catch {
    // Timeout or network error after calling Resend: the outcome is unknown, and Resend may have sent it.
    // KEEP the claim so nothing resends (a missed email is cheaper than a double one).
    console.log(`send outcome unknown for application ${id}, claim kept`);
    return json({ error: "send outcome unknown" }, 502);
  }
}
