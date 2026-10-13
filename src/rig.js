// Procedural stick-figure rig.
//
// The figure is a jointed skeleton (spine, neck, head, shoulders, elbows,
// hips, knees, ankles) whose bone angles are driven toward procedural pose
// targets by spring-damper dynamics. Limbs lag behind body rotation, get
// pushed by airflow in free fall, and go limp in the water, so the figure
// reacts to forces instead of snapping between poses. Hair is a set of
// verlet strands that stream, droop and whip with the head.
//
// Conventions (body-local frame, before the body's own rotation):
//   origin = hip, +x = forward (the diver faces +x), +y = down.
//   A bone angle θ is absolute in this frame: dir(θ) = (sin θ, cos θ), so
//   0 points down, 90° points forward, 180° points up, -90° points back.

const D2R = Math.PI / 180;
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const lerp = (a, b, t) => a + (b - a) * t;

export const BONES = {
  spine1: 0.27, // hip → chest
  spine2: 0.22, // chest → neck base
  neck: 0.05,
  headR: 0.115,
  upperArm: 0.27,
  forearm: 0.25,
  thigh: 0.42,
  shin: 0.4,
  foot: 0.1,
};

export const STANDING_HIP_HEIGHT = BONES.thigh + BONES.shin + 0.03;

const JOINTS = ['spine1', 'spine2', 'head', 'armFu', 'armFf', 'armBu', 'armBf', 'legFu', 'legFf', 'legBu', 'legBf', 'footF', 'footB'];
// F = front limb (nearer the viewer), B = back limb.

// ---- Pose library (degrees) -------------------------------------------------
const P = {
  stand: { spine1: 180, spine2: 180, head: 180, armFu: 8, armFf: 4, armBu: 6, armBf: 2, legFu: 2, legFf: 0, legBu: -2, legBf: 0, footF: 90, footB: 90 },
  peek: { spine1: 172, spine2: 158, head: 128, armFu: -28, armFf: -18, armBu: -34, armBf: -24, legFu: 10, legFf: -8, legBu: 6, legBf: -5, footF: 92, footB: 92 },
  hesitate: { spine1: 176, spine2: 166, head: 140, armFu: -40, armFf: -70, armBu: -36, armBf: -64, legFu: 12, legFf: -12, legBu: 8, legBf: -8, footF: 92, footB: 92 },
  crouch: { spine1: 150, spine2: 140, head: 150, armFu: -70, armFf: -78, armBu: -66, armBf: -74, legFu: 48, legFf: -54, legBu: 44, legBf: -50, footF: 90, footB: 90 },
  launch: { spine1: 172, spine2: 176, head: 176, armFu: 150, armFf: 165, armBu: 140, armBf: 158, legFu: 8, legFf: 6, legBu: 4, legBf: 2, footF: 18, footB: 14 },
  fall: { spine1: 180, spine2: 183, head: 178, armFu: 118, armFf: 128, armBu: -112, armBf: -124, legFu: 6, legFf: 4, legBu: -6, legBf: -4, footF: 14, footB: 12 },
  tuck: { spine1: 148, spine2: 118, head: 86, armFu: 112, armFf: 50, armBu: 108, armBf: 46, legFu: 152, legFf: -146, legBu: 146, legBf: -140, footF: 8, footB: 8 },
  pike: { spine1: 142, spine2: 116, head: 96, armFu: 150, armFf: 166, armBu: 146, armBf: 162, legFu: 164, legFf: 166, legBu: 160, legBf: 162, footF: 12, footB: 12 },
  layout: { spine1: 190, spine2: 196, head: 200, armFu: 196, armFf: 204, armBu: 192, armBf: 200, legFu: -6, legFf: -8, legBu: -10, legBf: -12, footF: 6, footB: 6 },
  twist: { spine1: 180, spine2: 182, head: 180, armFu: 176, armFf: 178, armBu: 184, armBf: 182, legFu: 2, legFf: 0, legBu: -2, legBf: 0, footF: 10, footB: 10 },
  lock: { spine1: 180, spine2: 180, head: 180, armFu: 180, armFf: 180, armBu: 180, armBf: 180, legFu: 1, legFf: 0, legBu: -1, legBf: 0, footF: 6, footB: 6 },
  limp: { spine1: 176, spine2: 168, head: 160, armFu: 150, armFf: 120, armBu: 160, armBf: 130, legFu: 12, legFf: -20, legBu: -8, legBf: -14, footF: 40, footB: 40 },
  swim: { spine1: 96, spine2: 92, head: 66, armFu: 120, armFf: 150, armBu: 40, armBf: 100, legFu: 100, legFf: 92, legBu: 86, legBf: 80, footF: 70, footB: 70 },
  hipsHands: { spine1: 180, spine2: 180, head: 180, armFu: -40, armFf: 60, armBu: -36, armBf: 56, legFu: 2, legFf: 0, legBu: -2, legBf: 0, footF: 90, footB: 90 },
  crossed: { spine1: 180, spine2: 180, head: 180, armFu: 50, armFf: -60, armBu: 44, armBf: -54, legFu: 2, legFf: 0, legBu: -2, legBf: 0, footF: 90, footB: 90 },
  stretch: { spine1: 180, spine2: 184, head: 184, armFu: 190, armFf: 196, armBu: 186, armBf: 192, legFu: 2, legFf: 0, legBu: -2, legBf: 0, footF: 90, footB: 90 },
};

