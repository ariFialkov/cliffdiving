// Trick catalogue, swipe-path classifier and the stroke buffer that lets
// two separate strokes combine into one compound gesture.

export const TRICKS = {
  frontflip: {
    id: 'frontflip', name: 'Front Flip', difficulty: 1.2, duration: 0.7,
    flip: 1, twist: 0, roll: 0, shape: 'straight',
    gesture: 'Swipe down', arrow: '↓',
  },
  fronttuck: {
    id: 'fronttuck', name: 'Front Tuck', difficulty: 1.0, duration: 0.6,
    flip: 1, twist: 0, roll: 0, shape: 'tuck',
    gesture: 'Shift + swipe down (2nd finger held on mobile)', arrow: '⇓',
  },
  backflip: {
    id: 'backflip', name: 'Backflip', difficulty: 1.4, duration: 0.74,
    flip: -1, twist: 0, roll: 0, shape: 'layout',
    gesture: 'Swipe up', arrow: '↑',
  },
  backtuck: {
    id: 'backtuck', name: 'Back Tuck', difficulty: 1.2, duration: 0.64,
    flip: -1, twist: 0, roll: 0, shape: 'tuck',
    gesture: 'Shift + swipe up (2nd finger held on mobile)', arrow: '⇑',
  },
  gainer: {
    id: 'gainer', name: 'Gainer', difficulty: 1.6, duration: 0.84,
    flip: -1, twist: 0, roll: 0, shape: 'gainer',
    gesture: 'Swipe up then down in one stroke', arrow: '↕',
  },
  corkscrew: {
    id: 'corkscrew', name: 'Corkscrew', difficulty: 1.3, duration: 0.66,
    flip: 0, twist: 1, roll: 0, shape: 'twist',
    gesture: 'Swipe left or right', arrow: '↔',
  },
  sideflip: {
    id: 'sideflip', name: 'Sideflip', difficulty: 1.3, duration: 0.68,
    flip: 0, twist: 0, roll: 1, shape: 'tuck',
    gesture: 'Swipe diagonally down', arrow: '↘',
  },
  jackknife: {
    id: 'jackknife', name: 'Jackknife', difficulty: 0.8, duration: 0.6,
    flip: 0, twist: 0, roll: 0, shape: 'pike',
    gesture: 'Swipe down then up (a ✓)', arrow: '✓',
  },
  barani: {
    id: 'barani', name: 'Barani', difficulty: 1.7, duration: 0.8,
    flip: 1, twist: 0.5, roll: 0, shape: 'tuck',
    gesture: 'Swipe down then sideways (an L)', arrow: '↳',
  },
};

export const TRICK_LIST = Object.values(TRICKS);
export const COMPOUND_TRICKS = new Set(['jackknife', 'barani', 'gainer']);

/** Difficulty of a sequence; later tricks are worth a little more (combo). */
export function sequenceDifficulty(trickIds) {
  return trickIds.reduce((acc, id, i) => acc + TRICKS[id].difficulty * (1 + 0.15 * i), 0);
}

export function sequenceDuration(trickIds) {
  return trickIds.reduce((acc, id) => acc + TRICKS[id].duration, 0);
}

// ---- Swipe classification -------------------------------------------------

function angleDeg(dx, dy) {
  // Screen coordinates: +y is down. 0° = right, 90° = down, 180° = left, -90° = up.
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return Math.abs(d);
}

/**
 * Break a swipe path into straight strokes.
 * points: [{x, y}] in screen px. Returns [{dx, dy, len, angle}].
 */
export function segmentPath(points, opts = {}) {
  const sampleLen = opts.sampleLen ?? 10;
  const turnDeg = opts.turnDeg ?? 55;
  const minSeg = opts.minSeg ?? 22;
  if (points.length < 2) return [];

  // Resample to roughly uniform spacing to remove jitter.
  const pts = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const last = pts[pts.length - 1];
    if (Math.hypot(points[i].x - last.x, points[i].y - last.y) >= sampleLen) pts.push(points[i]);
  }
  const tail = points[points.length - 1];
  const lastPt = pts[pts.length - 1];
  if (lastPt !== tail && Math.hypot(tail.x - lastPt.x, tail.y - lastPt.y) > sampleLen * 0.4) pts.push(tail);
  if (pts.length < 2) return [];

  const segs = [];
  let prevAngle = null;
  let runDx = 0;
  let runDy = 0;
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i - 1].x;
    const dy = pts[i].y - pts[i - 1].y;
    const a = angleDeg(dx, dy);
    if (prevAngle !== null && angleDiff(a, prevAngle) > turnDeg) {
      segs.push({ dx: runDx, dy: runDy, len: Math.hypot(runDx, runDy), angle: angleDeg(runDx, runDy) });
      runDx = 0;
      runDy = 0;
    }
    runDx += dx;
    runDy += dy;
    prevAngle = angleDeg(runDx, runDy);
  }
  segs.push({ dx: runDx, dy: runDy, len: Math.hypot(runDx, runDy), angle: angleDeg(runDx, runDy) });
  return segs.filter((s) => s.len >= minSeg);
}

