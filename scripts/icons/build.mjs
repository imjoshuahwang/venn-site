// Generates the favicon set from the Venn mark (#233). Run: node scripts/icons/build.mjs
// Also writes qa/233/compare.png (single vs two circle at 16 and 32 px).
import sharp from 'sharp';
import { writeFileSync, mkdirSync } from 'node:fs';

const root = new URL('../../', import.meta.url).pathname;
const GREEN = '#2a4a2e', INK = '#222222', LENS = '#5f8f66';

// Mark fills the canvas edge to edge so it survives 16px.
export const twoCircle = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<defs><clipPath id="c"><circle cx="68" cy="50" r="32"/></clipPath></defs>
<circle cx="32" cy="50" r="32" fill="${GREEN}"/>
<circle cx="68" cy="50" r="32" fill="${INK}"/>
<circle cx="32" cy="50" r="32" fill="${LENS}" clip-path="url(#c)"/>
</svg>
`;
export const singleCircle = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<circle cx="50" cy="50" r="48" fill="${GREEN}"/>
</svg>
`;

export const CHOSEN = singleCircle; // reads clearer at 16px, see qa/233/compare.png
const png = (svg, size) => sharp(Buffer.from(svg), { density: 600 }).resize(size, size).png().toBuffer();

async function compare() {
  const sizes = [16, 32], pad = 12, scale = 8;
  const cell = 32 * scale;
  const variants = [singleCircle, twoCircle];
  const comp = [];
  for (let r = 0; r < variants.length; r++) {
    for (let c = 0; c < sizes.length; c++) {
      const small = await png(variants[r], sizes[c]);
      const big = await sharp(small).resize(sizes[c] * scale, sizes[c] * scale, { kernel: 'nearest' }).png().toBuffer();
      comp.push({ input: small, left: pad + c * (cell + pad) , top: pad + r * (cell + pad) });
      comp.push({ input: big, left: pad + c * (cell + pad), top: pad + r * (cell + pad) + 40 });
    }
  }
  // layout: per row, actual-size and 8x zoom stacked
  const rowH = 40 + 32 * scale + pad;
  const out = sharp({ create: { width: pad + 2 * (cell + pad), height: pad + 2 * rowH, channels: 3, background: '#fff' } });
  const layers = [];
  for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) {
    const x = pad + c * (cell + pad), y = pad + r * rowH;
    const small = await png(variants[r], sizes[c]);
    layers.push({ input: small, left: x, top: y });
    layers.push({ input: await sharp(small).resize(sizes[c] * scale, sizes[c] * scale, { kernel: 'nearest' }).png().toBuffer(), left: x, top: y + 40 });
  }
  mkdirSync(root + 'qa/233', { recursive: true });
  await out.composite(layers).png().toFile(root + 'qa/233/compare.png');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  writeFileSync(root + 'public/favicon.svg', CHOSEN);
  for (const [name, size] of [['favicon-32.png', 32], ['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
    writeFileSync(root + 'public/' + name, await png(CHOSEN, size));
  }
  await compare();
}