function blend(a, b, t) {
  const out = {};
  for (const k of JOINTS) out[k] = lerp(a[k], b[k], t);
  return out;
}

// ---- Hair ------------------------------------------------------------------
export const HAIR_STYLES = {
  // strands: [rootAngle (deg around the head, 0 = top, + = toward the back), segments, segment length]
  // scalp: [front span, back span] in degrees of hair hugging the head.
  spiky: { strands: [[-38, 2, 0.05], [-12, 2, 0.06], [14, 2, 0.06], [40, 2, 0.05]], rest: 'out', stiff: 26, width: 0.04, scalp: [45, 65] },
  swept: { strands: [[-22, 2, 0.06], [8, 2, 0.07], [38, 2, 0.065]], rest: 'back', stiff: 18, width: 0.045, scalp: [30, 85] },
  ponytail: { strands: [[88, 4, 0.06]], rest: 'down', stiff: 5, width: 0.05, scalp: [50, 110] },
  mohawk: { strands: [[-32, 2, 0.07], [-11, 2, 0.085], [10, 2, 0.085], [31, 2, 0.07]], rest: 'up', stiff: 34, width: 0.045, scalp: [20, 40] },
  long: { strands: [[72, 4, 0.06], [100, 4, 0.06], [124, 3, 0.05]], rest: 'down', stiff: 4, width: 0.05, scalp: [60, 130] },
  curly: { strands: [[-42, 1, 0.045], [-14, 1, 0.05], [16, 1, 0.05], [46, 1, 0.045]], rest: 'out', stiff: 60, width: 0.085, scalp: [50, 75] },
  flat: { strands: [[-52, 1, 0.045]], rest: 'down', stiff: 30, width: 0.04, scalp: [48, 90] },
  bald: { strands: [], rest: 'up', stiff: 1, width: 0.04, scalp: null },
};

export const HAIR_COLORS = ['#2b1d12', '#7a4a1e', '#d9a441', '#1a1a1a', '#b03a2e', '#6b4f3f', '#e8c89a', '#3b2a5a'];

class Strand {
  constructor(rootAngleDeg, segments, segLen, style) {
    this.rootAngle = rootAngleDeg * D2R; // around the head: 0 = top, +ve = toward the back
    this.n = segments;
    this.len = segLen;
    this.style = style;
    this.pts = [];
    this.prev = [];
    this.init = false;
  }

  /** Rest direction (unit vector) from the head's up/forward vectors. */
  restDir(up, fwd, rootDir) {
    switch (this.style.rest) {
      case 'up':
        return { x: up.x * 0.9 + rootDir.x * 0.3, y: up.y * 0.9 + rootDir.y * 0.3 };
      case 'back':
        return { x: -fwd.x * 0.8 + up.x * 0.35, y: -fwd.y * 0.8 + up.y * 0.35 };
      case 'down':
        return { x: -fwd.x * 0.25, y: 0.95 }; // hangs with gravity, trailing behind
      default: // out: radial from the root
        return rootDir;
    }
  }

