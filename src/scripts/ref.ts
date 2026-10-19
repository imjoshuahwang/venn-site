// Referral code. Precedence: valid localStorage ref (first referrer, 30 days) > URL ?ref= > sessionStorage ref.
// The first ref wins: a different ?ref= never overwrites an unexpired stored one, and getRef returns the stored one.
// sessionStorage stays as a fallback (reload, blocked localStorage). Every storage access is guarded; never throws.
const KEY = 'venn_ref';
const TTL = 30 * 24 * 60 * 60 * 1000;
const clean = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40);

function readStored(): string {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return '';
    try {
      const v = JSON.parse(raw);
      const ref = clean(typeof v?.ref === 'string' ? v.ref : '');
      if (ref && typeof v.at === 'number' && Date.now() - v.at >= 0 && Date.now() - v.at < TTL) return ref;
    } catch {}
    localStorage.removeItem(KEY); // expired or malformed
  } catch {}
  return '';
}

// Safe on every page load: stores a first-touch ?ref= and returns the ref in effect.
export function captureRef(): string {
  let url = '';
  try { url = clean(new URLSearchParams(location.search).get('ref') ?? ''); } catch {}
  const stored = readStored();
  const ref = stored || url;
  if (!stored && url) {
    try { localStorage.setItem(KEY, JSON.stringify({ ref: url, at: Date.now() })); } catch {}
  }
  try {
    if (ref) sessionStorage.setItem(KEY, ref);
    else return clean(sessionStorage.getItem(KEY) ?? '');
  } catch {}
  return ref;
}

export const getRef = captureRef;

export function clearRef(): void {
  try { localStorage.removeItem(KEY); } catch {}
  try { sessionStorage.removeItem(KEY); } catch {}
}
