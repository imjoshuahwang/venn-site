// /portal home reads. Both are independent, so they start together (one round trip of latency, not two).
import type { CeremonyData } from './ceremony-data.ts';

type Deps = {
  ceremony: () => Promise<CeremonyData>;
  consent: () => Promise<{ data: { application?: unknown; done?: boolean } | null; error: unknown }>;
};

export async function loadHome({ ceremony, consent }: Deps) {
  const [c, k] = await Promise.all([
    ceremony(),
    consent().then((r) => ({ r, threw: false }), () => ({ r: null, threw: true })),
  ]);
  // A missing or failing consent_state must be visible, never a silent skip of the consent redirect.
  const consentFailed = k.threw || !!k.r?.error || !k.r?.data;
  const redirectToConsent = !consentFailed && !!k.r?.data?.application && k.r.data.done === false;
  return { ceremony: c, consentFailed, redirectToConsent };
}
