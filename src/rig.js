// Procedural stick-figure rig.
//
// The skeleton is posed in the body's sagittal plane (x forward, y down,
// origin at the hip) with bone angles driven toward procedural pose targets
// by spring-damper joints, so limbs settle, overshoot slightly and lag behind
// body rotation instead of snapping. Limbs also carry a small lateral (z)
// offset, which lets the whole figure be rotated in 3D:
//   yaw   (twist) about the body's long axis   → corkscrews, barani half-twist
//   roll           about the body's forward axis → sideflips
//   pitch          about the camera axis         → flips
// and projected orthographically, with depth used for draw order. Seen
// face-on the figure shows splayed arms and legs, so a spin never collapses
// into a flat cut-out.
//
// A bone angle θ uses dir(θ) = (sin θ, cos θ): 0 points down (toward the
// feet), 90 forward, 180 up, -90 back.

const D2R = Math.PI / 180;
const TAU = Math.PI * 2;
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const lerp = (a, b, t) => a + (b - a) * t;

export const BONES = {
  spine1: 0.27, // hip → chest
  spine2: 0.22, // chest → neck base
  neck: 0.04,
  headR: 0.165,
  upperArm: 0.27,
  forearm: 0.25,
  thigh: 0.42,
  shin: 0.4,
  foot: 0.1,
};

// Lateral offsets (metres) used when the figure turns toward the camera.
const LAT = { elbow: 0.11, wrist: 0.15, knee: 0.07, ankle: 0.085 };

export const LEG_LENGTH = BONES.thigh + BONES.shin;
export const STANDING_HIP_HEIGHT = LEG_LENGTH + 0.03;

export const JOINTS = ['spine1', 'spine2', 'head', 'armFu', 'armFf', 'armBu', 'armBf', 'legFu', 'legFf', 'legBu', 'legBf', 'footF', 'footB'];
// F = the limb nearer the camera in profile, B = the far limb.

// ---- Pose library (degrees) -------------------------------------------------
export const POSES = {
  stand: { spine1: 180, spine2: 180, head: 180, armFu: 8, armFf: 4, armBu: 6, armBf: 2, legFu: 2, legFf: 0, legBu: -2, legBf: 0, footF: 90, footB: 90 },
  peek: { spine1: 172, spine2: 158, head: 128, armFu: -28, armFf: -18, armBu: -34, armBf: -24, legFu: 10, legFf: -8, legBu: 6, legBf: -5, footF: 92, footB: 92 },
  hesitate: { spine1: 176, spine2: 166, head: 140, armFu: -40, armFf: -70, armBu: -36, armBf: -64, legFu: 12, legFf: -12, legBu: 8, legBf: -8, footF: 92, footB: 92 },
  crouch: { spine1: 160, spine2: 150, head: 140, armFu: -45, armFf: -40, armBu: -50, armBf: -46, legFu: 42, legFf: -46, legBu: 38, legBf: -42, footF: 90, footB: 90 },
  crouchDeep: { spine1: 140, spine2: 134, head: 150, armFu: -125, armFf: -115, armBu: -120, armBf: -110, legFu: 72, legFf: -60, legBu: 68, legBf: -56, footF: 90, footB: 90 },
  launch: { spine1: 176, spine2: 180, head: 182, armFu: 160, armFf: 170, armBu: 150, armBf: 162, legFu: -4, legFf: -6, legBu: -8, legBf: -10, footF: 14, footB: 10 },
  fall: { spine1: 180, spine2: 183, head: 178, armFu: 118, armFf: 128, armBu: -112, armBf: -124, legFu: 6, legFf: 4, legBu: -6, legBf: -4, footF: 14, footB: 12 },
  tuck: { spine1: 150, spine2: 122, head: 100, armFu: 112, armFf: 40, armBu: 106, armBf: 34, legFu: 136, legFf: -40, legBu: 130, legBf: -36, footF: -30, footB: -26 },
  pike: { spine1: 142, spine2: 116, head: 96, armFu: 150, armFf: 166, armBu: 146, armBf: 162, legFu: 164, legFf: 166, legBu: 160, legBf: 162, footF: 12, footB: 12 },
  layout: { spine1: 190, spine2: 196, head: 200, armFu: 196, armFf: 204, armBu: 192, armBf: 200, legFu: -6, legFf: -8, legBu: -10, legBf: -12, footF: 6, footB: 6 },
  straight: { spine1: 178, spine2: 174, head: 168, armFu: 135, armFf: 140, armBu: 128, armBf: 134, legFu: 4, legFf: 4, legBu: 2, legBf: 2, footF: 6, footB: 6 },
  gainer: { spine1: 194, spine2: 202, head: 210, armFu: 215, armFf: 225, armBu: 205, armBf: 215, legFu: -22, legFf: -62, legBu: -12, legBf: -48, footF: -40, footB: -30 },
  twist: { spine1: 180, spine2: 182, head: 182, armFu: 150, armFf: 160, armBu: 146, armBf: 156, legFu: 3, legFf: 0, legBu: -3, legBf: -2, footF: 6, footB: 6 },
  lock: { spine1: 180, spine2: 180, head: 180, armFu: 180, armFf: 180, armBu: 180, armBf: 180, legFu: 1, legFf: 0, legBu: -1, legBf: 0, footF: 6, footB: 6 },
  limp: { spine1: 176, spine2: 168, head: 160, armFu: 150, armFf: 120, armBu: 160, armBf: 130, legFu: 12, legFf: -20, legBu: -8, legBf: -14, footF: 40, footB: 40 },
  swim: { spine1: 182, spine2: 184, head: 168, armFu: 180, armFf: 190, armBu: 0, armBf: 10, legFu: 6, legFf: -4, legBu: -6, legBf: -14, footF: 0, footB: -8 },
  hipsHands: { spine1: 180, spine2: 180, head: 180, armFu: -40, armFf: 60, armBu: -36, armBf: 56, legFu: 2, legFf: 0, legBu: -2, legBf: 0, footF: 90, footB: 90 },
  crossed: { spine1: 180, spine2: 180, head: 180, armFu: 50, armFf: -60, armBu: 44, armBf: -54, legFu: 2, legFf: 0, legBu: -2, legBf: 0, footF: 90, footB: 90 },
  stretch: { spine1: 180, spine2: 184, head: 184, armFu: 190, armFf: 196, armBu: 186, armBf: 192, legFu: 2, legFf: 0, legBu: -2, legBf: 0, footF: 90, footB: 90 },
};
const P = POSES;

