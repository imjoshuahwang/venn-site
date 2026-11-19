// Beauty bar scale checks used by scripts/qa/portal-tokens.test.mjs.
const FS = [13, 15, 17, 22, 28, 40, 56];
const SP = [0, 4, 8, 12, 16, 24, 32, 44, 48, 64];
const RAD = [0, 12, 20, 999, 50];
const MS = [0, 120, 240, 480];

const px = (s) => [...s.matchAll(/(-?\d*\.?\d+)px/g)].map((m) => Number(m[1]));

export function checkTokens(src) {
  const bad = [];
  const decls = [...src.replaceAll(/\/\*[\s\S]*?\*\//g, '').matchAll(/(^|[;{\s])(font-size|font-weight|padding[a-z-]*|margin[a-z-]*|gap|row-gap|column-gap|border-radius|transition[a-z-]*|animation[a-z-]*)\s*:\s*([^;}"]+)/g)];
  for (const [, , prop, value] of decls) {
    const v = value.replaceAll(/var\([^)]*\)|calc\([^)]*\)|env\([^)]*\)/g, '');
    if (prop === 'font-size') px(v).forEach((n) => !FS.includes(n) && bad.push(`${prop}:${n}px`));
    else if (prop === 'font-weight') { if (/^\d+$/.test(v.trim()) && ![400, 600, 800].includes(Number(v))) bad.push(`${prop}:${v}`); }
    else if (prop === 'border-radius') px(v).forEach((n) => !RAD.includes(n) && bad.push(`${prop}:${n}px`));
    else if (/^(padding|margin|gap|row-gap|column-gap)/.test(prop)) px(v).forEach((n) => !SP.includes(Math.abs(n)) && bad.push(`${prop}:${n}px`));
    else {
      for (const m of v.matchAll(/(\d*\.?\d+)(ms|s)\b/g)) {
        const ms = m[2] === 's' ? Number(m[1]) * 1000 : Number(m[1]);
        if (!MS.includes(ms)) bad.push(`${prop}:${m[0]}`);
      }
    }
  }
  return bad;
}

const lum = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
export const contrast = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
