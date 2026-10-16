// One rAF-throttled scroll/resize loop shared by every scroll-linked piece on the page.
const fns: (() => void)[] = [];
let queued = false;
const run = () => { queued = false; fns.forEach((f) => f()); };
const queue = () => { if (!queued) { queued = true; requestAnimationFrame(run); } };
addEventListener('scroll', queue, { passive: true });
addEventListener('resize', queue);

export const onScroll = (f: () => void) => { fns.push(f); f(); };
export const clamp = (x: number) => Math.max(0, Math.min(1, x));
export const ease = (x: number) => x * x * (3 - 2 * x);
export const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