  update(dt, rootX, rootY, up, fwd, rootDir, headVx, headVy, inWater) {
    const rd = this.restDir(up, fwd, rootDir);
    const rl = Math.hypot(rd.x, rd.y) || 1;
    const ax0 = rd.x / rl;
    const ay0 = rd.y / rl;
    if (!this.init) {
      this.init = true;
      for (let i = 0; i <= this.n; i++) {
        this.pts.push({ x: rootX + ax0 * this.len * i, y: rootY + ay0 * this.len * i });
        this.prev.push({ x: this.pts[i].x, y: this.pts[i].y });
      }
    }
    const pts = this.pts;
    pts[0].x = rootX;
    pts[0].y = rootY;
    const stiff = this.style.stiff * (inWater ? 0.4 : 1);
    const drag = inWater ? 18 : 3.2;
    const g = inWater ? 0.4 : 4.5;
    const dt2 = dt * dt;
    for (let i = 1; i <= this.n; i++) {
      const p = pts[i];
      const pr = this.prev[i];
      let vx = (p.x - pr.x) / dt;
      let vy = (p.y - pr.y) / dt;
      // Spring toward the rest shape (radial from the root).
      const rx = rootX + ax0 * this.len * i;
      const ry = rootY + ay0 * this.len * i;
      let ax = (rx - p.x) * stiff * stiff * 0.08 + (-vx) * drag + 0;
      let ay = (ry - p.y) * stiff * stiff * 0.08 + (-vy) * drag + g;
      // Air streams past the head: push hair opposite to the head's motion.
      ax += -headVx * 2.2;
      ay += -headVy * 2.2;
      pr.x = p.x;
      pr.y = p.y;
      p.x += vx * dt * 0.985 + ax * dt2;
      p.y += vy * dt * 0.985 + ay * dt2;
    }
    // Distance constraints, two passes.
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 1; i <= this.n; i++) {
        const p0 = pts[i - 1];
        const p1 = pts[i];
        const dx = p1.x - p0.x;
        const dy = p1.y - p0.y;
        const d = Math.hypot(dx, dy) || 1e-6;
        const corr = (d - this.len) / d;
        if (i === 1) {
          p1.x -= dx * corr;
          p1.y -= dy * corr;
        } else {
          p0.x += dx * corr * 0.5;
          p0.y += dy * corr * 0.5;
          p1.x -= dx * corr * 0.5;
          p1.y -= dy * corr * 0.5;
        }
      }
      pts[0].x = rootX;
      pts[0].y = rootY;
    }
  }
}

// ---- Rig --------------------------------------------------------------------
export class Rig {
  constructor({ hairStyle = 'spiky', hairColor = '#2b1d12', idleStyle = 'stand' } = {}) {
    this.angles = {};
    this.vel = {};
    for (const k of JOINTS) {
      this.angles[k] = P.stand[k] * D2R;
      this.vel[k] = 0;
    }
    this.hairStyle = hairStyle;
    this.hairColor = hairColor;
    this.idleStyle = idleStyle;
    const style = HAIR_STYLES[hairStyle] ?? HAIR_STYLES.spiky;
    this.style = style;
    this.strands = style.strands.map(([ang, n, len]) => new Strand(ang, n, len, style));
    this.points = null;
    this.prevBodyAngle = null;
    this.bodyOmega = 0;
    this.prevHead = null;
    this.phase = Math.random() * 10;
    this.blink = 0;
    this.lastVy = 0;
  }

  setHair(hairStyle, hairColor) {
    this.hairStyle = hairStyle;
    this.hairColor = hairColor;
    this.style = HAIR_STYLES[hairStyle] ?? HAIR_STYLES.spiky;
    this.strands = this.style.strands.map(([ang, n, len]) => new Strand(ang, n, len, this.style));
  }

