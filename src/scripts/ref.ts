// Referral code from ?ref=, kept in sessionStorage so a reload (or a step away from the URL) keeps it.
const KEY = 'venn_ref';
const clean = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40);

export function getRef(): string {
  let ref = '';
  try { ref = clean(new URLSearchParams(location.search).get('ref') ?? ''); } catch {}
  try {
    if (ref) sessionStorage.setItem(KEY, ref);
    else ref = clean(sessionStorage.getItem(KEY) ?? '');
  } catch {}
  return ref;
}