function blend(a, b, t) {
  const out = {};
  for (const k of JOINTS) out[k] = lerp(a[k], b[k], t);
  return out;
}

// Arm spread (0..1): how far the arms swing out to the sides, visible when the figure faces the camera.
const SPREAD = { twist: 1, layout: 0.35, straight: 0.55, gainer: 0.4, fall: 0.5, lock: 0, tuck: 0.15, pike: 0.1 };

const SHAPE_POSE = { tuck: 'tuck', pike: 'pike', layout: 'layout', straight: 'straight', gainer: 'gainer', twist: 'twist' };

// ---- Hair -------------------------------------------------------------------
// Each style is ONE outline drawn around the head, as polar points
// [angle°, radius in head radii]: 0° = crown, negative = toward the face,
// positive = toward the back of the head. The first and last points sit on
// the scalp and are pinned; every other point is a spring-damper node that
// lags, streams in the airflow and floats in the water.
export const HAIR_STYLES = {
  flame: { stiff: 15, smooth: false, outline: [[-78, 1], [-62, 1.28], [-38, 1.42], [-12, 1.5], [12, 1.62], [30, 2.45], [44, 1.66], [70, 1.5], [98, 1.28], [112, 1]] },
  spiky: { stiff: 24, smooth: false, outline: [[-80, 1], [-66, 1.52], [-52, 1.24], [-32, 1.74], [-14, 1.3], [6, 1.82], [24, 1.32], [44, 1.76], [62, 1.3], [84, 1.58], [104, 1]] },
  mohawk: { stiff: 26, smooth: false, outline: [[-36, 1], [-30, 1.55], [-18, 1.95], [0, 2.08], [18, 1.96], [32, 1.62], [40, 1]] },
  quiff: { stiff: 16, smooth: true, outline: [[-96, 1], [-100, 1.42], [-84, 1.84], [-62, 1.78], [-38, 1.54], [-6, 1.42], [34, 1.36], [76, 1.3], [108, 1.16], [122, 1]] },
  bob: { stiff: 9, smooth: true, outline: [[-74, 1], [-58, 1.3], [-24, 1.4], [16, 1.42], [60, 1.42], [104, 1.44], [136, 1.56], [150, 1.84], [140, 1.62], [126, 1]] },
  ponytail: { stiff: 7, smooth: true, outline: [[-72, 1], [-40, 1.22], [0, 1.26], [44, 1.26], [70, 1.32], [86, 1.66], [100, 2.2], [114, 2.62], [120, 2.3], [108, 1.66], [104, 1.24], [114, 1]] },
  afro: { stiff: 30, smooth: true, outline: [[-86, 1], [-80, 1.5], [-62, 1.74], [-44, 1.86], [-24, 1.8], [-4, 1.92], [16, 1.84], [36, 1.94], [56, 1.84], [76, 1.9], [98, 1.74], [116, 1.5], [124, 1]] },
  bun: { stiff: 20, smooth: true, outline: [[-66, 1], [-36, 1.22], [-8, 1.26], [8, 1.6], [24, 2.0], [44, 1.96], [56, 1.56], [72, 1.26], [104, 1.18], [116, 1]] },
  slick: { stiff: 12, smooth: true, outline: [[-76, 1], [-58, 1.24], [-22, 1.34], [26, 1.34], [76, 1.42], [104, 1.78], [116, 1.5], [122, 1]] },
  bald: { stiff: 1, smooth: true, outline: [] },
};
export const PLAYER_HAIR = 'flame';

