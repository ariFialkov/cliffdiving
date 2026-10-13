import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Diver, World, entryTilt } from '../src/world.js';
import { COMPETITIONS } from '../src/odds.js';

function makeWorld() {
  const w = new World();
  w.setCompetition(COMPETITIONS[0]);
  return w;
}

function finite(p) {
  return Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
}

function run(world, diver, seconds, dt = 1 / 60, each) {
  for (let t = 0; t < seconds; t += dt) {
    world.update(dt);
    each?.(diver);
  }
}

test('a full dive (charge, trick, lock, entry, swim) keeps every joint finite', () => {
  const w = makeWorld();
  const d = new Diver({ id: 'p', name: 'P', color: '#f00', isPlayer: true, x: -0.3, hairStyle: 'flame' });
  d.setState('ready');
  w.divers.push(d);
  run(w, d, 0.3);
  d.startCharge();
  run(w, d, 0.6);
  d.release();
  run(w, d, 0.4);
  assert.equal(d.state, 'airborne');
  d.queueTrick('sideflip');
  d.queueTrick('corkscrew');
  let checked = 0;
  run(w, d, 8, 1 / 60, (x) => {
    if (x.state === 'airborne' && !x.locked && x.impactT - x.airT < 0.2) x.lock();
    if (x.state === 'gone') return;
    for (const [k, p] of Object.entries(x.rig.points)) {
      if (p && typeof p === 'object' && 'z' in p) {
        assert.ok(finite(p), `${k} not finite in ${x.state}`);
        checked++;
      }
    }
    for (const n of x.rig.hair.nodes ?? []) assert.ok(Number.isFinite(n.x) && Number.isFinite(n.y));
  });
  assert.ok(checked > 1000);
});

test('a longer charge gives a higher, longer jump', () => {
  const w = makeWorld();
  assert.ok(w.airTimeFor(1) > w.airTimeFor(0) + 0.5);
  const peaks = [0, 1].map((charge) => {
    const d = new Diver({ id: 'p', name: 'P', color: '#f00', x: -0.3 });
    d.setState('ready');
    const ww = makeWorld();
    ww.divers.push(d);
    d.startCharge(charge);
    let minY = Infinity;
    run(ww, d, 1.8, 1 / 120, (x) => { minY = Math.min(minY, x.y); });
    return minY;
  });
  assert.ok(peaks[1] < peaks[0] - 1.0, `full charge peak ${peaks[1]} vs tap ${peaks[0]}`);
});

test('while swimming the legs trail behind the head (no folded body)', () => {
  const w = makeWorld();
  const d = new Diver({ id: 'p', name: 'P', color: '#f00', x: -0.3 });
  d.setState('ready');
  w.divers.push(d);
  d.startCharge(0.5);
  run(w, d, 0.5);
  d.queueTrick('frontflip');
  let swimFrames = 0;
  run(w, d, 6, 1 / 60, (x) => {
    if (x.state === 'airborne' && !x.locked && x.impactT - x.airT < 0.2) x.lock();
    if (x.state !== 'swimming' || x.stateT < 0.4) return;
    const p = x.rig.points;
    const toHead = { x: p.headC.x - p.hip.x, y: p.headC.y - p.hip.y };
    for (const ank of [p.ankF, p.ankB]) {
      const toFoot = { x: ank.x - p.hip.x, y: ank.y - p.hip.y };
      const dot = toHead.x * toFoot.x + toHead.y * toFoot.y;
      assert.ok(dot < 0, 'legs must point away from the head');
    }
    assert.ok(Math.abs(toHead.y) < Math.abs(toHead.x), 'body is roughly horizontal');
    assert.ok(toHead.x > 0, 'swims head-first away from the cliff');
    swimFrames++;
  });
  assert.ok(swimFrames > 30);
});

test('mid-corkscrew the figure shows width (never a flat cut-out)', () => {
  const w = makeWorld();
  const d = new Diver({ id: 'p', name: 'P', color: '#f00', x: 0 });
  d.setState('ready');
  w.divers.push(d);
  d.startCharge(1);
  run(w, d, 1.2);
  d.queueTrick('corkscrew');
  let minWidth = Infinity;
  run(w, d, 0.6, 1 / 120, (x) => {
    if (!x.current) return;
    const p = x.rig.points;
    const xs = [p.wrF, p.wrB, p.ankF, p.ankB, p.elbF, p.elbB].map((q) => q.x);
    minWidth = Math.min(minWidth, Math.max(...xs) - Math.min(...xs));
  });
  assert.ok(minWidth > 0.12, `silhouette collapsed to ${minWidth.toFixed(3)} m`);
});

test('mid-sideflip the head passes in front of the legs, then behind them', () => {
  const w = makeWorld();
  const d = new Diver({ id: 'p', name: 'P', color: '#f00', x: 0 });
  d.setState('ready');
  w.divers.push(d);
  d.startCharge(1);
  run(w, d, 1.2);
  d.queueTrick('sideflip');
  const order = [];
  run(w, d, 0.8, 1 / 120, (x) => {
    if (!x.current) return;
    const p = x.rig.points;
    const legZ = (p.ankF.z + p.ankB.z) / 2;
    const who = p.headC.z > legZ + 0.25 ? 'head' : legZ > p.headC.z + 0.25 ? 'legs' : null;
    if (who && order.at(-1) !== who) order.push(who);
  });
  assert.deepEqual(order, ['head', 'legs'], 'head comes toward the camera first, then the legs');
});

test('entry tilt combines pitch and roll', () => {
  assert.equal(Math.round(entryTilt(0, 0)), 0);
  assert.equal(Math.round(entryTilt(180, 0)), 0);
  assert.equal(Math.round(entryTilt(0, 0.5)), 0);
  assert.equal(Math.round(entryTilt(90, 0)), 90);
  assert.equal(Math.round(entryTilt(0, 0.25)), 90);
  assert.equal(Math.round(entryTilt(30, 0)), 30);
});
