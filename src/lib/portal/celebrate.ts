// Full-screen celebration for the sealed reveal (#321). Pure plan (tested) plus a small canvas runner.
export type Burst = { at: number; x: number; y: number; count: number; spread: number; speed: number };
export type Plan = { reduced: boolean; duration: number; gravity: number; drift: number; colors: string[]; bursts: Burst[] };

const BASE = ['#1fa971', '#18181a', '#ffffff'];

/** accent is the partner colour (AWS orange, Quadron blue); it joins Venn green/black/white. Reduced motion: no bursts, a calm fade. */
export function celebrationPlan(opts: { reduced: boolean; accent?: string; width?: number }): Plan {
  const colors = opts.accent ? [...BASE, opts.accent] : BASE;
  if (opts.reduced) return { reduced: true, duration: 400, gravity: 0, drift: 0, colors, bursts: [] };
  const small = (opts.width ?? 390) < 600;
  const n = small ? 70 : 120;
  return {
    reduced: false, duration: 3000, gravity: 1400, drift: 60, colors,
    bursts: [
      { at: 0, x: 0.5, y: 0.45, count: n * 2, spread: Math.PI * 2, speed: 900 },
      { at: 350, x: 0.15, y: 0.9, count: n, spread: Math.PI / 3, speed: 1300 },
      { at: 600, x: 0.85, y: 0.9, count: n, spread: Math.PI / 3, speed: 1300 },
    ],
  };
}

/** Runs the plan on a canvas. Returns stop(). Reduced plans only fade the canvas element and draw nothing. */
export function runCelebration(canvas: HTMLCanvasElement, plan: Plan): () => void {
  if (plan.reduced) { canvas.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: plan.duration, fill: 'both' }); return () => {}; }
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const w = (canvas.width = innerWidth * dpr), h = (canvas.height = innerHeight * dpr);
  const ctx = canvas.getContext('2d')!;
  type P = { x: number; y: number; vx: number; vy: number; r: number; vr: number; c: string; s: number };
  let ps: P[] = [];
  const t0 = performance.now();
  let last = t0, raf = 0, stopped = false;
  const pending = [...plan.bursts];
  const frame = (now: number) => {
    if (stopped) return;
    const t = now - t0, dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    while (pending.length && pending[0].at <= t) {
      const b = pending.shift()!;
      const base = b.spread >= Math.PI * 2 ? 0 : -Math.PI / 2 - b.spread / 2;
      for (let i = 0; i < b.count; i++) {
        const a = base + Math.random() * b.spread, v = b.speed * (0.4 + Math.random() * 0.6) * dpr;
        ps.push({ x: b.x * w, y: b.y * h, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: Math.random() * 6, vr: (Math.random() - 0.5) * 12, c: plan.colors[i % plan.colors.length], s: (6 + Math.random() * 6) * dpr });
      }
    }
    ctx.clearRect(0, 0, w, h);
    const fade = Math.max(0, Math.min(1, (plan.duration + 600 - t) / 600));
    ctx.globalAlpha = fade;
    for (const p of ps) {
      p.vy += plan.gravity * dpr * dt; p.vx *= 0.99; p.x += (p.vx + Math.sin(p.y / 90) * plan.drift) * dt; p.y += p.vy * dt; p.r += p.vr * dt;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 3, p.s, p.s * 0.6); ctx.restore();
    }
    ps = ps.filter((p) => p.y < h + 40);
    if (t < plan.duration + 600 && (ps.length || pending.length)) raf = requestAnimationFrame(frame); else ctx.clearRect(0, 0, w, h);
  };
  raf = requestAnimationFrame(frame);
  return () => { stopped = true; cancelAnimationFrame(raf); ctx.clearRect(0, 0, w, h); };
}
