// Motion tokens for every portal screen. base.css mirrors these as --dur-* and --ease-*; motion.test.ts keeps the two in step.
export const DUR = {
  press: 120,
  fast: 240,
  slide: 440, // slide enter/exit: inside the 350-500ms window
  stagger: 70, // gap between text lines revealing inside a slide
  ceremony: 900,
} as const;

export const EASE = {
  spring: 'cubic-bezier(.34,1.3,.64,1)', // slight overshoot, settles fast
  out: 'cubic-bezier(.25,1,.5,1)',
} as const;

export const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
