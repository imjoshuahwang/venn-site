import test from 'node:test';
import assert from 'node:assert/strict';
import { ageOn, ageRoute, nextOnboardingPath, validateProfile, validateContact, CONTACT_CONSENT_TEXT, type OnboardingState } from './onboarding.ts';

const today = new Date('2026-11-27T15:00:00Z');

test('age edges in America/Los_Angeles: 17y364d is a minor, 18y0d is an adult', () => {
  // 2026-11-27 15:00Z is 07:00 in Los Angeles on the 27th.
  assert.equal(ageOn('2008-11-28', today), 17);
  assert.equal(ageRoute('2008-11-28', today), 'minor');
  assert.equal(ageOn('2008-11-27', today), 18);
  assert.equal(ageRoute('2008-11-27', today), 'adult');
  // 03:00Z on the 28th is still the 27th in Los Angeles, so a 2008-11-28 birthday has not turned 18 yet.
  assert.equal(ageRoute('2008-11-28', new Date('2026-11-28T03:00:00Z')), 'minor');
  assert.equal(ageRoute('2008-11-28', new Date('2026-11-28T08:30:00Z')), 'adult');
});
test('birthdays outside age 12-25 are rejected', () => {
  assert.equal(ageRoute('2014-11-27', today), 'minor'); // exactly 12
  assert.equal(ageRoute('2014-11-28', today), null); // 11y364d
  assert.equal(ageRoute('2000-11-27', today), null); // exactly 26 is out, 25y364d is in
  assert.equal(ageRoute('2000-11-28', today), 'adult');
  assert.equal(ageRoute('2000-11-26', today), null);
  assert.equal(ageRoute('2026-11-28', today), null);
});

test('ageRoute: turns 18 today is an adult, turns 18 tomorrow is a minor', () => {
  assert.equal(ageRoute('2008-11-27', today), 'adult');
  assert.equal(ageRoute('2008-11-28', today), 'minor');
  assert.equal(ageRoute('2008-11-26', today), 'adult');
  assert.equal(ageRoute('2012-01-01', today), 'minor');
});
test('ageRoute: missing, malformed, future or impossible birthdays are rejected', () => {
  for (const b of [undefined, null, '', 'nope', '2008-13-01', '2008-02-30', '2027-01-01', '1890-01-01', '11/27/2008']) assert.equal(ageRoute(b as never, today), null, String(b));
});

const FULL = ['profile', 'contact', 'mou'] as const;
const base: OnboardingState = { required: true, profileDone: false, contactDone: false, minor: false, mouDone: false };
test('default order stops after the profile: contact and MOU come after the reveal', () => {
  assert.equal(nextOnboardingPath({ required: true, profileDone: true, contactDone: false, minor: true, mouDone: false }), '/portal/mou/minor');
  assert.equal(nextOnboardingPath({ required: true, profileDone: false, contactDone: false, minor: false, mouDone: false }), '/portal/onboarding/profile');
});
test('nextOnboardingPath walks profile, contact, then the MOU for minors only', () => {
  assert.equal(nextOnboardingPath(base, FULL), '/portal/onboarding/profile');
  assert.equal(nextOnboardingPath({ ...base, profileDone: true }, FULL), '/portal/onboarding/contact');
  assert.equal(nextOnboardingPath({ ...base, profileDone: true, contactDone: true }, FULL), null);
  assert.equal(nextOnboardingPath({ ...base, profileDone: true, contactDone: true, minor: true }, FULL), '/portal/mou/minor');
  assert.equal(nextOnboardingPath({ ...base, profileDone: true, contactDone: true, minor: true, mouDone: true }, FULL), null);
});
test('nextOnboardingPath stays out of the way when onboarding is not required or state is unknown', () => {
  assert.equal(nextOnboardingPath({ ...base, required: false }, FULL), null);
  assert.equal(nextOnboardingPath(null), null);
});

test('validateProfile needs name, location and a valid birthday', () => {
  assert.deepEqual(validateProfile({ name: ' Ada Lovelace ', location: 'Lagos, Nigeria', birthday: '2001-05-05' }, today), { ok: true, name: 'Ada Lovelace', location: 'Lagos, Nigeria', birthday: '2001-05-05' });
  for (const bad of [{ name: '', location: 'x', birthday: '2001-05-05' }, { name: 'A', location: '', birthday: '2001-05-05' }, { name: 'A', location: 'x', birthday: '' }]) assert.equal(validateProfile(bad, today).ok, false);
});
test('validateContact accepts +44, +91 and a spaced US number', () => {
  const ok = { orgOk: 'yes', whatsapp: 'no', consent: 'on' };
  for (const [raw, e164] of [['+44 7700 900123', '+447700900123'], ['+91 98765 43210', '+919876543210'], ['+1 415 555 0123', '+14155550123']]) assert.equal((validateContact({ ...ok, phone: raw }) as any).phone, e164);
});
test('validateContact requires phone, a WhatsApp yes/no and consent, and a correction when the org is not theirs', () => {
  const ok = { orgOk: 'yes', orgCorrection: '', phone: '+1 (415) 555-0123', whatsapp: 'yes', consent: 'on' };
  assert.deepEqual(validateContact(ok), { ok: true, orgOk: true, orgCorrection: '', phone: '+14155550123', whatsapp: true });
  assert.equal(validateContact({ ...ok, whatsapp: 'no' }).ok && (validateContact({ ...ok, whatsapp: 'no' }) as { whatsapp: boolean }).whatsapp, false);
  for (const bad of [{ ...ok, phone: '' }, { ...ok, phone: '12345' }, { ...ok, phone: '+1234567' }, { ...ok, whatsapp: '' }, { ...ok, consent: '' }, { ...ok, orgOk: '' }]) assert.equal(validateContact(bad).ok, false);
  assert.equal(validateContact({ ...ok, orgOk: 'no', orgCorrection: 'Chess Club' }).ok, true);
});
test('consent copy names a trusted Venn team member and WhatsApp as the main channel', () => {
  assert.match(CONTACT_CONSENT_TEXT, /trusted Venn team member/);
  assert.match(CONTACT_CONSENT_TEXT, /cohort communication/);
  assert.match(CONTACT_CONSENT_TEXT, /WhatsApp is the main channel/);
});

test('step order comes from the config array and can flip', () => {
  const s: OnboardingState = { required: true, profileDone: true, contactDone: false, minor: true, mouDone: false };
  assert.equal(nextOnboardingPath(s, ['profile', 'contact', 'mou']), '/portal/onboarding/contact');
  assert.equal(nextOnboardingPath(s, ['profile', 'mou', 'contact']), '/portal/mou/minor');
  assert.equal(nextOnboardingPath({ ...s, mouDone: true }, ['profile', 'mou', 'contact']), '/portal/onboarding/contact');
});
