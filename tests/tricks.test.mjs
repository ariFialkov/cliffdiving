import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { classifySwipe, segmentPath, StrokeBuffer } from '../src/tricks.js';

function line(x0, y0, x1, y1, n = 12) {
  return Array.from({ length: n + 1 }, (_, i) => ({ x: x0 + ((x1 - x0) * i) / n, y: y0 + ((y1 - y0) * i) / n }));
}
function jitter(pts, seed = 1) {
  let s = seed;
  const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280 - 0.5) * 4;
  return pts.map((p) => ({ x: p.x + r(), y: p.y + r() }));
}
const join = (a, b) => [...a, ...b.slice(1)];

test('straight swipes map to single tricks', () => {
  assert.equal(classifySwipe(line(100, 100, 100, 260)).trick, 'frontflip');
  assert.equal(classifySwipe(line(100, 300, 100, 120)).trick, 'backflip');
  assert.equal(classifySwipe(line(100, 100, 300, 100)).trick, 'corkscrew');
  assert.equal(classifySwipe(line(300, 100, 100, 100)).trick, 'corkscrew');
  assert.equal(classifySwipe(line(100, 100, 240, 240)).trick, 'sideflip');
  assert.equal(classifySwipe(line(240, 100, 100, 240)).trick, 'sideflip');
});

test('the modifier (Shift / second finger) selects the tucked variants', () => {
  assert.equal(classifySwipe(line(100, 100, 100, 260), { modifier: true }).trick, 'fronttuck');
  assert.equal(classifySwipe(line(100, 300, 100, 120), { modifier: true }).trick, 'backtuck');
  assert.equal(classifySwipe(line(100, 100, 300, 100), { modifier: true }).trick, 'corkscrew');
});

test('two-stroke swipes map to compound tricks', () => {
  const check = join(line(100, 100, 130, 240), line(130, 240, 170, 110));
  assert.equal(classifySwipe(jitter(check)).trick, 'jackknife');
  const ell = join(line(100, 100, 100, 240), line(100, 240, 260, 240));
  assert.equal(classifySwipe(jitter(ell)).trick, 'barani');
  const ellLeft = join(line(300, 100, 300, 240), line(300, 240, 140, 240));
  assert.equal(classifySwipe(ellLeft).trick, 'barani');
  const upDown = join(line(200, 300, 205, 140), line(205, 140, 210, 290));
  const g = classifySwipe(jitter(upDown, 7));
  assert.equal(g.trick, 'gainer');
  assert.equal(g.compound, true);
});

test('tiny or empty paths are rejected', () => {
  assert.equal(classifySwipe([]), null);
  assert.equal(classifySwipe([{ x: 0, y: 0 }, { x: 5, y: 5 }]), null);
  assert.deepEqual(segmentPath([{ x: 0, y: 0 }]), []);
});

test('StrokeBuffer combines two separate strokes inside the window', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const out = [];
    const buf = new StrokeBuffer((r) => out.push(r.trick), { windowMs: 170 });
    buf.push(line(100, 100, 130, 240));
    assert.deepEqual(out, [], 'a down stroke waits briefly for a second stroke');
    mock.timers.tick(90);
    buf.push(line(132, 238, 170, 110));
    assert.deepEqual(out, ['jackknife']);
    mock.timers.tick(500);
    assert.deepEqual(out, ['jackknife']);
  } finally {
    mock.timers.reset();
  }
});

test('StrokeBuffer emits a lone stroke after the window and sideways strokes at once', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const out = [];
    const buf = new StrokeBuffer((r) => out.push(r.trick), { windowMs: 170 });
    buf.push(line(100, 100, 300, 100));
    assert.deepEqual(out, ['corkscrew']);
    buf.push(line(100, 300, 100, 120));
    mock.timers.tick(169);
    assert.deepEqual(out, ['corkscrew']);
    mock.timers.tick(2);
    assert.deepEqual(out, ['corkscrew', 'backflip']);
    // Two strokes that don't form a compound both count.
    buf.push(line(100, 300, 100, 120));
    buf.push(line(100, 100, 300, 100));
    assert.deepEqual(out, ['corkscrew', 'backflip', 'backflip', 'corkscrew']);
    // ...while down + sideways inside the window is an L (barani).
    buf.push(line(100, 100, 100, 260));
    buf.push(line(100, 262, 260, 262));
    assert.deepEqual(out.at(-1), 'barani');
  } finally {
    mock.timers.reset();
  }
});

test('StrokeBuffer picks up a second finger that lands just after the stroke', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const out = [];
    const buf = new StrokeBuffer((r) => out.push(r.trick), { windowMs: 170 });
    buf.push(line(100, 100, 100, 260));
    buf.setModifier();
    mock.timers.tick(200);
    assert.deepEqual(out, ['fronttuck']);
  } finally {
    mock.timers.reset();
  }
});

test('touch strokes never merge: lifting the finger makes two separate tricks (combo material)', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const out = [];
    const buf = new StrokeBuffer((r) => out.push(r.trick), { windowMs: 90 });
    buf.push(line(100, 100, 100, 260), false, { pressed: true });
    buf.push(line(100, 262, 260, 262), false, { pressed: true });
    assert.deepEqual(out, ['frontflip', 'corkscrew']);
  } finally {
    mock.timers.reset();
  }
});

test('emitted swipes carry a power from their length and speed', () => {
  const out = [];
  const buf = new StrokeBuffer((r) => out.push(r), { refPx: 160 });
  buf.push(line(100, 100, 300, 100), false, { len: 200, ms: 60, pressed: true });
  buf.push(line(100, 100, 160, 100), false, { len: 60, ms: 120, pressed: true });
  assert.ok(out[0].power > 1.05 && out[1].power < 0.9, `${out[0].power} ${out[1].power}`);
});
