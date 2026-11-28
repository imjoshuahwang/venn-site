// Share for the acceptance letters (#322): a PNG card drawn client-side (1200x1200, plus a 1200x627 wide variant) and a LinkedIn new-post intent.
// The card names every cohort the student got into, so a dual acceptance names both. No numbers except the year.
export const SHARE_TEXT = 'I got accepted into Venn Fall 2026';
export const SIZES = { square: { w: 1200, h: 1200 }, wide: { w: 1200, h: 627 } } as const;
export type CardSize = keyof typeof SIZES;

/** LinkedIn's new-post composer with the text filled in. The user attaches the downloaded card themselves. */
export const intentUrl = (text: string = SHARE_TEXT): string => `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(text)}`;
export const cohortLine = (names: string[]): string => (names.length > 1 ? names.slice(0, -1).join(', ') + ' and ' + names.at(-1) : names[0] ?? 'Venn');

const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", Inter, system-ui, sans-serif';

export async function renderLetterCard(names: string[], size: CardSize): Promise<Blob> {
  const { w, h } = SIZES[size];
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  const k = h / 1200 > 0.6 ? 1 : 0.62;
  g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
  const blob = (x: number, y: number, r: number, col: string) => {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  };
  blob(100, 120, 760 * k + 100, 'rgba(191,232,208,0.95)');
  blob(w - 80, h - 80, 820 * k + 100, 'rgba(195,216,245,0.9)');
  g.textBaseline = 'alphabetic'; g.textAlign = 'left'; g.fillStyle = '#18181a';
  const pad = 88;
  g.font = `800 ${Math.round(64 * k)}px ${FONT}`; g.fillText('Venn', pad, pad + 56 * k);
  const fit = (text: string, weight: number, px: number) => { let s = px; do { g.font = `${weight} ${s}px ${FONT}`; s -= 4; } while (g.measureText(text).width > w - pad * 2 && s > 28); };
  const lines = ['I got accepted', 'into Venn', 'Fall 2026'];
  const base = h * (size === 'square' ? 0.43 : 0.4);
  const step = Math.round(150 * k);
  lines.forEach((l, i) => { fit(l, 800, Math.round(140 * k)); g.fillText(l, pad, base + i * step); });
  g.fillStyle = '#3a3a3a';
  const line = cohortLine(names);
  fit(line, 600, Math.round(56 * k));
  g.fillText(line, pad, base + 3 * step + 20);
  g.fillStyle = '#18181a'; fit('joinvenn.org', 600, Math.round(44 * k));
  g.fillText('joinvenn.org', pad, h - pad + 10);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('card'))), 'image/png'));
}
