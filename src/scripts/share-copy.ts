// Share copy and pickers for /refer (issue #22). Pure: no DOM, no storage, no network.
// Placeholders: {blank} {link} {friend} {name}. Every LinkedIn version keeps the exact sentence
// "I'm building {blank}." because the blank-swap code edits that line.

export const LINKEDIN_POSTS: string[] = [
  "I just applied to @Venn F26, a season for high schoolers who are already building things.\n\nI'm building {blank}.\n\nBuilding something too? Apply with my link: {link}",
  "Venn picks a small batch of high schoolers building clubs, projects, nonprofits and startups. I just applied to @Venn for the fall season.\n\nI'm building {blank}.\n\nIf you're building something, apply here: {link}",
  "Putting this out there: I'm building {blank}.\n\nI applied to @Venn F26 to build it alongside other high schoolers doing the same.\n\nKnow someone who belongs in the batch? Send them this: {link}",
  "@Venn has worked with 141 student organizations that reached 500K+ students. I just applied for its F26 batch.\n\nI'm building {blank}.\n\nApplications are open: {link}",
  "New step for my project: I applied to @Venn F26.\n\nI'm building {blank}.\n\nHigh schoolers building something can apply here: {link}",
];

export const FRIEND_EMAILS: { subject: string; body: string }[] = [
  {
    subject: 'Apply to Venn with me',
    body: "Hey {friend},\n\nI just applied to Venn F26. It's a season for high schoolers who are already building things (clubs, projects, nonprofits, startups). You'd be a good fit, so I'm sending you my link: {link}\n\n{name}",
  },
  {
    subject: 'You should apply to this',
    body: "Hi {friend},\n\nRemember {blank}? I'm building it, and I applied to Venn's fall batch to build it with other high schoolers doing the same. You should apply too: {link}\n\n{name}",
  },
  {
    subject: 'Thought of you for this',
    body: "Hey {friend}, quick one:\n\nVenn picks a small batch of high schoolers building things each season. I applied for F26 and thought of you right away. Here's my link: {link}\n\n{name}",
  },
];

// FNV-1a 32-bit over the lowercase trimmed code (UTF-16 code units), mod n. Stable forever.
export function variantIndex(refCode: string, n: number): number {
  const s = refCode.trim().toLowerCase();
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % n;
}

export const nextVariant = (i: number, n: number): number => (i + 1) % n;

// Replaces {key} for own keys of vars; unknown placeholders stay. Single pass, so values are never re-expanded.
export function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) =>
    Object.prototype.hasOwnProperty.call(vars, k) ? vars[k] : m);
}

// Mirrors the SQL check in submit_share and record_step (20261020120000_post_url_lnkd.sql); keep them equivalent.
// Accepts lnkd.in short links and the mobile / country-subdomain variants (m., uk., ...).
const POST_URL = /^(https?:\/\/)?((www|m|[a-z]{2})\.)?(linkedin\.com\/(posts|feed\/update|pulse|embed\/feed\/update|mwlite\/feed\/update)\/|lnkd\.in\/)[^\s]+$/i;
export const isLinkedInPostUrl = (s: string): boolean => POST_URL.test(s);

export function normalizePostUrl(s: string): string {
  const t = s.trim();
  return t && !/^https?:\/\//i.test(t) ? 'https://' + t : t;
}

export function timeLeft(dueIso: string, nowMs: number): { ms: number; text: string; over: boolean } {
  const due = Date.parse(dueIso);
  if (Number.isNaN(due)) return { ms: 0, text: '', over: false };
  const ms = due - nowMs;
  if (ms <= 0) return { ms, text: 'Time is up', over: true };
  const mins = Math.floor(ms / 60000);
  const h = Math.floor(mins / 60);
  const text = mins < 1 ? 'Under a minute left' : h < 1 ? `${mins}m left` : `${h}h ${mins % 60}m left`;
  return { ms, text, over: false };
}
