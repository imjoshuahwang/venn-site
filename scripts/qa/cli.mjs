// Argument parsing for mobile-qa.mjs. Stress-mode flags come from the modes registry.
import { parseArgs } from 'node:util';
import { modes } from './modes.mjs';

const csv = (s) => (s ? s.split(',').map((x) => x.trim()).filter(Boolean) : undefined);

export function parseCli(argv, registry = modes) {
  const options = {
    pages: { type: 'string' },
    only: { type: 'string' },
    devices: { type: 'string' },
    browsers: { type: 'string' },
    workers: { type: 'string', default: '4' },
    out: { type: 'string', default: 'qa/out' },
    ...Object.fromEntries(Object.keys(registry).map((k) => [k, { type: 'boolean' }])),
  };
  const { values, positionals } = parseArgs({ args: argv, options, allowPositionals: true });
  return {
    base: (positionals[0] || 'http://127.0.0.1:4321').replace(/\/+$/, ''),
    pages: csv(values.pages),
    only: values.only,
    devices: csv(values.devices),
    browsers: csv(values.browsers),
    workers: Math.max(1, parseInt(values.workers, 10) || 4),
    out: values.out,
    activeModes: Object.keys(registry).filter((k) => values[k]).map((k) => registry[k]),
  };
}
