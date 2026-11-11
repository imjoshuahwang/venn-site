// Locked-guide form logic. Pure and network-injected so it is unit-tested without a browser.
// The locked html lives only in Supabase; the page never holds it until unlock_guide returns it.
export type Cfg = { url: string; key: string };
export type Step = 'thing' | 'email' | 'done';
type Fetch = typeof fetch;

export const pctFor = (s: Step) => ({ thing: 30, email: 70, done: 100 })[s];
export const thingOk = (v: string) => { const n = v.trim().length; return n >= 1 && n <= 200; };
export const emailOk = (v: string) => v.length <= 254 && /^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$/.test(v.trim());

const rpc = (f: Fetch, c: Cfg, name: string, body: object, keepalive = false) =>
  f(`${c.url}/rest/v1/rpc/${name}`, {
    method: 'POST', keepalive,
    headers: { apikey: c.key, Authorization: `Bearer ${c.key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

export type Unlock = { ok: true; html: string } | { ok: false };

export async function unlockGuide(f: Fetch, c: Cfg, a: { slug: string; email: string; thing: string; ref: string }): Promise<Unlock> {
  if (!c.url || !c.key || !emailOk(a.email) || !thingOk(a.thing)) return { ok: false };
  try {
    const r = await rpc(f, c, 'unlock_guide', { p_slug: a.slug, p_email: a.email.trim().toLowerCase(), p_thing: a.thing.trim(), p_ref: a.ref });
    if (!r.ok) return { ok: false };
    const html = await r.json();
    return typeof html === 'string' && html.length > 0 ? { ok: true, html } : { ok: false };
  } catch { return { ok: false }; }
}

export async function guideEvent(f: Fetch, c: Cfg, event: 'guide_view' | 'form_start', slug: string, ref: string): Promise<void> {
  if (!c.url || !c.key) return;
  try { await rpc(f, c, 'guide_event', { p_event: event, p_slug: slug, p_ref: ref }, true); } catch {}
}
