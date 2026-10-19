// Labor illusion: show a deliberate "working" state for at least `ms`, without delaying failures.
export const minWait = async <T>(promise: Promise<T>, ms: number): Promise<T> => {
  const [value] = await Promise.all([promise, new Promise((r) => setTimeout(r, ms))]);
  return value;
};
