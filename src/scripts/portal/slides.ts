// Cohort slideshow (#133): slides are built only from cohorts row fields; a missing field drops its slide.
export type Slide = { id: 'partner' | 'goal' | 'timeline'; title: string; body: string; logo?: string | null };

export const SLIDE_COPY = { partner: 'Your partner', goal: 'The goal', timeline: 'The timeline', prev: 'Previous slide', next: 'Next slide', region: 'Cohort slides', counter: (i: number, n: number) => `${i} of ${n}` };

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

export function buildSlides(row: { company?: unknown; name?: unknown; goal?: unknown; timeline?: unknown } | null | undefined, logo?: string | null): Slide[] {
  const out: Slide[] = [];
  const partner = text(row?.company) ?? text(row?.name);
  if (partner || logo) out.push({ id: 'partner', title: SLIDE_COPY.partner, body: partner ?? '', logo: logo ?? null });
  const goal = text(row?.goal);
  if (goal) out.push({ id: 'goal', title: SLIDE_COPY.goal, body: goal });
  const timeline = text(row?.timeline);
  if (timeline) out.push({ id: 'timeline', title: SLIDE_COPY.timeline, body: timeline });
  return out;
}

/** Index after an arrow key or button, clamped to the deck. */
export function stepIndex(i: number, n: number, dir: 1 | -1): number {
  return Math.max(0, Math.min(n - 1, i + dir));
}
