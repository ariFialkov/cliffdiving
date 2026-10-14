import { test } from 'node:test';
import assert from 'node:assert/strict';
import { judgeDive, entryQuality, synthesizeBotDive, splitMarks, JUDGE_MAX, LOCK_SWEET } from '../src/scoring.js';
import { mulberry32 } from '../src/rng.js';
import { MAX_SCORE } from '../src/odds.js';
import { TRICKS, sequenceDuration } from '../src/tricks.js';

test('a perfect dive stays below the bot ceiling', () => {
  const rand = mulberry32(1);
  const q = entryQuality({ angleErrDeg: 0, lockDelta: LOCK_SWEET, headFirst: true });
  assert.equal(q, 1);
  const ids = ['rudy', 'gainerfull', 'doubleback', 'backtwister', 'rudy'];
  const j = judgeDive({ trickIds: ids, q, rand });
  assert.ok(j.total <= 3 * JUDGE_MAX + 1e-9);
  assert.ok(j.total < MAX_SCORE - 0.03, `player max ${j.total} leaves room for bots`);
});

test('entry quality rewards straight, well-timed entries', () => {
  const perfect = entryQuality({ angleErrDeg: 0, lockDelta: LOCK_SWEET });
  const crooked = entryQuality({ angleErrDeg: 45, lockDelta: LOCK_SWEET });
  const noLock = entryQuality({ angleErrDeg: 0, lockDelta: null });
  const flop = entryQuality({ angleErrDeg: 90, lockDelta: null });
  assert.ok(perfect > crooked && crooked > flop);
  assert.ok(perfect > noLock && noLock > flop);
  assert.ok(Math.abs(flop - 0.25 * 0.38) < 1e-9);
  const rip = entryQuality({ angleErrDeg: 0, lockDelta: LOCK_SWEET, headFirst: true });
  const crookedHeadFirst = entryQuality({ angleErrDeg: 45, lockDelta: LOCK_SWEET, headFirst: true });
  assert.equal(rip, 1);
  assert.ok(Math.abs(perfect - 0.88) < 1e-9, 'feet-first tops out below a head-first rip');
  assert.ok(crookedHeadFirst - crooked < 0.04, 'the head-first bonus needs a straight body');
});

test('more difficult sequences score more at equal entry', () => {
  const rand = mulberry32(9);
  const a = judgeDive({ trickIds: [], q: 0.8, rand }).total;
  const b = judgeDive({ trickIds: ['fronttuck'], q: 0.8, rand }).total;
  const c = judgeDive({ trickIds: ['fronttuck', 'barani'], q: 0.8, rand }).total;
  assert.ok(a < b && b < c);
});

test('splitMarks sums exactly to the total', () => {
  const rand = mulberry32(5);
  for (let i = 0; i < 2000; i++) {
    const total = Number((0.3 + rand() * 29.6).toFixed(2));
    const marks = splitMarks(total, rand);
    const sum = Number(marks.reduce((a, b) => a + b, 0).toFixed(2));
    assert.equal(sum, total);
    for (const m of marks) assert.ok(m > 0 && m <= 10);
  }
});

test('synthesized bot dives are consistent with their target score', () => {
  const rand = mulberry32(42);
  for (let i = 0; i < 3000; i++) {
    const target = Number((0.3 + rand() * 29.6).toFixed(2));
    const airTime = [2.4, 2.9, 3.4, 3.9][i % 4];
    const dive = synthesizeBotDive({ targetTotal: target, airTime, rand });
    assert.equal(dive.total, target);
    assert.ok(dive.q >= 0 && dive.q <= 1);
    assert.ok(sequenceDuration(dive.trickIds) <= airTime - 0.5, 'tricks must fit in the air time');
    for (const id of dive.trickIds) assert.ok(TRICKS[id]);
    // When q is strictly inside (0,1), the formula reproduces the target.
    if (dive.q > 0 && dive.q < 1) {
      const judged = judgeDive({ trickIds: dive.trickIds, q: dive.q, rand: () => 0.5 });
      assert.ok(Math.abs(judged.total - target) < 0.05, `${judged.total} vs ${target}`);
    }
  }
});
