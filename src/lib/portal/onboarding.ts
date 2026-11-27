import type { SupabaseClient } from '@supabase/supabase-js';

// Student onboarding (#223): set password, profile + age route, org and phone consent, then the MOU for minors (#224).
export const CONTACT_CONSENT_TEXT =
  'A trusted Venn team member will use this number for cohort communication. WhatsApp is the main channel, so say yes if you can use it.';

export type AgeRoute = 'adult' | 'minor';

/** 18 or older on `today` (UTC date) is an adult; a missing, malformed, future or implausible birthday is null. */
export function ageRoute(birthday: string | null | undefined, today: Date = new Date()): AgeRoute | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(birthday ?? ''));
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  const t = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  if (dt.getTime() > t || y < 1900) return null;
  return Date.UTC(y + 18, mo - 1, d) <= t ? 'adult' : 'minor';
}

export type OnboardingState = { required: boolean; profileDone: boolean; contactDone: boolean; minor: boolean; mouDone: boolean };

/** Where the student goes next, or null when onboarding is finished, not required, or unknown (never block on a failed read). */
export function nextOnboardingPath(s: OnboardingState | null | undefined): string | null {
  if (!s || !s.required) return null;
  if (!s.profileDone) return '/portal/onboarding/profile';
  if (!s.contactDone) return '/portal/onboarding/contact';
  if (s.minor && !s.mouDone) return '/portal/onboarding/mou';
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
  if (!/^\+[1-9][0-9]{6,14}$/.test(phone)) return { ok: false, error: 'Enter your phone number with its country code, like +14155550123.' };
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
    return { required: d.required === true, profileDone: d.profile_done === true, contactDone: d.contact_done === true, minor: d.minor === true, mouDone: d.mou_done === true, name: String(d.name ?? ''), org: String(d.org ?? '') };
  } catch { return null; }
}

/** The one call portal home makes: a redirect path while onboarding is unfinished, else null. */
export async function onboardingRedirect(sb: Pick<SupabaseClient, 'rpc'>): Promise<string | null> {
  return nextOnboardingPath(await getOnboarding(sb));
}
