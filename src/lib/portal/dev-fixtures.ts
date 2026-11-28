// Dev gallery (#314): every fixture the /portal/dev index and the dev `?stub=` branches use. Pure data, no imports.
export const STUB_EMAIL = 'maya@example.com';

const fail = 'We could not save that. Please try again.';
export const devError = (stub: string | null | undefined) => (stub === 'error' ? fail : '');

export const consentFixture = (stub: string | null) => ({ answers: {}, minor: stub === 'minor', done: false, application: true });

// MouMinor steps: minor (nothing signed), parent (minor signed), confirm (both signed).
export const minorMouFixture = (stub: string | null) => ({
  minor: true, confirmed: false, minor_signed: stub === 'parent' || stub === 'confirm', parent_signed: stub === 'confirm', parent_link_signed: false, parent_name: stub === 'confirm' ? 'Ana Okafor' : null,
});

// Team rows as get_my_team returns them: lead (empty), full (lead with 3), member (non-lead).
export function teamFixture(stub: string | null) {
  const m = (id: number, email: string, state: string, lead = true) => ({ member_id: id, email, state, is_me: false, lead_is_me: lead });
  if (stub === 'full') return [m(1, 'sam@example.com', 'Joined'), m(2, 'lee@example.com', 'Invited'), m(3, 'kai@example.com', 'Joined')];
  if (stub === 'member') return [{ ...m(1, STUB_EMAIL, 'Joined', false), is_me: true }, m(2, 'sam@example.com', 'Joined', false)];
  return [{ member_id: null, email: STUB_EMAIL, state: '', is_me: true, lead_is_me: true }];
}

export const EMAILS = ['results-ready', 'results-not-this-season', 'invite', 'magic-link', 'recovery', 'status-update', 'match-request', 'match-reminder', 'match-intro', 'match-declined', 'match-expired', 'confirmation', 'parent-consent'];

