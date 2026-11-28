import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDeck, attempt, retreat, goTo, progress, keyAction, checkField, checkSlide } from './deck.ts';

test('a new deck starts on slide 0 with progress for one slide', () => {
  const d = createDeck(3);
  assert.equal(d.index, 0);
  assert.equal(progress(d), 1 / 3);
});

test('attempt advances forward and finishes on the last slide', () => {
  const d = createDeck(3);
  let r = attempt(d, '', false);
  assert.equal(r.result, 'advance');
  assert.equal(r.state.index, 1);
  assert.equal(r.state.dir, 1);
  r = attempt(r.state, '', false);
  assert.equal(r.state.index, 2);
  r = attempt(r.state, '', false);
  assert.equal(r.result, 'finish');
  assert.equal(r.state.index, 2);
});

test('retreat goes back, stops at 0, and flips direction', () => {
  const d = goTo(createDeck(3), 2);
  const b = retreat(d);
  assert.equal(b.index, 1);
  assert.equal(b.dir, -1);
  assert.equal(retreat(retreat(b)).index, 0);
});

test('goTo clamps inside the deck', () => {
  assert.equal(goTo(createDeck(3), 9).index, 2);
  assert.equal(goTo(createDeck(3), -4).index, 0);
});

test('soft validation nudges once, then lets the same slide through', () => {
  const d = createDeck(2);
  const first = attempt(d, 'Add your email.', false);
  assert.equal(first.result, 'nudge');
  assert.equal(first.message, 'Add your email.');
  assert.equal(first.state.index, 0);
  const second = attempt(first.state, 'Add your email.', false);
  assert.equal(second.result, 'advance');
  assert.equal(second.state.index, 1);
});

test('strict validation keeps nudging', () => {
  let d = createDeck(2);
  for (let i = 0; i < 3; i++) {
    const r = attempt(d, 'Nope', true);
    assert.equal(r.result, 'nudge');
    d = r.state;
  }
  assert.equal(d.index, 0);
});

test('moving to another slide resets the nudge', () => {
  const nudged = attempt(createDeck(3), 'x', false).state;
  assert.equal(nudged.nudged, true);
  assert.equal(attempt(nudged, 'x', false).state.nudged, false);
  assert.equal(retreat(goTo(nudged, 1)).nudged, false);
});

test('Enter advances from an input, not from buttons, links, textareas or IME composition', () => {
  assert.equal(keyAction({ key: 'Enter', target: 'INPUT' }), 'next');
  assert.equal(keyAction({ key: 'Enter', target: 'DIV' }), 'next');
  assert.equal(keyAction({ key: 'Enter', target: 'BUTTON' }), null);
  assert.equal(keyAction({ key: 'Enter', target: 'A' }), null);
  assert.equal(keyAction({ key: 'Enter', target: 'TEXTAREA' }), null);
  assert.equal(keyAction({ key: 'Enter', target: 'TEXTAREA', metaKey: true }), 'next');
  assert.equal(keyAction({ key: 'Enter', target: 'INPUT', isComposing: true }), null);
  assert.equal(keyAction({ key: 'Enter', target: 'INPUT', shiftKey: true }), null);
});

test('Escape goes back; other keys do nothing', () => {
  assert.equal(keyAction({ key: 'Escape', target: 'INPUT' }), 'back');
  assert.equal(keyAction({ key: 'a', target: 'INPUT' }), null);
});

test('checkField is gentle and specific', () => {
  assert.equal(checkField({ value: '', required: true, label: 'email' }), 'Add your email to continue.');
  assert.equal(checkField({ value: '  ', required: true, label: 'email' }), 'Add your email to continue.');
  assert.equal(checkField({ value: 'sam@', type: 'email' }), 'That email looks a little off. Mind checking it?');
  assert.equal(checkField({ value: 'sam@school.org', type: 'email' }), '');
  assert.equal(checkField({ value: 'short', minLength: 8 }), 'Use at least 8 characters.');
  assert.equal(checkField({ value: 'long enough', minLength: 8 }), '');
  assert.equal(checkField({ value: '', required: false, type: 'email' }), '');
});

test('checkSlide returns the first message only', () => {
  const m = checkSlide([{ value: 'ok', required: true }, { value: '', required: true, label: 'name' }, { value: 'x', minLength: 8 }]);
  assert.equal(m, 'Add your name to continue.');
  assert.equal(checkSlide([]), '');
});
