// Share copy and pickers for /refer (issue #22). Pure: no DOM, no storage, no network.
// Placeholders: {blank} {link} {friend} {name}. Every LinkedIn version keeps the exact sentence
// "I'm building {blank}." because the blank-swap code edits that line.

export { LINKEDIN_POSTS, SMS_TEXTS, VENN_LINKEDIN } from '../data/share-posts.ts';

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

// Mirrors the SQL check in submit_share (case-insensitive).
const POST_URL = /^(https?:\/\/)?(www\.)?linkedin\.com\/(posts|feed\/update)\/\S+$/i;
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

// sms: link that opens the phone's Messages app with a prefilled body. iOS wants "&body=", Android and others "?body=".
export const smsHref = (body: string, ua: string): string =>
  (/iPhone|iPad|iPod/.test(ua) ? 'sms:&body=' : 'sms:?body=') + encodeURIComponent(body);