  /** Pose target + spring stiffness for the diver's current situation. */
  target(d, t) {
    const s = d.state;
    const ph = t * 2.2 + this.phase;
    let pose;
    let stiff = 14;
    switch (s) {
      case 'idle': {
        const base = P[this.idleStyle] ?? P.stand;
        pose = { ...base };
        // Weight shift and breathing.
        pose.spine2 += Math.sin(ph) * 1.5;
        pose.head += Math.sin(ph * 0.7) * 3;
        pose.legFf += Math.sin(ph * 0.5) * 2;
        stiff = 10;
        break;
      }
      case 'ready':
      case 'hesitate': {
        pose = { ...(s === 'ready' ? P.peek : P.hesitate) };
        // Nervous: knees tremble, head bobs looking down at the water.
        const tremble = Math.sin(t * 30 + this.phase) * 1.6;
        pose.legFf += tremble;
        pose.legBf -= tremble;
        pose.head += Math.sin(ph * 1.3) * 6;
        pose.spine2 += Math.sin(ph * 0.9) * 2;
        pose.armFf += Math.sin(t * 9) * 5;
        stiff = 12;
        break;
      }
      case 'walking': {
        const w = t * 8.5 + this.phase;
        const sw = Math.sin(w);
        const lift = Math.max(0, Math.sin(w + 0.4));
        const liftB = Math.max(0, Math.sin(w + Math.PI + 0.4));
        pose = { ...P.stand };
        pose.spine1 = 177;
        pose.spine2 = 178;
        pose.legFu = 24 * sw;
        pose.legFf = pose.legFu - 55 * lift;
        pose.legBu = -24 * sw;
        pose.legBf = pose.legBu - 55 * liftB;
        pose.footF = 90 + 25 * lift;
        pose.footB = 90 + 25 * liftB;
        pose.armFu = -22 * sw;
        pose.armFf = pose.armFu + 18;
        pose.armBu = 22 * sw;
        pose.armBf = pose.armBu + 18;
        stiff = 18;
        break;
      }
      case 'crouch': {
        const k = clamp(d.stateT / 0.16, 0, 1);
        pose = blend(P.peek, P.crouch, k);
        stiff = 22;
        break;
      }
      case 'launch': {
        const k = clamp(d.stateT / 0.12, 0, 1);
        pose = blend(P.crouch, P.launch, k);
        stiff = 30;
        break;
      }
      case 'airborne': {
        pose = this.airPose(d);
        stiff = d.current ? 24 : d.locked ? 26 : 12;
        break;
      }
      case 'entering': {
        const k = clamp(d.stateT / 0.5, 0, 1);
        const entry = d.entryAngleErr < 25 ? P.lock : P.limp;
        pose = blend(entry, P.limp, k);
        stiff = 5;
        break;
      }
      case 'surfacing': {
        const k = clamp(d.stateT / 0.6, 0, 1);
        pose = blend(P.limp, P.swim, k);
        stiff = 9;
        break;
      }
      case 'swimming': {
        const w = t * 7 + this.phase;
        pose = { ...P.swim };
        // Crawl: arms alternate, legs flutter.
        pose.armFu = 110 + 70 * Math.sin(w);
        pose.armFf = pose.armFu + 40 + 30 * Math.cos(w);
        pose.armBu = 110 + 70 * Math.sin(w + Math.PI);
        pose.armBf = pose.armBu + 40 + 30 * Math.cos(w + Math.PI);
        pose.legFu = 96 + 12 * Math.sin(w * 1.6);
        pose.legFf = pose.legFu - 10 + 18 * Math.sin(w * 1.6 - 0.8);
        pose.legBu = 96 - 12 * Math.sin(w * 1.6);
        pose.legBf = pose.legBu - 10 - 18 * Math.sin(w * 1.6 - 0.8);
        pose.head = 70 + 8 * Math.sin(w * 0.5);
        stiff = 14;
        break;
      }
      default:
        pose = { ...P.stand };
    }
    return { pose, stiff };
  }

  airPose(d) {
    if (d.current) {
      const c = d.current;
      const p = clamp(c.t / c.trick.duration, 0, 1);
      // Fold in and kick out smoothly around the middle of the trick.
      const fold = Math.sin(Math.PI * p) ** 0.8;
      let shape;
      switch (c.trick.shape) {
        case 'tuck':
        case 'side':
          shape = P.tuck;
          break;
        case 'pike':
          shape = P.pike;
          break;
        case 'layout':
          shape = P.layout;
          break;
        default:
          shape = P.twist;
      }
      return blend(P.fall, shape, fold);
    }
    if (d.locked) {
      const left = d.impactT - d.airT;
      const k = clamp((0.5 - left) / 0.35, 0, 1);
      const pose = { ...P.lock };
      // Arms sweep overhead first, then stay tight; a late lock looks rushed.
      pose.armFu = lerp(150, 180, k);
      pose.armBu = lerp(-150, 180, Math.min(1, k * 1.3));
      pose.armFf = pose.armFu + 2;
      pose.armBf = pose.armBu + 2;
      return pose;
    }
    // Free fall: arms spread, drifting up with airflow; legs apart a touch.
    const pose = { ...P.fall };
    const air = clamp(d.vy * 4, 0, 40);
    pose.armFu += air * 0.5;
    pose.armFf += air;
    pose.armBu -= air * 0.5;
    pose.armBf -= air;
    pose.legFu += Math.sin(d.airT * 5) * 3;
    pose.legBu -= Math.sin(d.airT * 5) * 3;
    return pose;
  }

