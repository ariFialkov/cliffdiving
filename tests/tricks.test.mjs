import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifySwipe, segmentPath } from '../src/tricks.js';

function line(x0, y0, x1, y1, n = 12) {
  return Array.from({ length: n + 1 }, (_, i) => ({ x: x0 + ((x1 - x0) * i) / n, y: y0 + ((y1 - y0) * i) / n }));
}
function jitter(pts, seed = 1) {
  let s = seed;
  const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280 - 0.5) * 4;
  return pts.map((p) => ({ x: p.x + r(), y: p.y + r() }));
}

test('straight swipes map to single tricks', () => {
  assert.equal(classifySwipe(line(100, 100, 100, 260)).trick, 'fronttuck');
  assert.equal(classifySwipe(line(100, 300, 100, 120)).trick, 'gainer');
  assert.equal(classifySwipe(line(100, 100, 300, 100)).trick, 'corkscrew');
  assert.equal(classifySwipe(line(300, 100, 100, 100)).trick, 'corkscrew');
  assert.equal(classifySwipe(line(100, 100, 240, 240)).trick, 'sideflip');
  assert.equal(classifySwipe(line(240, 100, 100, 240)).trick, 'sideflip');
});

test('two-stroke swipes map to compound tricks', () => {
  const check = [...line(100, 100, 130, 240), ...line(130, 240, 170, 110).slice(1)];
  assert.equal(classifySwipe(jitter(check)).trick, 'jackknife');
  const ell = [...line(100, 100, 100, 240), ...line(100, 240, 260, 240).slice(1)];
  assert.equal(classifySwipe(jitter(ell)).trick, 'barani');
  const ellLeft = [...line(300, 100, 300, 240), ...line(300, 240, 140, 240).slice(1)];
  assert.equal(classifySwipe(ellLeft).trick, 'barani');
});

test('tiny or empty paths are rejected', () => {
  assert.equal(classifySwipe([]), null);
  assert.equal(classifySwipe([{ x: 0, y: 0 }, { x: 5, y: 5 }]), null);
  assert.deepEqual(segmentPath([{ x: 0, y: 0 }]), []);
});
