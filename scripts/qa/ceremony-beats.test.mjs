import test from 'node:test';
import assert from 'node:assert/strict';
import { cardFrames, timeline, LIFT_SCALE } from '../../src/lib/portal/ceremony.mjs';

test('big reveal: lift to 1.04 by 400ms, hold through seal start, settle at 2200ms', () => {
  const { frames, duration } = cardFrames('big');
  assert.equal(duration, 2200);
  assert.equal(LIFT_SCALE, 1.04);
  assert.equal(Math.round(frames[1].offset * duration), 400);
  assert.equal(frames[1].transform, 'scale(1.04)');
  assert.notEqual(frames[1].boxShadow, frames[0].boxShadow);
  assert.equal(Math.round(frames[2].offset * duration), 1600);
  assert.equal(frames.at(-1).transform, 'scale(1)');
});

test('small reveal: lift to 1.04 by 300ms', () => {
  const { frames, duration } = cardFrames('small');
  assert.equal(Math.round(frames[1].offset * duration), 300);
  assert.equal(frames[1].transform, 'scale(1.04)');
});

test('beat starts match the bar', () => {
  const t = (k, n) => timeline(k).find((b) => b.name === n).start;
  assert.equal(t('big', 'bloom'), 400);
  assert.equal(t('big', 'confetti'), 4400);
  assert.equal(t('small', 'warm'), 300);
});
