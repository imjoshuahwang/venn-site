// Device matrix: Playwright built-in descriptors, with the browser each runs on.
import { devices } from 'playwright';

export const MATRIX = [
  { name: 'iPhone SE', browser: 'webkit' },
  { name: 'iPhone 15', browser: 'webkit' },
  { name: 'iPhone 15 Pro Max', browser: 'webkit' },
  { name: 'Pixel 7', browser: 'chromium' },
  { name: 'Galaxy S9+', browser: 'chromium' },
  { name: 'iPad Mini', browser: 'webkit' },
  { name: 'iPhone 15 landscape', browser: 'webkit' },
  { name: 'Pixel 7 landscape', browser: 'chromium' },
];

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9+]+/g, '');

// names: array of device names (exact, case/punctuation-insensitive); browsers: array of 'webkit'|'chromium'.
export function resolveDevices({ names, browsers } = {}) {
  let list = MATRIX;
  if (names?.length) {
    list = names.map((n) => {
      const hit = MATRIX.find((d) => norm(d.name) === norm(n));
      if (!hit) throw new Error(`unknown device "${n}"; known: ${MATRIX.map((d) => d.name).join(', ')}`);
      return hit;
    });
  }
  if (browsers?.length) list = list.filter((d) => browsers.includes(d.browser));
  return list;
}

export function contextOptions(device) {
  const { defaultBrowserType, ...opts } = devices[device.name];
  return opts;
}

export const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
