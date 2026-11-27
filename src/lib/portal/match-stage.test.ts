import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plan, lowEnd, wheelTiles, peerTile, finalY, TILES, BEATS, stateLabel } from './match-stage.mjs';

test('plan: unmatched never spins, first view plays, later visits land on the card, replay plays', () => {
  assert.deepEqual(plan({ status: 'unmatched' }), { screen: 'unmatched', kind: null });
  assert.deepEqual(plan({ status: null }), { screen: 'unmatched', kind: null });
  assert.equal(plan({ status: 'approved', viewedAt: null }).kind, 'full');
  assert.equal(plan({ status: 'revealed', viewedAt: 'x' }).screen, 'card');
  assert.equal(plan({ status: 'revealed', viewedAt: 'x', replay: true }).kind, 'full');
  assert.equal(plan({ status: 'accepted', viewedAt: null }).screen, 'card');
  assert.equal(plan({ status: 'approved', reduced: true }).kind, 'reduced');
  assert.equal(plan({ status: 'approved', low: true }).kind, 'short');
});

test('low end: saveData, 4 cores or dropped frames; confetti halves', () => {
  assert.equal(lowEnd({ connection: { saveData: true }, hardwareConcurrency: 8 }), true);
  assert.equal(lowEnd({ hardwareConcurrency: 4 }), true);
  assert.equal(lowEnd({ hardwareConcurrency: 8 }, 3), true);
  assert.equal(lowEnd({ hardwareConcurrency: 8 }), false);
  assert.equal(BEATS.short.confetti, 30);
  assert.ok(BEATS.short.spin < BEATS.full.spin);
});

test('tiles hold field and region only and the peer tile is last', () => {
  const t = wheelTiles(peerTile({ field: 'Robotics', region: 'Ohio' }));
  assert.equal(t.at(-1), 'Robotics, Ohio');
  assert.ok(TILES.every((x) => /^[A-Za-z]+, [A-Za-z]+$/.test(x)));
  assert.equal(peerTile({}), 'Your peer');
  assert.ok(finalY(t.length) < 0);
  assert.equal(stateLabel('accepted'), 'Said yes');
});
