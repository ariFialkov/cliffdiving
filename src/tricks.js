// Trick catalog and swipe-path classifier.

export const TRICKS = {
  fronttuck: {
    id: 'fronttuck',
    name: 'Front Tuck',
    difficulty: 1.0,
    duration: 0.62,
    flip: 1, // forward somersaults
    twist: 0,
    shape: 'tuck',
    gesture: 'Swipe down',
    arrow: '↓',
  },
  gainer: {
    id: 'gainer',
    name: 'Gainer',
    difficulty: 1.4,
    duration: 0.72,
    flip: -1, // backward somersault
    twist: 0,
    shape: 'layout',
    gesture: 'Swipe up',
    arrow: '↑',
  },
  corkscrew: {
    id: 'corkscrew',
    name: 'Corkscrew',
    difficulty: 1.2,
    duration: 0.55,
    flip: 0,
    twist: 1,
    shape: 'straight',
    gesture: 'Swipe left or right',
    arrow: '↔',
  },
  sideflip: {
    id: 'sideflip',
    name: 'Sideflip',
    difficulty: 1.3,
    duration: 0.66,
    flip: 1,
    twist: 0.5,
    shape: 'side',
    gesture: 'Swipe diagonally down',
    arrow: '↘',
  },
  jackknife: {
    id: 'jackknife',
    name: 'Jackknife',
    difficulty: 0.8,
    duration: 0.6,
    flip: 0,
    twist: 0,
    shape: 'pike',
    gesture: 'Swipe down, then up (a ✓)',
    arrow: '✓',
  },
  barani: {
    id: 'barani',
    name: 'Barani',
    difficulty: 1.7,
    duration: 0.8,
    flip: 1,
    twist: 0.5,
    shape: 'tuck',
    gesture: 'Swipe down, then sideways (an L)',
    arrow: '↳',
  },
};

export const TRICK_LIST = Object.values(TRICKS);

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
    const dx = points[i].x - last.x;
    const dy = points[i].y - last.y;
    if (Math.hypot(dx, dy) >= sampleLen) pts.push(points[i]);
  }
  const tail = points[points.length - 1];
  const lastPt = pts[pts.length - 1];
  if (lastPt !== tail && Math.hypot(tail.x - lastPt.x, tail.y - lastPt.y) > sampleLen * 0.4) pts.push(tail);
  if (pts.length < 2) return [];

  const segs = [];
  let start = pts[0];
  let prevAngle = null;
  let runDx = 0;
  let runDy = 0;
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i - 1].x;
    const dy = pts[i].y - pts[i - 1].y;
    const a = angleDeg(dx, dy);
    if (prevAngle !== null && angleDiff(a, prevAngle) > turnDeg) {
      segs.push({ dx: runDx, dy: runDy, len: Math.hypot(runDx, runDy), angle: angleDeg(runDx, runDy) });
      start = pts[i - 1];
      runDx = 0;
      runDy = 0;
    }
    runDx += dx;
    runDy += dy;
    // Smooth the reference direction over the current run.
    prevAngle = angleDeg(runDx, runDy);
  }
  segs.push({ dx: runDx, dy: runDy, len: Math.hypot(runDx, runDy), angle: angleDeg(runDx, runDy) });
  void start;
  return segs.filter((s) => s.len >= minSeg);
}

function dirOf(angle) {
  // 8-way direction from an angle in degrees (screen space).
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

const SINGLE = {
  down: 'fronttuck',
  up: 'gainer',
  upleft: 'gainer',
  upright: 'gainer',
  left: 'corkscrew',
  right: 'corkscrew',
  downleft: 'sideflip',
  downright: 'sideflip',
};

/**
 * Classify a swipe into a trick id (or null if the swipe is too small).
 * Returns { trick, dirs } where dirs is the stroke direction list.
 */
export function classifySwipe(points, opts) {
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
    const downish = (d) => d === 'down' || d === 'downleft' || d === 'downright';
    const upish = (d) => d === 'up' || d === 'upleft' || d === 'upright';
    const sideish = (d) => d === 'left' || d === 'right';
    if (downish(a) && upish(b)) return { trick: 'jackknife', dirs };
    if (downish(a) && sideish(b)) return { trick: 'barani', dirs };
  }
  return { trick: SINGLE[dirs[0]] ?? 'fronttuck', dirs };
}
