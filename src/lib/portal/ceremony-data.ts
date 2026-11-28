// The one adapter between the ceremony and Supabase. RPCs from #116 are called by name; PORTAL_STUB swaps in fixtures.
export type Outcome = 'cohort' | 'peer' | 'network_waitlist' | 'track_waitlist' | 'not_this_season';
export type CeremonyResult = { id: number; outcome: Outcome; letter: string; viewedAt: string | null; doneAt: string | null; cohortName?: string | null; cohorts?: { slug: string; name: string; seatCap?: number | null }[] };
export type CeremonyData = { status: 'ok'; result: CeremonyResult } | { status: 'none' } | { status: 'error' };

import { getMyResult, markViewed, finishCeremony } from './api.ts';

const env = (k: string): string | undefined => import.meta.env?.[k] ?? process.env[k];
const STUBS = ['cohort', 'peer', 'network_waitlist', 'track_waitlist', 'not_this_season', 'none', 'error'];

/** Stub mode: PORTAL_STUB=cohort|peer|network_waitlist|track_waitlist|not_this_season|none|error. Local dev only; never on any deploy. */
export function stubMode(opts: { dev?: boolean } = { dev: !!import.meta.env?.DEV }): string | null {
  const s = env('PORTAL_STUB');
  return opts.dev && s && STUBS.includes(s) ? s : null;
}

const LETTERS: Record<Outcome, string> = {
  cohort: "You are in.\n\nYou are one of the students we picked for a Fall '26 cohort, because the way you described what you want to build is exactly what a small group of ambitious people needs around the table.\n\nWe will email your cohort details soon, and until then there is nothing you need to do except be excited.",
  peer: "You are in.\n\nWe matched you with a peer for Fall '26, because the two of you want to build toward the same kind of thing and would sharpen each other.\n\nWe will introduce you to each other soon, and you will hear from us before then.",
  network_waitlist: "You are on our waitlist.\n\nWe loved your application and the Fall '26 seats filled before we could reach everyone we wanted to.\n\nYou are in the Venn network now, and we will write to you the moment a seat opens.",
  track_waitlist: "You are on our waitlist.\n\nYour track is full for Fall '26, and we would rather hold your place than lose you.\n\nWe will write to you the moment a seat opens up.",
  not_this_season: "Not this season.\n\nWe could not offer you a Fall '26 seat, and we know that is not what you hoped to read.\n\nWe would love to see you apply again, and you can write to contact@joinvenn.org any time you want to talk it through.",
};

export function fixture(kind: string, done: boolean): CeremonyData {
  if (kind === 'none') return { status: 'none' };
  if (kind === 'error') return { status: 'error' };
  const outcome = kind as Outcome;
  return { status: 'ok', result: { id: 1, outcome, letter: LETTERS[outcome], viewedAt: null, doneAt: done ? new Date().toISOString() : null, cohortName: outcome === 'cohort' ? 'Fall Cohort' : null } };
}

type Ctx = { locals: App.Locals; cookies: import('astro').AstroCookies };

export async function getCeremonyData(Astro: Ctx): Promise<CeremonyData> {
  const stub = stubMode();
  if (stub) return fixture(stub, Astro.cookies.get('portal_stub_done')?.value === '1');
  try {
    const { data: r, error } = await getMyResult(Astro.locals.supabase);
    if (error) return { status: 'error' };
    if (!r) return { status: 'none' };
    return { status: 'ok', result: { id: r.id, outcome: r.outcome, letter: r.letter || LETTERS[r.outcome], viewedAt: r.viewed_at, doneAt: r.ceremony_done_at, cohortName: r.cohort?.name ?? null, cohorts: ((r as { cohorts?: { slug: string; name: string; seatCap?: number | null }[] }).cohorts ?? (r.cohort ? [r.cohort] : [])).map((x) => ({ slug: x.slug, name: x.name, seatCap: (x as { seat_cap?: number | null }).seat_cap ?? null })) } };
  } catch {
    return { status: 'error' };
  }
}

/** `action` is a ceremony beat the client reports; each maps to one RPC by name. */
export async function callCeremonyRpc(Astro: Ctx, action: 'viewed' | 'finish', id: number): Promise<boolean> {
  if (stubMode()) {
    if (action === 'finish') Astro.cookies.set('portal_stub_done', '1', { path: '/', sameSite: 'lax' });
    return true;
  }
  const { error } = await (action === 'viewed' ? markViewed : finishCeremony)(Astro.locals.supabase, id);
  return !error;
}
