// Guiding questions (#133): the 3 universal ids, their copy, and the shared validation + error map.
export const GUIDING_IDS = ['goal', 'skills', 'availability'] as const;
export type GuidingId = (typeof GUIDING_IDS)[number];
export const GUIDING_MAX = 1000;

export const GUIDING_QUESTIONS: { id: GuidingId; label: string }[] = [
  { id: 'goal', label: 'What do you most want to get out of this cohort?' },
  { id: 'skills', label: 'Which skills can you bring to your team, and which do you want to grow?' },
  { id: 'availability', label: 'When are you free to work on this each week?' },
];

export type GuidingAnswers = Partial<Record<GuidingId, string>>;

/** Returns trimmed answers for known ids, or an error code. At least one answer is required. */
export function validateGuiding(input: unknown): { ok: true; answers: Record<string, string> } | { ok: false; code: 'invalid' | 'too_long' } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, code: 'invalid' };
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(input)) {
    if (!(GUIDING_IDS as readonly string[]).includes(k) || typeof v !== 'string') return { ok: false, code: 'invalid' };
    const t = v.trim();
    if (!t) return { ok: false, code: 'invalid' };
    if (t.length > GUIDING_MAX) return { ok: false, code: 'too_long' };
    out[k] = t;
  }
  return Object.keys(out).length ? { ok: true, answers: out } : { ok: false, code: 'invalid' };
}

export const GUIDING_ERRORS = {
  invalid: 'Add a short answer to save.',
  too_long: `Keep each answer under ${GUIDING_MAX} characters.`,
  closed: 'Answers are closed now that your cohort has kicked off.',
  forbidden: 'Only the team lead can save these answers.',
  failed: 'Could not save. Try again in a moment.',
} as const;
export type GuidingErrorCode = keyof typeof GUIDING_ERRORS;

/** Maps an error from save_guiding_answers to a code. 42501 = not the lead; 22023 = closed or invalid. */
export function mapGuidingError(e: { code?: string; message?: string } | null | undefined): GuidingErrorCode {
  if (e?.code === '42501') return 'forbidden';
  if (e?.code === '22023') return /closed/.test(e.message ?? '') ? 'closed' : /characters/.test(e.message ?? '') ? 'too_long' : 'invalid';
  return 'failed';
}
