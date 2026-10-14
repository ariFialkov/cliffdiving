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

// Combination tricks: fire the second trick right after the first (while the
// first is still early) and the two merge into one bigger, higher-scoring trick.
const COMBO_DEFS = [
  { id: 'fronttwister', name: 'Front Twister', parts: ['frontflip', 'corkscrew'], difficulty: 3.2, duration: 0.98, flip: 1, twist: 1, roll: 0, shape: 'straight' },
  { id: 'backtwister', name: 'Back Twister', parts: ['backflip', 'corkscrew'], difficulty: 3.4, duration: 1.0, flip: -1, twist: 1, roll: 0, shape: 'layout' },
  { id: 'doublefront', name: 'Double Front', parts: ['fronttuck', 'fronttuck'], difficulty: 2.9, duration: 1.02, flip: 2, twist: 0, roll: 0, shape: 'tuck' },
  { id: 'doubleback', name: 'Double Back', parts: ['backtuck', 'backtuck'], difficulty: 3.2, duration: 1.08, flip: -2, twist: 0, roll: 0, shape: 'tuck' },
  { id: 'gainerfull', name: 'Gainer Full', parts: ['gainer', 'corkscrew'], difficulty: 3.6, duration: 1.04, flip: -1, twist: 1, roll: 0, shape: 'gainer' },
  { id: 'rudy', name: 'Rudy', parts: ['barani', 'corkscrew'], difficulty: 3.8, duration: 1.04, flip: 1, twist: 1.5, roll: 0, shape: 'straight' },
  { id: 'doublecork', name: 'Double Corkscrew', parts: ['corkscrew', 'corkscrew'], difficulty: 2.8, duration: 0.96, flip: 0, twist: 2, roll: 0, shape: 'twist' },
];
for (const c of COMBO_DEFS) {
  const [a, b] = c.parts.map((p) => TRICKS[p]);
  TRICKS[c.id] = {
    ...c, combo: true,
    gesture: a.id === b.id ? `${a.name} twice, quickly` : `${a.name} then ${b.name}, quickly (either order)`,
    arrow: a.id === b.id ? `${a.arrow}${a.arrow}` : `${a.arrow}+${b.arrow}`,
  };
}

export const TRICK_LIST = Object.values(TRICKS);
export const BASE_TRICKS = TRICK_LIST.filter((t) => !t.combo);
export const COMBO_TRICKS = TRICK_LIST.filter((t) => t.combo);
export const COMPOUND_TRICKS = new Set(['jackknife', 'barani', 'gainer']);

const COMBO_BY_PAIR = new Map();
for (const c of COMBO_TRICKS) {
  COMBO_BY_PAIR.set(`${c.parts[0]}+${c.parts[1]}`, c.id);
  COMBO_BY_PAIR.set(`${c.parts[1]}+${c.parts[0]}`, c.id);
}

/** The combination trick formed by `first` followed quickly by `second`, or null. */
export function comboFor(first, second) {
  return COMBO_BY_PAIR.get(`${first}+${second}`) ?? null;
}

/**
 * Swipe power from stroke length and speed: ~1.0 for an ordinary, confident
 * swipe; short/slow swipes under-rotate, long/fast ones over-rotate.
 * lenPx: stroke length; ms: active stroke time; refPx: a reference length
 * (about a fifth of the smaller screen dimension).
 */
export const POWER_MIN = 0.72;
export const POWER_MAX = 1.28;
export function swipePower(lenPx, ms, refPx) {
  if (!(lenPx > 0) || !(ms > 0) || !(refPx > 0)) return 1;
  const lenN = lenPx / refPx;
  const speedN = lenPx / ms / 1.6;
  const x = 0.6 * (lenN - 1) + 0.4 * (speedN - 1);
  return clamp(1 + 0.28 * Math.tanh(x), POWER_MIN, POWER_MAX);
}

function clamp(x, lo, hi) {
  return Math.min(hi, Math.max(lo, x));
}

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
 * Buffers finished hover strokes for a very short window so that a mouse ✓
 * or L with a brief stall at the corner still counts as one gesture. Two
 * strokes separated by a real gap (or any touch strokes, where lifting the
 * finger ends a stroke on purpose) stay separate, which is what makes
 * quick-fire combos (e.g. front flip then corkscrew) possible.
 */
export class StrokeBuffer {
  constructor(emit, { windowMs = 90, refPx = 160, setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = (id) => clearTimeout(id) } = {}) {
    this.emit = emit;
    this.windowMs = windowMs;
    this.refPx = refPx;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.pending = null;
  }

  out(result, len, ms) {
    if (!result) return;
    this.emit({ ...result, power: swipePower(len, ms, this.refPx) });
  }

  /** meta: { len, ms, pressed } */
  push(points, modifier = false, meta = {}) {
    const len = meta.len ?? pathLength(points);
    const ms = meta.ms ?? 120;
    if (this.pending) {
      const p = this.pending;
      this.clearTimer(p.timer);
      this.pending = null;
      if (!meta.pressed) {
        const merged = classifySwipe([...p.points, ...points], { modifier: p.modifier || modifier });
        if (merged && merged.compound) {
          this.out(merged, p.len + len, p.ms + ms);
          return;
        }
      }
      this.out(p.result, p.len, p.ms);
    }
    const result = classifySwipe(points, { modifier });
    if (!result) return;
    if (!meta.pressed && mayStartCompound(result)) {
      const timer = this.setTimer(() => this.flush(), this.windowMs);
      this.pending = { points, modifier, result, timer, len, ms };
    } else {
      this.out(result, len, ms);
    }
  }

  /** Upgrade a pending stroke's modifier (e.g. Shift pressed just after). */
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
    this.out(p.result, p.len, p.ms);
  }

  cancel() {
    if (this.pending) this.clearTimer(this.pending.timer);
    this.pending = null;
  }
}

export function pathLength(points) {
  let len = 0;
  for (let i = 1; i < points.length; i++) len += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  return len;
}
