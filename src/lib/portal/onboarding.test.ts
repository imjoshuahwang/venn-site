import test from 'node:test';
import assert from 'node:assert/strict';
import { ageRoute, nextOnboardingPath, validateProfile, validateContact, CONTACT_CONSENT_TEXT, type OnboardingState } from './onboarding.ts';

const today = new Date('2026-11-27T15:00:00Z');

test('ageRoute: turns 18 today is an adult, turns 18 tomorrow is a minor', () => {
  assert.equal(ageRoute('2008-11-27', today), 'adult');
  assert.equal(ageRoute('2008-11-28', today), 'minor');
  assert.equal(ageRoute('2008-11-26', today), 'adult');
  assert.equal(ageRoute('2012-01-01', today), 'minor');
});
test('ageRoute: missing, malformed, future or impossible birthdays are rejected', () => {
  for (const b of [undefined, null, '', 'nope', '2008-13-01', '2008-02-30', '2027-01-01', '1890-01-01', '11/27/2008']) assert.equal(ageRoute(b as never, today), null, String(b));
});

const base: OnboardingState = { required: true, profileDone: false, contactDone: false, minor: false, mouDone: false };
test('nextOnboardingPath walks profile, contact, then the MOU for minors only', () => {
  assert.equal(nextOnboardingPath(base), '/portal/onboarding/profile');
  assert.equal(nextOnboardingPath({ ...base, profileDone: true }), '/portal/onboarding/contact');
  assert.equal(nextOnboardingPath({ ...base, profileDone: true, contactDone: true }), null);
  assert.equal(nextOnboardingPath({ ...base, profileDone: true, contactDone: true, minor: true }), '/portal/onboarding/mou');
  assert.equal(nextOnboardingPath({ ...base, profileDone: true, contactDone: true, minor: true, mouDone: true }), null);
});
test('nextOnboardingPath stays out of the way when onboarding is not required or state is unknown', () => {
  assert.equal(nextOnboardingPath({ ...base, required: false }), null);
  assert.equal(nextOnboardingPath(null), null);
});

test('validateProfile needs name, location and a valid birthday', () => {
  assert.deepEqual(validateProfile({ name: ' Ada Lovelace ', location: 'Lagos, Nigeria', birthday: '2000-05-05' }, today), { ok: true, name: 'Ada Lovelace', location: 'Lagos, Nigeria', birthday: '2000-05-05' });
  for (const bad of [{ name: '', location: 'x', birthday: '2000-05-05' }, { name: 'A', location: '', birthday: '2000-05-05' }, { name: 'A', location: 'x', birthday: '' }]) assert.equal(validateProfile(bad, today).ok, false);
});
test('validateContact requires phone, a WhatsApp yes/no and consent, and a correction when the org is not theirs', () => {
  const ok = { orgOk: 'yes', orgCorrection: '', phone: '+1 (415) 555-0123', whatsapp: 'yes', consent: 'on' };
  assert.deepEqual(validateContact(ok), { ok: true, orgOk: true, orgCorrection: '', phone: '+14155550123', whatsapp: true });
  assert.equal(validateContact({ ...ok, whatsapp: 'no' }).ok && (validateContact({ ...ok, whatsapp: 'no' }) as { whatsapp: boolean }).whatsapp, false);
  for (const bad of [{ ...ok, phone: '' }, { ...ok, phone: '12345' }, { ...ok, whatsapp: '' }, { ...ok, consent: '' }, { ...ok, orgOk: '' }]) assert.equal(validateContact(bad).ok, false);
  assert.equal(validateContact({ ...ok, orgOk: 'no', orgCorrection: 'Chess Club' }).ok, true);
});
test('consent copy names a trusted Venn team member and WhatsApp as the main channel', () => {
  assert.match(CONTACT_CONSENT_TEXT, /trusted Venn team member/);
  assert.match(CONTACT_CONSENT_TEXT, /cohort communication/);
  assert.match(CONTACT_CONSENT_TEXT, /WhatsApp is the main channel/);
});