export class Hair {
  constructor(styleName) {
    this.styleName = HAIR_STYLES[styleName] ? styleName : 'spiky';
    this.style = HAIR_STYLES[this.styleName];
    const pts = this.style.outline;
    const n = pts.length;
    // Front-view angles: spread the outline evenly and symmetrically across the crown.
    const span = n > 1 ? (Math.abs(pts[0][0]) + Math.abs(pts[n - 1][0])) / 2 : 0;
    this.points = pts.map(([deg, r], i) => ({
      th: deg * D2R,
      thFront: n > 1 ? (-span + (2 * span * i) / (n - 1)) * D2R : 0,
      r,
      pinned: i === 0 || i === n - 1,
    }));
    this.nodes = null;
    this.rest = [];
  }

  /**
   * Rest positions in world space. H = head centre, U = projected head-up
   * vector (length = head radius, shrinks when the head points at the camera),
   * F = unit forward of the head in profile, yaw = body twist in radians.
   */
  computeRest(H, U, F, yaw) {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const norm = Math.abs(c) + Math.abs(s);
    this.rest = this.points.map((p) => {
      // Morph profile → front → mirrored profile → back as the figure spins.
      const th = (p.th * c + p.thFront * s) / norm;
      const up = Math.cos(th) * p.r;
      const fwd = -Math.sin(th) * p.r * BONES.headR;
      return { x: H.x + U.x * up + F.x * fwd, y: H.y + U.y * up + F.y * fwd };
    });
    return this.rest;
  }

  update(dt, inWater) {
    const rest = this.rest;
    if (!rest.length) return;
    if (!this.nodes) {
      this.nodes = rest.map((r) => ({ x: r.x, y: r.y, vx: 0, vy: 0 }));
      return;
    }
    const stiffBase = this.style.stiff * (inWater ? 0.55 : 1);
    const airDrag = inWater ? 9 : 1.4;
    const grav = inWater ? -0.6 : 2.2; // hair floats up a little in water
    const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
    const h = dt / steps;
    for (let k = 0; k < steps; k++) {
      for (let i = 0; i < this.nodes.length; i++) {
        const n = this.nodes[i];
        const r = rest[i];
        const p = this.points[i];
        if (p.pinned) {
          n.vx = (r.x - n.x) / h;
          n.vy = (r.y - n.y) / h;
          n.x = r.x;
          n.y = r.y;
          continue;
        }
        // Nodes far from the scalp are softer, so tips whip more than roots.
        const w = stiffBase / (0.6 + 0.6 * (p.r - 1));
        const zeta = 0.42;
        const ax = w * w * (r.x - n.x) - 2 * zeta * w * n.vx - airDrag * n.vx;
        const ay = w * w * (r.y - n.y) - 2 * zeta * w * n.vy - airDrag * n.vy + grav;
        n.vx += ax * h;
        n.vy += ay * h;
        n.x += n.vx * h;
        n.y += n.vy * h;
        // Keep the silhouette recognisable.
        const maxDev = BONES.headR * (0.25 + 0.75 * (p.r - 1));
        const dx = n.x - r.x;
        const dy = n.y - r.y;
        const dev = Math.hypot(dx, dy);
        if (dev > maxDev) {
          n.x = r.x + (dx / dev) * maxDev;
          n.y = r.y + (dy / dev) * maxDev;
        }
      }
    }
  }
}

