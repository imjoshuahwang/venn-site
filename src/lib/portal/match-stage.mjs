// Match stage logic (#247): pure, no DOM. Reuses the #226 stage look; durations live here (ms).
export const BEATS = {
  full: { type: 18, hold: 500, spin: 3400, stop: 700, lift: 700, confetti: 60 },
  short: { type: 0, hold: 200, spin: 1600, stop: 400, lift: 400, confetti: 30 },
  reduced: { type: 0, hold: 0, spin: 0, stop: 0, lift: 200, confetti: 0 },
};
export const ROW = 56;

// Field and region only, never a name. The peer's own tile is appended last by the page.
export const TILES = ['Debate, Kenya', 'Film, Texas', 'Robotics, Ohio', 'Music, India', 'Biology, Brazil', 'Writing, Germany', 'Law, Nigeria', 'Chess, Poland', 'Design, Japan', 'Climate, Chile', 'Coding, Texas'];

export const lowEnd = (nav, frameDrops = 0) => !!(nav?.connection?.saveData || (nav?.hardwareConcurrency ?? 8) <= 4 || frameDrops >= 3);

/** What the page does: 'none' (no fit card), 'card' (land on it), or the stage kind to play. */
export function plan({ status, viewedAt, reduced, low, replay = false }) {
  if (!status || status === 'unmatched') return { screen: 'unmatched', kind: null };
  const live = status === 'approved' || status === 'revealed';
  if (!live || (viewedAt && !replay)) return { screen: 'card', kind: null };
  return { screen: 'stage', kind: reduced ? 'reduced' : low ? 'short' : 'full' };
}

export const openerLine = (home) => (home ? `Finding your peer in ${home}.` : 'Finding your peer.');
export const wheelTiles = (peerTile) => [...TILES, ...TILES.slice(0, 8), peerTile];
export const peerTile = (p) => [p.field, p.region].filter(Boolean).join(', ') || 'Your peer';
export const finalY = (count, height = 264) => -(count - 1) * ROW + (height / 2 - ROW / 2);

const LABELS = { requested: 'Sent', accepted: 'Said yes', declined: 'Declined', expired: 'No reply' };
export const stateLabel = (status) => LABELS[status] ?? null;
