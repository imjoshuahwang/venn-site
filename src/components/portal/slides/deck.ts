// Pure navigation, keyboard and validation logic for SlideDeck. No DOM in here, so node:test covers it.
export type DeckState = { index: number; count: number; dir: -1 | 0 | 1; nudged: boolean };
export type Attempt = { state: DeckState; result: 'advance' | 'nudge' | 'finish'; message: string };

export const createDeck = (count: number, start = 0): DeckState => ({ index: Math.max(0, Math.min(start, count - 1)), count, dir: 0, nudged: false });
export const progress = (s: DeckState) => (s.index + 1) / s.count;
export const goTo = (s: DeckState, i: number): DeckState => {
  const index = Math.max(0, Math.min(i, s.count - 1));
  return { ...s, index, dir: index === s.index ? s.dir : index > s.index ? 1 : -1, nudged: false };
};
export const retreat = (s: DeckState): DeckState => (s.index === 0 ? s : goTo(s, s.index - 1));

// Try to leave the current slide. A message from the slide's validation nudges first; in soft mode (the default) a second
// attempt on the same slide goes through anyway, so validation can never trap anyone and the server stays the real gate.
export function attempt(s: DeckState, message: string, strict: boolean): Attempt {
  if (message && (strict || !s.nudged)) return { state: { ...s, nudged: true }, result: 'nudge', message };
  if (s.index >= s.count - 1) return { state: { ...s, dir: 1 }, result: 'finish', message: '' };
  return { state: goTo(s, s.index + 1), result: 'advance', message: '' };
}

export type KeyInfo = { key: string; target?: string; shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean; isComposing?: boolean };
export function keyAction(k: KeyInfo): 'next' | 'back' | null {
  if (k.isComposing) return null;
  if (k.key === 'Escape') return 'back';
  if (k.key !== 'Enter' || k.shiftKey) return null;
  const t = k.target ?? '';
  if (t === 'BUTTON' || t === 'A' || t === 'SELECT') return null;
  if (t === 'TEXTAREA' && !(k.metaKey || k.ctrlKey)) return null;
  return 'next';
}

export type FieldInfo = { value: string; type?: string; required?: boolean; minLength?: number; label?: string };
export function checkField(f: FieldInfo): string {
  const v = f.value.trim();
  if (!v) return f.required ? `Add your ${f.label ?? 'answer'} to continue.` : '';
  if (f.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return 'That email looks a little off. Mind checking it?';
  if (f.minLength && f.value.length < f.minLength) return `Use at least ${f.minLength} characters.`;
  return '';
}
export const checkSlide = (fields: FieldInfo[]): string => fields.map(checkField).find(Boolean) ?? '';
