export type MouErrorKind = 'full' | 'signed' | 'not_owner' | 'invalid' | 'retry';

export const MOU_COPY = {
  heading: 'Sign your MOU',
  nameLabel: 'Full name',
  agreeLabel: 'I have read the MOU and agree to it.',
  sign: 'Sign',
  signing: 'Signing',
  signedAs: (name: string, when: string) => `Signed by ${name} on ${when}.`,
  leadSigns: 'Your lead signs the MOU for your team.',
  full: 'This cohort is full for now. We will email you the moment a seat opens.',
  orgs: (n: number) => (n === 1 ? '1 org in this cohort' : `${n} orgs in this cohort`),
  errors: {
    full: 'This cohort filled up before your team could sign. We will email you if a seat opens.',
    signed: 'This MOU is already signed.',
    not_owner: 'Only your lead can sign for your team.',
    invalid: 'Please type your full name and tick the box.',
    retry: 'That did not go through. Please try again.',
  } as Record<MouErrorKind, string>,
};

/** Trim the typed name; Sign needs a non-blank name and the agree box. */
export function validateMou(name: unknown, agreed: unknown): { ok: true; name: string } | { ok: false } {
  const n = typeof name === 'string' ? name.trim() : '';
  return n && agreed === true ? { ok: true, name: n } : { ok: false };
}

/** Postgres codes raised by sign_mou (#116). */
export function mapMouError(code?: string | null): MouErrorKind {
  if (code === '53400') return 'full';
  if (code === '23505') return 'signed';
  if (code === '42501') return 'not_owner';
  if (code === '22023') return 'invalid';
  return 'retry';
}

/** Cohort media must be https; anything else is dropped. */
export function safeHttps(u: unknown): string | null {
  if (typeof u !== 'string') return null;
  try { return new URL(u).protocol === 'https:' ? u : null; } catch { return null; }
}


export type CohortMode = 'sign' | 'signed' | 'member' | 'full';

/** One mode per viewer: a signature wins, then non-leads wait for their lead, then a full cohort, else the form. */
export function mouMode(view: { signature: unknown; isLead: boolean } | null | undefined, full = false): CohortMode {
  if (view?.signature) return 'signed';
  if (view && !view.isLead) return 'member';
  return full ? 'full' : 'sign';
}

/** "Nov 18, 2026" in UTC so server and browser agree; the raw string when it is not a date. */
export function formatSigned(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

/** Public Supabase storage URL for a cohort logo; an https URL passes through, anything else is null. */
export function logoUrl(path: unknown, base: unknown): string | null {
  if (typeof path !== 'string' || !path.trim()) return null;
  if (/^https?:/i.test(path)) return safeHttps(path);
  if (typeof base !== 'string' || !base) return null;
  const clean = path.replace(/^\/+/, '');
  if (clean.split('/').includes('..')) return null;
  return `${base.replace(/\/+$/, '')}/storage/v1/object/public/cohort-logos/${clean}`;
}

export const COHORT_COPY = {
  heading: 'Your cohort',
  mouHeading: 'Your MOU',
  goal: 'Goal',
  criteria: 'What we look for',
  timeline: 'Timeline',
  watch: 'Watch the intro',
  slides: 'See the slides',
  logoAlt: (company: string) => `${company} logo`,
};

/** A short plain-language MOU draft, one paragraph per entry. */
export const MOU_TEXT: string[] = [
  'This is a handshake on paper. By signing, your org says yes to joining this cohort for the Fall 2026 season, and Venn says yes to making it worth your time.',
  'Your org agrees to show up: to take part in the cohort sessions, to work on the goal above with real effort, and to tell us early if something gets in the way.',
  'Your org agrees to be a good neighbor: to share what you learn with the other orgs in the cohort, to treat their ideas and information with care, and to keep private anything they mark as private.',
  'Venn agrees to do its part: to run the cohort, to connect you with the people and resources it promises, and to be honest and quick when plans change.',
  'This is not a legal contract and costs nothing. Either side can step away with a kind word, and nothing here changes who owns your work. You are signing for your whole team, so please check with them first.',
];