// ---- Rig --------------------------------------------------------------------
export class Rig {
  constructor({ hairStyle = 'spiky', idleStyle = 'stand' } = {}) {
    this.angles = {};
    this.vel = {};
    for (const k of JOINTS) {
      this.angles[k] = P.stand[k] * D2R;
      this.vel[k] = 0;
    }
    this.idleStyle = idleStyle;
    this.hair = new Hair(hairStyle);
    this.points = null;
    this.prevPitch = null;
    this.pitchOmega = 0;
    this.phase = Math.random() * 10;
    this.lastVy = 0;
    this.groundDrop = 0;
    this.spread = 0;
    this.spreadVel = 0;
  }

  setHair(hairStyle) {
    this.hair = new Hair(hairStyle);
  }

  /** Called when the body's orientation is re-expressed without moving (keeps limb lag sane). */
  shiftPitch(deltaRad) {
    if (this.prevPitch != null) this.prevPitch += deltaRad;
  }

  /** Pose target, base joint stiffness and per-group stiffness multipliers. */
  target(d, t) {
    const s = d.state;
    const ph = t * 2.2 + this.phase;
    let pose;
    let stiff = 14;
    let legMul = 1;
    let armMul = 1;
    switch (s) {
      case 'idle': {
        pose = { ...(P[this.idleStyle] ?? P.stand) };
        pose.spine2 += Math.sin(ph) * 1.5;
        pose.head += Math.sin(ph * 0.7) * 3;
        pose.legFf += Math.sin(ph * 0.5) * 2;
        stiff = 10;
        break;
      }
      case 'ready':
      case 'hesitate': {
        pose = { ...(s === 'ready' ? P.peek : P.hesitate) };
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
        pose = { ...P.stand, spine1: 177, spine2: 178 };
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
      case 'charging': {
        // Sink into a crouch as the jump charges; arms swing back, knees shake harder.
        const settle = clamp(d.stateT / 0.14, 0, 1);
        const c = d.charge;
        pose = blend(blend(P.peek, P.crouch, settle), P.crouchDeep, c);
        const shake = Math.sin(t * 38 + this.phase) * (0.8 + 2.4 * c);
        pose.legFu += shake;
        pose.legFf -= shake;
        pose.armFu += Math.sin(t * 7) * 4 * c;
        stiff = 16;
        break;
      }
      case 'launch': {
        const k = clamp(d.stateT / 0.1, 0, 1);
        pose = blend(P.crouchDeep, P.launch, k * k);
        stiff = 34;
        break;
      }
      case 'airborne': {
        pose = this.airPose(d);
        stiff = d.current ? 24 : d.locked ? 26 : 12;
        if (d.current && d.current.trick.shape === 'gainer') legMul = 0.45; // legs dangle and trail
        break;
      }
      case 'entering': {
        const k = clamp(d.stateT / 0.5, 0, 1);
        pose = blend(d.entryAngleErr < 25 ? P.lock : P.limp, P.limp, k);
        stiff = 5;
        break;
      }
      case 'surfacing': {
        const k = clamp(d.stateT / 0.7, 0, 1);
        pose = blend(P.limp, this.swimPose(d.stateT, 0), k);
        stiff = 9;
        break;
      }
      case 'swimming':
        pose = this.swimPose(d.stateT, 1);
        stiff = 15;
        armMul = 1.2;
        break;
      default:
        pose = { ...P.stand };
    }
    return { pose, stiff, legMul, armMul, spread: this.spreadFor(d) };
  }

  spreadFor(d) {
    if (d.state !== 'airborne') return d.state === 'launch' ? 0.2 : 0;
    if (d.current) {
      const p = clamp(d.current.t / d.current.trick.duration, 0, 1);
      return (SPREAD[d.current.trick.shape] ?? 0.2) * Math.sin(Math.PI * p) ** 0.5;
    }
    return d.locked ? 0 : SPREAD.fall;
  }

  /** Front crawl, in a body frame where the head leads along +x (body pitched 90°). */
  swimPose(time, strength) {
    const pose = { ...P.swim };
    const w = time * 5.2; // stroke phase, radians
    const sweep = (w * 180) / Math.PI;
    // Arms windmill continuously: overhead (180) → pull under the chest (90)
    // → past the hips (0) → recover over the back (-90) → overhead again.
    pose.armFu = 180 - sweep * strength;
    pose.armBu = 0 - sweep * strength;
    // Elbow stays fairly straight on the pull and bends high on the recovery over the back.
    const bend = (a) => 18 + 30 * Math.max(0, -Math.sin((a * Math.PI) / 180));
    pose.armFf = pose.armFu + bend(pose.armFu);
    pose.armBf = pose.armBu + bend(pose.armBu);
    // Flutter kick from the hips, knees soft, toes pointed.
    const k = w * 2.4;
    pose.legFu = 4 + 13 * Math.sin(k) * strength;
    pose.legFf = pose.legFu - 10 - 10 * Math.max(0, Math.sin(k - 0.9)) * strength;
    pose.legBu = 4 - 13 * Math.sin(k) * strength;
    pose.legBf = pose.legBu - 10 - 10 * Math.max(0, Math.sin(k + Math.PI - 0.9)) * strength;
    pose.footF = pose.legFf - 6;
    pose.footB = pose.legBf - 6;
    pose.head = 168 + 10 * Math.sin(w) * strength; // turns to breathe
    return pose;
  }

  airPose(d) {
    if (d.current) {
      const c = d.current;
      const p = clamp(c.t / c.trick.duration, 0, 1);
      const fold = Math.sin(Math.PI * p) ** 0.8;
      const shape = P[SHAPE_POSE[c.trick.shape]] ?? P.tuck;
      return blend(P.fall, shape, fold);
    }
    if (d.locked) {
      const left = d.impactT - d.airT;
      const k = clamp((0.5 - left) / 0.35, 0, 1);
      const pose = { ...P.lock };
      pose.armFu = lerp(150, 180, k);
      pose.armBu = lerp(-150, 180, Math.min(1, k * 1.3));
      pose.armFf = pose.armFu + 2;
      pose.armBf = pose.armBu + 2;
      return pose;
    }
    // Rising off a big jump: still stretched from the take-off.
    if (d.vy < -0.5) return blend(P.fall, P.launch, clamp(-d.vy / 4, 0, 0.8));
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
    const { pose, stiff, legMul, armMul, spread } = this.target(d, t);
    // Arm spread follows its own spring so the arms sweep out and back in smoothly.
    this.spreadVel += (16 * 16 * (spread - this.spread) - 2 * 0.75 * 16 * this.spreadVel) * dt;
    this.spread += this.spreadVel * dt;
    const pitch = d.angle * D2R;
    if (this.prevPitch == null) this.prevPitch = pitch;
    const omega = (pitch - this.prevPitch) / Math.max(dt, 1e-4);
    this.pitchOmega = lerp(this.pitchOmega, omega, Math.min(1, dt * 20));
    this.prevPitch = pitch;
    const airborne = d.state === 'airborne';
    const lagArm = airborne && !d.current ? 0.045 : 0.018;
    const lagLeg = airborne && d.current && d.current.trick.shape === 'gainer' ? 0.05 : 0.012;
    const jolt = clamp((this.lastVy - d.vy) * 0.25, -3, 3); // sudden deceleration flings the limbs
    this.lastVy = d.vy;
    const zeta = d.state === 'entering' || d.state === 'surfacing' ? 1.1 : 0.72;

    for (const k of JOINTS) {
      const isArm = k.startsWith('arm');
      const isLeg = k.startsWith('leg') || k.startsWith('foot');
      let tgt = pose[k] * D2R;
      if (isArm) tgt -= this.pitchOmega * lagArm;
      else if (isLeg) tgt -= this.pitchOmega * lagLeg;
      const w = stiff * (isLeg ? legMul : isArm ? armMul : 1);
      const acc = w * w * (tgt - this.angles[k]) - 2 * zeta * w * this.vel[k];
      this.vel[k] += acc * dt;
      if (Math.abs(jolt) > 0.05 && (isArm || k === 'head' || k === 'spine2')) this.vel[k] += jolt * (k === 'head' ? 1.2 : 0.8);
      this.angles[k] += this.vel[k] * dt;
    }
    this.computePoints(d);
    const inWater = d.state === 'entering' || d.state === 'surfacing' || d.state === 'swimming';
    this.hair.update(dt, inWater);
    void env;
  }

  /** Forward kinematics + 3D rotation + orthographic projection. */
  computePoints(d) {
    const a = this.angles;
    const step = (p, ang, len, z) => ({ x: p.x + Math.sin(ang) * len, y: p.y + Math.cos(ang) * len, z });
    const hip = { x: 0, y: 0, z: 0 };
    const chest = step(hip, a.spine1, BONES.spine1, 0);
    const neck = step(chest, a.spine2, BONES.spine2, 0);
    const headC = step(neck, a.head, BONES.neck + BONES.headR, 0);
    const shoulder = step(chest, a.spine2, BONES.spine2 * 0.9, 0);
    // Spread pushes the arms out sideways; the sagittal swing shrinks to keep bone lengths.
    const spr = clamp(this.spread, 0, 1);
    const ez = LAT.elbow + spr * 0.2;
    const wz = LAT.wrist + spr * 0.38;
    const armK = Math.sqrt(Math.max(0.2, 1 - ((spr * 0.2) / BONES.upperArm) ** 2));
    const elbF = step(shoulder, a.armFu, BONES.upperArm * armK, ez);
    const wrF = step(elbF, a.armFf, BONES.forearm * armK, wz);
    const elbB = step(shoulder, a.armBu, BONES.upperArm * armK, -ez);
    const wrB = step(elbB, a.armBf, BONES.forearm * armK, -wz);
    const kneeF = step(hip, a.legFu, BONES.thigh, LAT.knee);
    const ankF = step(kneeF, a.legFf, BONES.shin, LAT.ankle);
    const toeF = step(ankF, a.footF, BONES.foot, LAT.ankle);
    const kneeB = step(hip, a.legBu, BONES.thigh, -LAT.knee);
    const ankB = step(kneeB, a.legBf, BONES.shin, -LAT.ankle);
    const toeB = step(ankB, a.footB, BONES.foot, -LAT.ankle);
    // Speedo: waistband, outer thigh openings and crotch.
    const spineDir = { x: Math.sin(a.spine1), y: Math.cos(a.spine1) };
    const waistF = { x: hip.x + spineDir.x * 0.07, y: hip.y + spineDir.y * 0.07, z: 0.075 };
    const waistB = { ...waistF, z: -0.075 };
    const thighF = step(hip, a.legFu, 0.12, LAT.knee * 0.4);
    const thighB = step(hip, a.legBu, 0.12, -LAT.knee * 0.4);
    const legMid = (a.legFu + a.legBu) / 2;
    const crotch = step(hip, legMid, 0.07, 0);
    // Head frame (for hair), in the sagittal plane.
    const hu = { x: Math.sin(a.head), y: Math.cos(a.head) }; // neck → crown
    const headTop = { x: headC.x + hu.x * BONES.headR, y: headC.y + hu.y * BONES.headR, z: 0 };
    const headFwd = { x: headC.x - hu.y * BONES.headR, y: headC.y + hu.x * BONES.headR, z: 0 }; // perpendicular, toward the face

    const local = { hip, chest, neck, headC, shoulder, elbF, wrF, elbB, wrB, kneeF, ankF, toeF, kneeB, ankB, toeB, waistF, waistB, thighF, thighB, crotch };

    // Rotation: yaw about the long (y) axis, then roll about forward (x), then pitch in the screen plane.
    const yaw = d.twist * TAU;
    const roll = d.roll * TAU;
    const pitch = d.angle * D2R;
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const cr = Math.cos(roll), sr = Math.sin(roll);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const project = (p, useYaw = true) => {
      const x1 = useYaw ? p.x * cy + p.z * sy : p.x;
      const z1 = useYaw ? -p.x * sy + p.z * cy : p.z;
      const y2 = p.y * cr + z1 * sr;
      const z2 = -p.y * sr + z1 * cr;
      return { x: d.x + x1 * cp - y2 * sp, y: d.y + x1 * sp + y2 * cp, z: z2 };
    };
    const world = {};
    for (const k in local) world[k] = project(local[k]);

    // Hair frame: profile orientation (no yaw — the hair morphs with yaw itself).
    const H = project(headC, false);
    const T = project(headTop, false);
    const Fw = project(headFwd, false);
    const U = { x: T.x - H.x, y: T.y - H.y };
    let F = { x: Fw.x - H.x, y: Fw.y - H.y };
    const fl = Math.hypot(F.x, F.y) || 1;
    F = { x: F.x / fl, y: F.y / fl };
    const rest = this.hair.computeRest(world.headC, U, F, yaw);
    world.hairDepth = world.headC.z + (T.z - H.z) * 0.9 - 0.02;
    world.hairRest = rest;
    world.facing = Math.cos(yaw) >= 0 ? 1 : -1;
    world.local = local;
    // Ground contact: how far the hip must drop to keep the feet planted.
    const lowest = Math.max(ankF.y, ankB.y);
    this.groundDrop = Math.max(0, LEG_LENGTH - lowest);
    this.points = world;
    return world;
  }
}