const cb = '/portal/auth/callback?token_hash=fixturetoken1234';
// The index: one label per screen state. Every href must resolve to a route (dev-gallery.test.ts).
export const GALLERY: [string, string][] = [
  ['Slide deck sample', '/portal/dev/deck'],
  ['Sign in', '/portal/login'], ['Sign in error', '/portal/login?stub=error'],
  ['Reset password', '/portal/reset'], ['Reset link expired', '/portal/reset?expired=1'],
  ['Resend link', '/portal/resend'], ['Link expired', '/portal/resend?expired=1'],
  ['Continue to set password', `${cb}&type=invite&next=/portal/set-password`], ['Continue to result', `${cb}&type=magiclink&next=/portal/result`], ['Continue to match', `${cb}&type=magiclink&next=/portal/match`],
  ['Set password', '/portal/set-password?stub=1'], ['Set password error', '/portal/set-password?stub=error'],
  ['Onboarding name', '/portal/onboarding/profile?stub=1'], ['Onboarding name error', '/portal/onboarding/profile?stub=error'],
  ['Onboarding contact', '/portal/onboarding/contact?stub=1'], ['Onboarding contact error', '/portal/onboarding/contact?stub=error'],
  ['Onboarding MOU', '/portal/mou/minor?stub=1'],
  ['Minor MOU: student signs', '/portal/mou/minor?stub=minor'], ['Minor MOU: parent signs', '/portal/mou/minor?stub=parent'], ['Minor MOU: confirm', '/portal/mou/minor?stub=confirm'],
  ['Parent co-sign', '/portal/dev/parent?state=ok'], ['Parent co-sign used', '/portal/dev/parent?state=used'], ['Parent co-sign expired', '/portal/dev/parent?state=expired'],
  ['Consent', '/portal/consent?stub=adult'], ['Consent under 18', '/portal/consent?stub=minor'], ['Ceremony consent', '/portal/ceremony?stub=adult'],
  ['Home ceremony: cohort', '/portal?stub=cohort'], ['Home ceremony: peer', '/portal?stub=peer'], ['Home ceremony: waitlist', '/portal?stub=network_waitlist'], ['Home ceremony: track waitlist', '/portal?stub=track_waitlist'], ['Home ceremony: not this season', '/portal?stub=not_this_season'],
  ['Home after reveal', '/portal?stub=cohort&done=1'], ['Home after reveal: waitlist', '/portal?stub=network_waitlist&done=1'], ['Home no result', '/portal?stub=none'], ['Home error', '/portal?stub=error'],
  ['Reveal AWS', '/portal/result?stub=cohort'], ['Reveal Quadron', '/portal/result?stub=cohort&partner=quadron'], ['Reveal unknown cohort', '/portal/result?stub=cohort&partner=other'],
  ['Reveal AWS under 18', '/portal/result?stub=cohort&birthday=2011-05-01'], ['Reveal AWS 18+', '/portal/result?stub=cohort&birthday=2000-05-01'],
  ['Result waitlist', '/portal/result?stub=network_waitlist'], ['Result track waitlist', '/portal/result?stub=track_waitlist'], ['Result not this season', '/portal/result?stub=not_this_season'],
  ['Cohort unsigned', '/portal/dev/result?outcome=cohort'], ['Cohort signed', '/portal/dev/result?outcome=cohort&state=signed'], ['Cohort full', '/portal/dev/result?outcome=cohort&state=full'],
  ['Cohort missing fields', '/portal/dev/result?outcome=cohort&state=null'], ['Cohort member', '/portal/dev/result?outcome=cohort&state=member'], ['Cohort no answers', '/portal/dev/result?outcome=cohort&state=empty-answers'],
  ['Cohort AWS deck', '/portal/dev/result?outcome=cohort&cohort=aws'], ['Cohort Quadron deck', '/portal/dev/result?outcome=cohort&cohort=quadron'],
  ['Peer', '/portal/dev/result?outcome=peer'], ['Peer waiting', '/portal/dev/result?outcome=peer&state=waiting'], ['Peer both down', '/portal/dev/result?outcome=peer&state=both-down'], ['Peer none', '/portal/dev/result?outcome=peer&state=empty'],
  ['Waitlist', '/portal/dev/result?outcome=network_waitlist'], ['Track waitlist', '/portal/dev/result?outcome=track_waitlist'], ['Not this season', '/portal/dev/result?outcome=not_this_season'], ['No letter', '/portal/dev/result?outcome=network_waitlist&state=empty'],
  ['Result loading', '/portal/dev/result?state=loading'], ['Result error', '/portal/dev/result?state=error'],
  ['Next steps', '/portal/next-steps?stub=1'], ['Next steps AWS', '/portal/next-steps?stub=1&partner=aws'], ['Next steps Quadron', '/portal/next-steps?stub=1&partner=quadron'],
  ['Team', '/portal/team?stub=lead'], ['Team full', '/portal/team?stub=full'], ['Team member', '/portal/team?stub=member'], ['Team added', '/portal/team?stub=lead&added=1'], ['Team error', '/portal/team?stub=error'],
  ['Match unmatched', '/portal/match?stub=unmatched'], ['Match reveal', '/portal/match?stub=first'], ['Match card', '/portal/match?stub=replay'], ['Match invited', '/portal/match?stub=invited'],
  ['Match sent', '/portal/match?stub=requested'], ['Match said yes', '/portal/match?stub=accepted'], ['Match declined', '/portal/match?stub=declined'], ['Match no reply', '/portal/match?stub=expired'],
  ['Next cohort open', '/next/fixture-open'], ['Next cohort done', '/next/fixture-done'], ['Next cohort expired', '/next/fixture-expired'], ['Next cohort unknown', '/next/fixture-unknown'],
  ['Intro open', '/intro/fixture-open'], ['Intro accepted', '/intro/fixture-accepted'], ['Intro declined', '/intro/fixture-declined'], ['Intro expired', '/intro/fixture-expired'], ['Intro unknown', '/intro/fixture-unknown'],
  ...EMAILS.map((e): [string, string] => [`Email ${e}`, `/portal/dev/email/${e}`]),
];