function dirOf(angle) {
  const a = ((angle % 360) + 360) % 360;
  if (a >= 337.5 || a < 22.5) return 'right';
  if (a < 67.5) return 'downright';
  if (a < 112.5) return 'down';
  if (a < 157.5) return 'downleft';
  if (a < 202.5) return 'left';
  if (a < 247.5) return 'upleft';
  if (a < 292.5) return 'up';
  return 'upright';
}

const downish = (d) => d === 'down' || d === 'downleft' || d === 'downright';
const upish = (d) => d === 'up' || d === 'upleft' || d === 'upright';
const sideish = (d) => d === 'left' || d === 'right';

function singleTrick(dir, modifier) {
  if (dir === 'down') return modifier ? 'fronttuck' : 'frontflip';
  if (upish(dir)) return modifier ? 'backtuck' : 'backflip';
  if (sideish(dir)) return 'corkscrew';
  return 'sideflip'; // downleft / downright
}

/**
 * Classify a swipe into a trick. Returns { trick, dirs, compound } or null.
 * opts.modifier: Shift held / second finger down during the swipe.
 */
export function classifySwipe(points, opts = {}) {
  const segs = segmentPath(points, opts);
  if (segs.length === 0) return null;
  // Keep the two longest strokes, in path order.
  let chosen = segs;
  if (segs.length > 2) {
    const idx = segs
      .map((s, i) => ({ i, len: s.len }))
      .sort((a, b) => b.len - a.len)
      .slice(0, 2)
      .map((o) => o.i)
      .sort((a, b) => a - b);
    chosen = idx.map((i) => segs[i]);
  }
  const dirs = chosen.map((s) => dirOf(s.angle));
  if (dirs.length === 2) {
    const [a, b] = dirs;
    if (downish(a) && upish(b)) return { trick: 'jackknife', dirs, compound: true };
    if (downish(a) && sideish(b)) return { trick: 'barani', dirs, compound: true };
    if (upish(a) && downish(b)) return { trick: 'gainer', dirs, compound: true };
  }
  // Not a recognised pair: the longer stroke decides.
  const main = chosen.length === 2 && chosen[1].len > chosen[0].len * 1.3 ? dirs[1] : dirs[0];
  return { trick: singleTrick(main, !!opts.modifier), dirs, compound: false };
}

/** Could this single stroke be the first half of a compound gesture? */
function mayStartCompound(result) {
  if (!result || result.compound || result.dirs.length !== 1) return false;
  return downish(result.dirs[0]) || upish(result.dirs[0]);
}

/**
 * Buffers finished strokes for a short window so that two separate strokes
 * (e.g. a ✓ drawn with a pause or lift at the corner) still combine into a
 * compound trick. Straight-through compound strokes emit immediately.
 */
export class StrokeBuffer {
  constructor(emit, { windowMs = 170, setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = (id) => clearTimeout(id) } = {}) {
    this.emit = emit;
    this.windowMs = windowMs;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.pending = null;
  }

  push(points, modifier = false) {
    if (this.pending) {
      const p = this.pending;
      this.clearTimer(p.timer);
      this.pending = null;
      const merged = classifySwipe([...p.points, ...points], { modifier: p.modifier || modifier });
      if (merged && merged.compound) {
        this.emit(merged);
        return;
      }
      this.emit(p.result);
    }
    const result = classifySwipe(points, { modifier });
    if (!result) return;
    if (mayStartCompound(result)) {
      const timer = this.setTimer(() => this.flush(), this.windowMs);
      this.pending = { points, modifier, result, timer };
    } else {
      this.emit(result);
    }
  }

  /** Upgrade a pending stroke's modifier (e.g. 2nd finger lands just after). */
  setModifier() {
    if (!this.pending || this.pending.modifier) return;
    this.pending.modifier = true;
    this.pending.result = classifySwipe(this.pending.points, { modifier: true });
  }

  flush() {
    if (!this.pending) return;
    const p = this.pending;
    this.clearTimer(p.timer);
    this.pending = null;
    this.emit(p.result);
  }

  cancel() {
    if (this.pending) this.clearTimer(this.pending.timer);
    this.pending = null;
  }
}
