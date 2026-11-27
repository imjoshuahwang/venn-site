// Pure checks for the under-18 MOU step (#224). The database re-checks everything; these give the page fast, calm errors.
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
export const MAX_SIG_BYTES = 200_000;

export function emailKey(e: string): string {
  const [local = '', domain = ''] = e.trim().toLowerCase().split('@');
  return `${local.split('+')[0]}@${domain}`;
}

/** The parent must be a different person's address than the student's own (+tags ignored). */
export function parentEmailDiffers(student: string, parent: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parent.trim()) && emailKey(student) !== emailKey(parent);
}

export type SignBody = { role: 'minor' | 'parent'; png: string; parentName?: string };

/** Returns the clean body, or null when it is not a well-formed signature request. */
export function parseSignBody(b: unknown): SignBody | null {
  const o = b as Record<string, unknown> | null;
  if (!o || (o.role !== 'minor' && o.role !== 'parent') || typeof o.png !== 'string') return null;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(o.png) || o.png.length > MAX_SIG_BYTES * 2) return null;
  const head = Buffer.from(o.png.slice(0, 16), 'base64');
  if (!PNG.every((v, i) => head[i] === v)) return null;
  const parentName = typeof o.parentName === 'string' ? o.parentName.trim() : undefined;
  if (o.role === 'parent' && (!parentName || parentName.length < 2 || parentName.length > 120)) return null;
  return { role: o.role, png: o.png, parentName };
}
