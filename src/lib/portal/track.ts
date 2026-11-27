export const STEPS = ['link_opened', 'password_set', 'profile_saved', 'org_confirmed', 'phone_saved', 'mou_signed', 'parent_signed',
  'reveal_started', 'reveal_finished', 'share_tapped', 'share_done', 'linkedin_opened', 'next_steps_opened', 'mentor_compose_opened'] as const;
export type Step = (typeof STEPS)[number];

/** Client beat: fire and forget, never blocks a tap and never throws. */
export function track(step: Step): void {
  try { navigator.sendBeacon('/portal/api/event', new Blob([JSON.stringify({ step })], { type: 'application/json' })); } catch { /* no beacon, no beat */ }
}
