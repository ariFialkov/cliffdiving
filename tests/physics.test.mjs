import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Diver, World, makeBotPlan, entryTilt, isHeadDown, SPIN_TAU } from '../src/world.js';
import { COMPETITIONS } from '../src/odds.js';
import { TRICKS, comboFor, swipePower } from '../src/tricks.js';
import { mulberry32 } from '../src/rng.js';
import { synthesizeBotDive } from '../src/scoring.js';

const DT = 1 / 120;

function airborne(compIndex = 3, charge = 1) {
  const w = new World();
  w.setCompetition(COMPETITIONS[compIndex]);
  const d = new Diver({ id: 'p', name: 'P', color: '#f00', x: -0.3 });
  d.setState('ready');
  w.divers.push(d);
  d.startCharge(charge);
  for (let i = 0; i < 400 && d.state !== 'airborne'; i++) w.update(DT);
  assert.equal(d.state, 'airborne');
  return { w, d };
}
const step = (w, s) => { for (let t = 0; t < s; t += DT) w.update(DT); };

test('a power-1.0 flip settles on a full rotation; harder swipes over-rotate, softer under-rotate', () => {
  const results = {};
  for (const power of [0.8, 1, 1.2]) {
    const { w, d } = airborne();
    d.queueTrick('frontflip', power);
    step(w, TRICKS.frontflip.duration + 6 * SPIN_TAU);
    results[power] = d.angle;
  }
  assert.ok(Math.abs(results[1] - 360) < 4, `power 1 ended at ${results[1].toFixed(1)}`);
  assert.ok(results[1.2] > 420, `power 1.2 ended at ${results[1.2].toFixed(1)}`);
  assert.ok(results[0.8] < 300, `power 0.8 ended at ${results[0.8].toFixed(1)}`);
});

test('rotation is loose: the body keeps spinning a little after the trick ends', () => {
  const { w, d } = airborne();
  d.queueTrick('fronttuck', 1);
  step(w, TRICKS.fronttuck.duration + DT);
  assert.equal(d.current, null);
  assert.ok(d.angle < 355, `still short of 360 at kick-out (${d.angle.toFixed(1)})`);
  assert.ok(d.spinL > 20, 'residual spin carries on');
  step(w, 1.2);
  assert.ok(Math.abs(d.angle - 360) < 4);
});

test('a tuck spins faster mid-trick than a straight flip', () => {
  const peak = {};
  for (const id of ['fronttuck', 'frontflip']) {
    const { w, d } = airborne();
    d.queueTrick(id, 1);
    let prev = d.angle;
    let max = 0;
    for (let t = 0; t < TRICKS[id].duration; t += DT) {
      w.update(DT);
      max = Math.max(max, (d.angle - prev) / DT);
      prev = d.angle;
    }
    peak[id] = max;
  }
  assert.ok(peak.fronttuck > peak.frontflip * 1.4, JSON.stringify(peak));
});

test('holding rotates forward in a straight dive and stops shortly after letting go', () => {
  const { w, d } = airborne();
  const a0 = d.angle;
  d.holding = true;
  step(w, 0.5);
  const mid = d.angle;
  assert.ok(mid - a0 > 90, `rotated ${(mid - a0).toFixed(1)}°`);
  assert.equal(d.rig.target(d, 0).pose.armFu, 182, 'straight dive pose with arms overhead');
  d.holding = false;
  step(w, 0.4);
  const settled = d.angle;
  step(w, 0.3);
  assert.ok(Math.abs(d.angle - settled) < 0.5, 'no rotation after release');
  assert.ok(settled - mid < 30, 'stops quickly');
});

test('holding does nothing in the middle of a trick', () => {
  const { w, d } = airborne();
  d.queueTrick('jackknife', 1);
  d.holding = true;
  step(w, 0.3);
  assert.ok(Math.abs(d.angle) < 1, 'jackknife has no rotation and hold waits for it to finish');
});

test('the lock streamlines but no longer snaps the body upright', () => {
  const { w, d } = airborne();
  d.holding = true;
  step(w, 0.2);
  d.holding = false;
  step(w, 0.3);
  const before = d.angle;
  assert.ok(before > 20);
  d.lock();
  step(w, 0.3);
  assert.ok(Math.abs(d.angle - before) < 2);
});

