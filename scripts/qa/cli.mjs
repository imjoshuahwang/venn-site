// Argument parsing for mobile-qa.mjs. Stress-mode flags come from the modes registry.
import { parseArgs } from 'node:util';
import { modes } from './modes.mjs';

const csv = (s) => (s ? s.split(',').map((x) => x.trim()).filter(Boolean) : undefined);

// "Name: value" lines (repeated --header flags, or newline-separated QA_EXTRA_HEADERS) -> { name: value }.
export function parseHeaders(lines) {
  const out = {};
  for (const line of lines.map((l) => l.trim()).filter(Boolean)) {
    const i = line.indexOf(':');
    if (i < 1) throw new Error('bad header, expected "Name: value"');
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

export function parseCli(argv, registry = modes, env = process.env) {
  const options = {
    pages: { type: 'string' },
    only: { type: 'string' },
    devices: { type: 'string' },
    browsers: { type: 'string' },
    workers: { type: 'string', default: '4' },
    out: { type: 'string', default: 'qa/out' },
    header: { type: 'string', multiple: true },
    'update-baselines': { type: 'boolean' },
    'diff-threshold': { type: 'string', default: '0.2' },
    ...Object.fromEntries(Object.entries(registry).map(([k, m]) => [k, { type: m.arg ? 'string' : 'boolean' }])),
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
    headers: parseHeaders([...(values.header || []), ...(env.QA_EXTRA_HEADERS || '').split('\n')]),
    updateBaselines: !!values['update-baselines'],
    diffThreshold: parseFloat(values['diff-threshold']) >= 0 ? parseFloat(values['diff-threshold']) : 0.2,
    activeModes: Object.keys(registry).filter((k) => values[k]).map((k) => registry[k].build ? registry[k].build(values[k]) : registry[k]),
  };
}
