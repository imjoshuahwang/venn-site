// Declarative interaction flows (qa/flows.yaml), run after the universal checks. A flow runs on every device, on the page it names
// (`on:`), in a fresh page of the same context so the page's own screenshot stays clean. Flows never POST to Supabase.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { slug } from './devices.mjs';

export const FLOWS_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'qa', 'flows.yaml');
const STEP_TIMEOUT = 10000;
const unquote = (s) => s.trim().replace(/^(["'])(.*)\1$/, '$2');

// Tiny YAML subset: `- name: x`, `on: /path`, `steps:` then `- verb args` lines. `#` at line start is a comment.
export function parseFlows(text) {
  const flows = [];
  let flow = null, inSteps = false;
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const indent = line.length - line.trimStart().length;
    let body = line.trim();
    if (indent === 0 && body.startsWith('- ')) { flow = { name: '', on: '/', steps: [] }; flows.push(flow); inSteps = false; body = body.slice(2); }
    else if (inSteps && body.startsWith('- ')) { flow.steps.push(unquote(body.slice(2))); continue; }
    if (!flow) throw new Error(`flows.yaml: line outside a flow: ${line}`);
    const m = body.match(/^(name|on|steps):\s*(.*)$/);
    if (!m) throw new Error(`flows.yaml: cannot read line: ${line}`);
    inSteps = m[1] === 'steps';
    if (!inSteps) flow[m[1]] = unquote(m[2]);
  }
  for (const f of flows) if (!f.name || !f.steps.length) throw new Error(`flows.yaml: flow "${f.name}" needs a name and steps`);
  return flows;
}

export const loadFlows = (file = FLOWS_FILE) => parseFlows(fs.readFileSync(file, 'utf8'));

// Split on spaces, keeping "quoted strings" together.
const tokens = (s) => [...s.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map((m) => m[1] ?? m[2] ?? m[3]);

async function runStep(page, step, ctx) {
  const [verb, ...restTokens] = tokens(step);
  const rest = step.trim().slice(verb.length).trim();
  const loc = (sel) => page.locator(unquote(sel)).filter({ visible: true }).first();
  switch (verb) {
    case 'goto':
      await page.goto(new URL(unquote(rest), page.url()).href, { waitUntil: 'load', timeout: 45000 });
      return ctx.afterLoad();
    case 'tap': return loc(rest).click({ timeout: ctx.timeout });
    case 'fill': {
      if (restTokens.length < 2) throw new Error('fill needs a selector and a value: fill "input[name=x]" some value');
      return loc(restTokens[0]).fill(restTokens.slice(1).join(' '), { timeout: ctx.timeout });
    }
    case 'expect-visible': return loc(rest).waitFor({ state: 'visible', timeout: ctx.timeout });
    case 'scroll-to': return loc(rest).scrollIntoViewIfNeeded({ timeout: ctx.timeout });
    case 'wait': return page.waitForTimeout(Math.min(5000, Number(rest) || 500));
    case 'screenshot': return ctx.shot(slug(rest || 'shot'));
    default: throw new Error(`unknown step "${verb}"`);
  }
}

// Returns result rows [{ check: 'flow:<name>', pass, details, flowShot? }]. opts: { flows, outDir, shots, modes }.
export async function runFlows(page, device, opts = {}) {
  const { flows = loadFlows(), outDir, shots = true, modes = [], stepTimeout = STEP_TIMEOUT } = opts;
  const here = new URL(page.url());
  const wanted = (p) => p.replace(/\/+$/, '') === here.pathname.replace(/\/+$/, '');
  const rows = [];
  for (const flow of flows.filter((f) => wanted(f.on))) {
    const fp = await page.context().newPage();
    const tag = `${slug(flow.name)}-${slug(here.pathname === '/' ? 'home' : here.pathname)}-${slug(device.name)}`;
    const shot = async (name, suffix = '') => {
      if (!outDir || !shots) return undefined;
      const file = `shots/flow-${tag}-${name}${suffix}.jpg`;
      fs.mkdirSync(path.join(outDir, 'shots'), { recursive: true });
      await fp.screenshot({ path: path.join(outDir, file), type: 'jpeg', quality: 60 }).catch(() => {});
      return file;
    };
    const ctx = { shot, timeout: stepTimeout, afterLoad: async () => { for (const m of modes) await m.afterLoad?.(fp); } };
    let step = '';
    try {
      await fp.route(/^https?:\/\/[^/]*\.supabase\.co(:\d+)?\//, (r) => r.abort());
      for (const m of modes) await m.beforePage?.(fp);
      await fp.goto(here.href, { waitUntil: 'load', timeout: 45000 });
      await ctx.afterLoad();
      for (const [i, s] of flow.steps.entries()) { step = `step ${i + 1} "${s}"`; await runStep(fp, s, ctx); }
      rows.push({ check: `flow:${flow.name}`, pass: true, details: `${flow.steps.length} steps` });
    } catch (e) {
      const flowShot = await shot('fail');
      rows.push({ check: `flow:${flow.name}`, pass: false, details: `${step}: ${String(e.message || e).split('\n')[0]}${flowShot ? ` (${flowShot})` : ''}`, flowShot });
    } finally {
      await fp.close().catch(() => {});
    }
  }
  return rows;
}