test('a second trick fired early merges into a combo', () => {
  assert.equal(comboFor('frontflip', 'corkscrew'), 'fronttwister');
  assert.equal(comboFor('corkscrew', 'backflip'), 'backtwister');
  assert.equal(comboFor('fronttuck', 'fronttuck'), 'doublefront');
  assert.equal(comboFor('jackknife', 'corkscrew'), null);
  const { w, d } = airborne();
  assert.equal(d.queueTrick('frontflip', 1), 'start');
  step(w, 0.15);
  assert.equal(d.queueTrick('corkscrew', 1), 'combo');
  assert.equal(d.current.trick.id, 'fronttwister');
  step(w, 2);
  assert.deepEqual(d.completed, ['fronttwister']);
  assert.ok(Math.abs(d.angle - 360) < 5, `pitch ${d.angle.toFixed(1)}`);
  assert.ok(Math.abs(d.twist - 1) < 1e-6, `twist ${d.twist}`);
});

test('a second trick fired late is just the next trick in sequence', () => {
  const { w, d } = airborne();
  d.queueTrick('frontflip', 1);
  step(w, TRICKS.frontflip.duration * 0.7);
  assert.equal(d.queueTrick('corkscrew', 1), 'queued');
  step(w, 2);
  assert.deepEqual(d.completed, ['frontflip', 'corkscrew']);
});

test('double tucks rotate twice', () => {
  const { w, d } = airborne();
  d.queueTrick('backtuck', 1);
  step(w, 0.1);
  d.queueTrick('backtuck', 1);
  step(w, 2.2);
  assert.deepEqual(d.completed, ['doubleback']);
  assert.ok(Math.abs(d.angle + 720) < 6, `pitch ${d.angle.toFixed(1)}`);
});

test('entry orientation: tilt and head-first', () => {
  assert.equal(isHeadDown(180, 0), true);
  assert.equal(isHeadDown(0, 0), false);
  assert.equal(isHeadDown(-180, 0), true);
  assert.equal(isHeadDown(0, 0.5), true);
  assert.equal(Math.round(entryTilt(200, 0)), 20);
});

test('swipe power: an ordinary swipe is ~1.0, weak ones lower, big fast ones higher', () => {
  assert.ok(Math.abs(swipePower(160, 100, 160) - 1) < 0.01);
  assert.ok(swipePower(70, 90, 160) < 0.9);
  assert.ok(swipePower(420, 120, 160) > 1.15);
  assert.ok(swipePower(5000, 10, 160) <= 1.28);
});

test('bots line up their planned entry with hold-to-rotate', () => {
  const rand = mulberry32(99);
  let checked = 0;
  let headFirstSeen = 0;
  for (let i = 0; i < 40; i++) {
    const compIndex = i % 4;
    const charge = 0.2 + rand() * 0.8;
    const { w, d } = airborne(compIndex, charge);
    const airTime = d.impactT;
    const target = 14 + rand() * 14;
    const dive = synthesizeBotDive({ targetTotal: target, airTime, rand });
    d.plan = makeBotPlan({ trickIds: dive.trickIds, q: dive.q, rand, airTime });
    // Planned error vs actual.
    const plannedErr = Math.abs(d.plan.entryAngleOffset);
    let impact = null;
    d.onEvent = (type, data) => { if (type === 'impact') impact = data; };
    step(w, airTime + 0.2);
    assert.ok(impact, 'bot reached the water');
    if (d.plan.aimTarget == null) continue; // ran out of time before aiming (rare, very short dives)
    checked++;
    if (impact.headFirst) headFirstSeen++;
    assert.ok(Math.abs(impact.angleErrDeg - plannedErr) < 12, `planned ${plannedErr.toFixed(1)} got ${impact.angleErrDeg.toFixed(1)} (${dive.trickIds.join(',')})`);
  }
  assert.ok(checked >= 30, `only ${checked} bots aimed`);
  assert.ok(headFirstSeen > 0, 'some bots go in head-first');
});
