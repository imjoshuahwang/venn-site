// Share story card (#173): 1080x1920 PNG drawn client-side. Only a first name and an outlet/cohort label ever reach it.
export const CARD_W = 1080;
export const CARD_H = 1920;
export const DEFAULT_LABEL = 'Venn Fall 26';
const PUBLIC_URL = 'https://joinvenn.org/';

export type CardSpec = { firstName: string; label: string; headline: string };

const clean = (s: string | undefined | null) => (s ?? '').trim();
const looksPrivate = (s: string) => /@|\d{3,}/.test(s);

export function cardSpec(o: { name?: string | null; label?: string | null }): CardSpec {
  const first = clean(o.name).split(/\s+/)[0] ?? '';
  const label = clean(o.label);
  return {
    firstName: looksPrivate(first) || !/^\p{L}/u.test(first) ? '' : first,
    label: label && !looksPrivate(label) ? label : DEFAULT_LABEL,
    headline: "I'm in.",
  };
}

/** Always the public marketing page, which carries the OG tags; never a portal URL. */
export const shareUrl = (_origin?: string): string => PUBLIC_URL;

export async function renderCard(spec: CardSpec): Promise<Blob> {
  const c = document.createElement('canvas');
  c.width = CARD_W; c.height = CARD_H;
  const g = c.getContext('2d')!;
  const font = '-apple-system, BlinkMacSystemFont, "SF Pro Display", Inter, system-ui, sans-serif';
  g.fillStyle = '#fff'; g.fillRect(0, 0, CARD_W, CARD_H);
  const blob = (x: number, y: number, r: number, col: string) => {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, CARD_W, CARD_H);
  };
  blob(120, 260, 900, 'rgba(191,232,208,0.9)');
  blob(1000, 1700, 1000, 'rgba(195,216,245,0.9)');
  g.fillStyle = '#0a0a0a'; g.textBaseline = 'alphabetic';
  g.font = `700 64px ${font}`; g.fillText('Venn', 96, 180);
  g.font = `700 200px ${font}`;
  g.fillText(spec.headline, 96, 860);
  if (spec.firstName) { g.font = `700 120px ${font}`; g.fillText(spec.firstName, 96, 1020); }
  g.font = `600 56px ${font}`; g.fillStyle = '#3a3a3a';
  g.fillText(spec.label, 96, 1110);
  const w = 520, h = 120, x = 96, y = 1560;
  g.fillStyle = '#0a0a0a'; g.beginPath(); g.roundRect(x, y, w, h, 60); g.fill();
  g.fillStyle = '#fff'; g.font = `600 48px ${font}`; g.textAlign = 'center';
  g.fillText('joinvenn.org', x + w / 2, y + 76);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('card'))), 'image/png'));
}
