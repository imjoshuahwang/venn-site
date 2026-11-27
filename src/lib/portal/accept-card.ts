// "I got accepted" share card (#227): 1080x1350 (4:5) PNG for LinkedIn and X. No numbers except the year in the cohort title.
// Rendered once, as soon as the popup shows, so the Share tap can call navigator.share synchronously with the finished File.
export const ACCEPT_W = 1080;
export const ACCEPT_H = 1350;

export type AcceptSpec = { headline: string; title: string; org: string; partnerName: string; partnerLogo: string; vennLogo: string };

/** Every line the card draws, for the no-digits test. */
export const cardLines = (s: AcceptSpec) => [s.headline, s.title, s.org, s.partnerName].filter(Boolean);

const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", Inter, system-ui, sans-serif';
const load = (src: string) => new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error(src)); i.src = src; });

function fit(g: CanvasRenderingContext2D, text: string, weight: number, size: number, max: number) {
  let s = size;
  do { g.font = `${weight} ${s}px ${FONT}`; s -= 4; } while (g.measureText(text).width > max && s > 28);
}
function contain(g: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const r = Math.min(w / img.naturalWidth, h / img.naturalHeight) || 1;
  const dw = img.naturalWidth * r, dh = img.naturalHeight * r;
  g.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

export async function renderAcceptCard(s: AcceptSpec): Promise<Blob> {
  const [venn, partner] = await Promise.all([load(s.vennLogo), load(s.partnerLogo)]);
  await document.fonts?.ready;
  const c = document.createElement('canvas');
  c.width = ACCEPT_W; c.height = ACCEPT_H;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff'; g.fillRect(0, 0, ACCEPT_W, ACCEPT_H);
  const blob = (x: number, y: number, r: number, col: string) => {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, ACCEPT_W, ACCEPT_H);
  };
  blob(100, 160, 800, 'rgba(191,232,208,0.95)');
  blob(1000, 1250, 900, 'rgba(195,216,245,0.9)');
  g.textBaseline = 'alphabetic'; g.textAlign = 'left'; g.fillStyle = '#18181a';
  contain(g, venn, 84, 84, 360, 90);
  fit(g, s.headline, 800, 190, ACCEPT_W - 168);
  g.fillText(s.headline, 84, 560);
  g.fillStyle = '#18181a'; fit(g, s.title, 700, 64, ACCEPT_W - 168);
  g.fillText(s.title, 84, 680);
  if (s.org) { g.fillStyle = '#3a3a3a'; fit(g, s.org, 600, 56, ACCEPT_W - 168); g.fillText(s.org, 84, 770); }
  g.fillStyle = '#fff'; g.beginPath(); g.roundRect(84, 930, ACCEPT_W - 168, 260, 40); g.fill();
  contain(g, partner, 84 + 60, 930 + 40, ACCEPT_W - 168 - 120, 180);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('card'))), 'image/png'));
}

/** LinkedIn's minimum age is 16. Whole years from a YYYY-MM-DD birthday; null for a missing or malformed one. */
export function ageOn(birthday: string | null | undefined, today: Date = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(birthday ?? ''));
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  let age = today.getUTCFullYear() - y;
  if (today.getUTCMonth() + 1 < mo || (today.getUTCMonth() + 1 === mo && today.getUTCDate() < d)) age--;
  return age >= 0 && age < 130 ? age : null;
}
/** LinkedIn's minimum age is 16: shown only when the birthday is known and the student is 16 or older. An unknown birthday hides it (C2 default; main has no birthday column yet, #223). */
export const linkedinAllowed = (birthday: string | null | undefined, today?: Date) => { const a = ageOn(birthday, today); return a !== null && a >= 16; };

export const composerUrl = (text: string) => `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(text)}`;
export const EXPERIENCE_URL = 'https://www.linkedin.com/in/me/edit/forms/position/new/';
export const fillOrg = (post: string, org: string) => post.replace('{org}', org || 'my club');
