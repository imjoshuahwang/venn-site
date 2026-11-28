import { test } from 'node:test';
import assert from 'node:assert/strict';
import { celebrationPlan } from './celebrate.ts';

test('full plan: three bursts over ~3s in Venn colours plus the partner accent', () => {
  const p = celebrationPlan({ reduced: false, accent: '#ff9900' });
  assert.equal(p.bursts.length, 3);
  assert.equal(p.duration, 3000);
  assert.ok(p.gravity > 0);
  assert.deepEqual(p.colors, ['#1fa971', '#18181a', '#ffffff', '#ff9900']);
  assert.ok(p.bursts.every((b, i, a) => i === 0 || b.at > a[i - 1].at));
});

test('reduced motion: no bursts, no gravity, a short calm fade', () => {
  const p = celebrationPlan({ reduced: true, accent: '#ff9900' });
  assert.equal(p.reduced, true);
  assert.deepEqual(p.bursts, []);
  assert.equal(p.gravity, 0);
  assert.ok(p.duration <= 500);
});

test('phones get fewer particles than desktops, no accent keeps the base palette', () => {
  const phone = celebrationPlan({ reduced: false, width: 390 }), desk = celebrationPlan({ reduced: false, width: 1280 });
  assert.ok(phone.bursts[0].count < desk.bursts[0].count);
  assert.equal(phone.colors.length, 3);
});
