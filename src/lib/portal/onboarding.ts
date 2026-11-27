import type { SupabaseClient } from '@supabase/supabase-js';

// Student onboarding (#223): set password, profile + age route, org and phone consent, then the MOU for minors (#224).
export const CONTACT_CONSENT_TEXT =
  'A trusted Venn team member will use this number for cohort communication. WhatsApp is the main channel, so say yes if you can use it.';

export type AgeRoute = 'adult' | 'minor';

export const SIGNUP_TZ = 'America/Los_Angeles';
export const MIN_AGE = 12;
export const MAX_AGE = 25;

/** Calendar date of `at` in the Venn timezone, as y/m/d numbers. */
function localDate(at: Date): [number, number, number] {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: SIGNUP_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at).split('-').map(Number);
  return [p[0], p[1], p[2]];
}

/** Whole years between a birthday and `today` (the day of signing, America/Los_Angeles); null for a missing, malformed, impossible or future birthday. */
export function ageOn(birthday: string | null | undefined, today: Date = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(birthday ?? ''));
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  const [ty, tm, td] = localDate(today);
  if (Date.UTC(y, mo - 1, d) > Date.UTC(ty, tm - 1, td)) return null;
  return ty - y - (tm < mo || (tm === mo && td < d) ? 1 : 0);
}

/** 18 or older on `today` is an adult; a birthday that is invalid or puts the age outside 12-25 is null. */
export function ageRoute(birthday: string | null | undefined, today: Date = new Date()): AgeRoute | null {
  const age = ageOn(birthday, today);
  if (age === null || age < MIN_AGE || age > MAX_AGE) return null;
  return age >= 18 ? 'adult' : 'minor';
}

export type OnboardingState = { required: boolean; started?: boolean; profileDone: boolean; contactDone: boolean; minor: boolean; mouDone: boolean };
export type StepId = 'profile' | 'contact' | 'mou';

/** The step order lives here and nowhere else (#240): flip the array to move phone and WhatsApp before or after the MOU. */
export const ONBOARDING_ORDER: readonly StepId[] = ['profile']; // #240: org, phone, WhatsApp and the MOU come after the reveal (C2 owns that checklist)
export const STEP_PATH: Record<StepId, string> = { profile: '/portal/onboarding/profile', contact: '/portal/onboarding/contact', mou: '/portal/onboarding/mou' };

const stepDone = (id: StepId, s: OnboardingState): boolean =>
  id === 'profile' ? s.profileDone : id === 'contact' ? s.contactDone : !s.minor || s.mouDone;

/** Where the student goes next, or null when onboarding is finished, not required, or unknown (never block on a failed read). */
export function nextOnboardingPath(s: OnboardingState | null | undefined, order: readonly StepId[] = ONBOARDING_ORDER): string | null {
  if (!s || !s.required) return null;
  for (const id of order) if (!stepDone(id, s)) return STEP_PATH[id];
  return null;
}

type Fields = Record<string, unknown>;
const str = (v: unknown) => String(v ?? '').trim();

export type ProfileResult = { ok: true; name: string; location: string; birthday: string } | { ok: false; error: string };
export function validateProfile(f: Fields, today: Date = new Date()): ProfileResult {
  const name = str(f.name), location = str(f.location), birthday = str(f.birthday);
  if (!name || name.length > 200) return { ok: false, error: 'Enter your full name.' };
  if (!location || location.length > 200) return { ok: false, error: 'Enter where you live, like a city and country.' };
  if (!ageRoute(birthday, today)) return { ok: false, error: 'Enter a valid birthday.' };
  return { ok: true, name, location, birthday };
}

export type ContactResult = { ok: true; orgOk: boolean; orgCorrection: string; phone: string; whatsapp: boolean } | { ok: false; error: string };
export function validateContact(f: Fields): ContactResult {
  const org = str(f.orgOk);
  if (org !== 'yes' && org !== 'no') return { ok: false, error: 'Tell us whether this is your organization.' };
  const orgCorrection = str(f.orgCorrection).slice(0, 300);
  if (org === 'no' && !orgCorrection) return { ok: false, error: 'Tell us your organization.' };
  const phone = str(f.phone).replace(/[\s().-]/g, '');
  if (!/^\+[1-9][0-9]{7,14}$/.test(phone)) return { ok: false, error: 'Enter your phone number with its country code, like +14155550123.' };
  const wa = str(f.whatsapp);
  if (wa !== 'yes' && wa !== 'no') return { ok: false, error: 'Tell us whether you use WhatsApp.' };
  if (!str(f.consent)) return { ok: false, error: 'Tick the box to agree.' };
  return { ok: true, orgOk: org === 'yes', orgCorrection: org === 'yes' ? '' : orgCorrection, phone, whatsapp: wa === 'yes' };
}

export type OnboardingView = OnboardingState & { name: string; org: string };

/** The caller's onboarding state through the RPC; null on any failure so a read error never traps a student. */
export async function getOnboarding(sb: Pick<SupabaseClient, 'rpc'>): Promise<OnboardingView | null> {
  try {
    const { data, error } = await sb.rpc('get_onboarding');
    if (error || !data) return null;
    const d = data as Record<string, unknown>;
    return { required: d.required === true, started: d.started === true, profileDone: d.profile_done === true, contactDone: d.contact_done === true, minor: d.minor === true, mouDone: d.mou_done === true, name: String(d.name ?? ''), org: String(d.org ?? '') };
  } catch { return null; }
}

/** The one call portal home makes: a redirect path while onboarding is unfinished, else null. */
export async function onboardingRedirect(sb: Pick<SupabaseClient, 'rpc'>): Promise<string | null> {
  return nextOnboardingPath(await getOnboarding(sb));
}