  update(dt, d, env, t) {
    const { pose, stiff } = this.target(d, t);
    // Body angular velocity → limbs lag behind the rotation.
    const bodyAngle = d.angle * D2R;
    if (this.prevBodyAngle == null) this.prevBodyAngle = bodyAngle;
    const omega = (bodyAngle - this.prevBodyAngle) / Math.max(dt, 1e-4);
    this.bodyOmega = lerp(this.bodyOmega, omega, Math.min(1, dt * 20));
    this.prevBodyAngle = bodyAngle;
    const lagArm = d.state === 'airborne' && !d.current ? 0.045 : 0.018;
    const lagLeg = 0.012;
    // Impact jolt: a sudden change in vertical speed flings the limbs.
    const jolt = clamp((this.lastVy - d.vy) * 0.25, -3, 3);
    this.lastVy = d.vy;

    const zeta = d.state === 'entering' || d.state === 'surfacing' ? 1.1 : 0.72;
    for (const k of JOINTS) {
      let tgt = pose[k] * D2R;
      if (k.startsWith('arm')) tgt -= this.bodyOmega * lagArm;
      else if (k.startsWith('leg') || k.startsWith('foot')) tgt -= this.bodyOmega * lagLeg;
      const w = stiff;
      const acc = w * w * (tgt - this.angles[k]) - 2 * zeta * w * this.vel[k];
      this.vel[k] += acc * dt;
      if (Math.abs(jolt) > 0.05 && (k.startsWith('arm') || k === 'head' || k === 'spine2')) this.vel[k] += jolt * (k === 'head' ? 1.2 : 0.8);
      this.angles[k] += this.vel[k] * dt;
    }
    this.computePoints(d);
    // Hair.
    const head = this.points.headC;
    const hvx = this.prevHead ? (head.x - this.prevHead.x) / dt : 0;
    const hvy = this.prevHead ? (head.y - this.prevHead.y) / dt : 0;
    this.prevHead = { x: head.x, y: head.y };
    const inWater = d.state === 'entering' || d.state === 'surfacing' || d.state === 'swimming';
    const { headUp: up, headFwd: fwd } = this.points;
    for (const st of this.strands) {
      // Root sits on the scalp: rotate "up" toward the back by the root angle.
      const c = Math.cos(st.rootAngle);
      const sn = Math.sin(st.rootAngle);
      const rootDir = { x: up.x * c - fwd.x * sn, y: up.y * c - fwd.y * sn };
      const rx = head.x + rootDir.x * BONES.headR * 0.95;
      const ry = head.y + rootDir.y * BONES.headR * 0.95;
      st.update(dt, rx, ry, up, fwd, rootDir, hvx, hvy, inWater);
    }
    // Blink timer.
    this.blink -= dt;
    if (this.blink < -3 - Math.random() * 3) this.blink = 0.12;
    void env;
  }

  /** Forward kinematics: world-space joint positions in metres. */
  computePoints(d) {
    const a = this.angles;
    const bodyAngle = d.angle * D2R;
    const twistScale = d.twist ? Math.cos(d.twist * 2 * Math.PI) : 1;
    const sx = Math.sign(twistScale || 1) * Math.max(0.3, Math.abs(twistScale));
    const cosB = Math.cos(bodyAngle);
    const sinB = Math.sin(bodyAngle);
    const toWorld = (lx, ly) => {
      const x = lx * sx;
      const y = ly;
      return { x: d.x + x * cosB - y * sinB, y: d.y + x * sinB + y * cosB };
    };
    const step = (p, ang, len) => ({ x: p.x + Math.sin(ang) * len, y: p.y + Math.cos(ang) * len });
    const hip = { x: 0, y: 0 };
    const chest = step(hip, a.spine1, BONES.spine1);
    const neck = step(chest, a.spine2, BONES.spine2);
    const headC = step(neck, a.head, BONES.neck + BONES.headR);
    const shoulder = step(chest, a.spine2, BONES.spine2 * 0.92);
    const elbF = step(shoulder, a.armFu, BONES.upperArm);
    const wrF = step(elbF, a.armFf, BONES.forearm);
    const elbB = step(shoulder, a.armBu, BONES.upperArm);
    const wrB = step(elbB, a.armBf, BONES.forearm);
    const kneeF = step(hip, a.legFu, BONES.thigh);
    const ankF = step(kneeF, a.legFf, BONES.shin);
    const toeF = step(ankF, a.footF, BONES.foot);
    const kneeB = step(hip, a.legBu, BONES.thigh);
    const ankB = step(kneeB, a.legBf, BONES.shin);
    const toeB = step(ankB, a.footB, BONES.foot);
    const local = { hip, chest, neck, headC, shoulder, elbF, wrF, elbB, wrB, kneeF, ankF, toeF, kneeB, ankB, toeB };
    const world = {};
    for (const k in local) world[k] = toWorld(local[k].x, local[k].y);
    // Head orientation in world space: unit "up" (crown) and "forward" (face) vectors.
    const facing = sx < 0 ? -1 : 1;
    const th = facing * a.head - bodyAngle;
    const up = { x: Math.sin(th), y: Math.cos(th) };
    world.headUp = up;
    world.headFwd = { x: -up.y * facing, y: up.x * facing };
    world.facing = facing;
    world.local = local;
    this.points = world;
    return world;
  }
}

export { P as POSES, JOINTS };
