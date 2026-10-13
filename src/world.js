// Simulation: divers, physics, trick execution and bot behaviour.
// Units: metres. x grows toward the water, y grows downward (cliff top = 0).

import { TRICKS } from './tricks.js';
import { LOCK_WINDOW, LOCK_SWEET, LOCK_TOLERANCE } from './scoring.js';
import { Rig, STANDING_HIP_HEIGHT } from './rig.js';

export const HIP_HEIGHT = STANDING_HIP_HEIGHT; // hip above the cliff top when standing
export const IMPACT_OFFSET = 0.45; // hip is this far above the surface at impact
export const JUMP_VY = -1.6; // minimum take-off speed (a quick tap); negative = up
export const JUMP_VY_BONUS = 3.6; // extra upward speed at full charge
export const JUMP_VX = 1.7;
export const JUMP_VX_BONUS = 0.9;
export const CHARGE_TIME = 1.0; // seconds of holding for full power
const MIN_CROUCH = 0.12; // a tap still dips before leaving the ground
const LAUNCH_TIME = 0.1;
const SURFACE_TIME = 0.8;
const GROUNDED = new Set(['idle', 'ready', 'hesitate', 'walking', 'charging', 'launch']);

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const lerp = (a, b, t) => a + (b - a) * t;

function nearestVertical(angle) {
  return Math.round(angle / 180) * 180; // feet-first and head-first are both clean
}

export function angleError(angle) {
  return Math.abs(angle - nearestVertical(angle));
}

/** Degrees between the body's long axis and vertical, for a given pitch and roll. */
export function entryTilt(pitchDeg, rollRev) {
  const c = Math.abs(Math.cos((pitchDeg * Math.PI) / 180) * Math.cos(rollRev * 2 * Math.PI));
  return (Math.acos(clamp(c, 0, 1)) * 180) / Math.PI;
}

export function jumpVelocity(charge) {
  return { vx: JUMP_VX + JUMP_VX_BONUS * charge, vy: JUMP_VY - JUMP_VY_BONUS * charge };
}

/** Rotation progress profile: slow in, fast through the middle, slow out. */
function spinProfile(p, peak) {
  return p - (Math.sin(2 * Math.PI * p) / (2 * Math.PI)) * peak;
}

/** Move `value` toward the nearest multiple of `step` by at most `rate`. */
function settleTo(value, step, rate) {
  const tgt = Math.round(value / step) * step;
  return value + clamp(tgt - value, -rate, rate);
}

export class Diver {
  constructor({ id, name, color, isPlayer = false, x = 0, hairStyle = 'spiky', idleStyle = 'stand' }) {
    this.id = id;
    this.name = name;
    this.color = color;
    this.isPlayer = isPlayer;
    this.x = x;
    this.y = -HIP_HEIGHT;
    this.vx = 0;
    this.vy = 0;
    this.state = 'idle';
    this.stateT = 0;
    this.idleSeed = Math.random() * 1000;
    this.rig = new Rig({ hairStyle, idleStyle });
    // orientation: pitch (deg, flips), twist (revs about the long axis), roll (revs, sideflips)
    this.angle = 0;
    this.twist = 0;
    this.roll = 0;
    // jump
    this.charge = 0;
    this.autoRelease = null;
    this.jumpCharge = 0;
    // trick execution
    this.queue = [];
    this.current = null;
    this.completed = [];
    this.aborted = null;
    this.airT = 0;
    this.impactT = Infinity;
    this.locked = false;
    this.lockDelta = null;
    this.lockedEarly = false;
    this.lockAngleTarget = 0;
    this.entryAngleErr = 0;
    this.result = null;
    this.plan = null; // bots only
    this.walkTarget = null;
    this.onEvent = null;
    this.sinkDepth = 0;
    this.swimPitch = 90;
  }

  setState(s) {
    this.state = s;
    this.stateT = 0;
  }

  emit(type, data) {
    if (this.onEvent) this.onEvent(type, data, this);
  }

  // ---- control -----------------------------------------------------------

  /** Start crouching to charge the jump. `autoRelease` (0..1) makes it let go by itself (bots, timeouts). */
  startCharge(autoRelease = null) {
    if (!['ready', 'idle', 'hesitate'].includes(this.state)) return false;
    this.setState('charging');
    this.charge = 0;
    this.autoRelease = autoRelease;
    return true;
  }

  release() {
    if (this.state !== 'charging') return false;
    if (this.stateT < MIN_CROUCH) {
      this.autoRelease = 0; // let the dip finish, then go
      return true;
    }
    this.jumpCharge = this.charge;
    this.setState('launch');
    this.emit('release', { charge: this.jumpCharge });
    return true;
  }

  takeOff(env) {
    const v = jumpVelocity(this.jumpCharge);
    this.setState('airborne');
    this.vx = v.vx;
    this.vy = v.vy;
    this.airT = 0;
    this.angle = 0;
    this.twist = 0;
    this.roll = 0;
    const drop = env.height - IMPACT_OFFSET - this.y;
    const g = env.gravity;
    this.impactT = (-this.vy + Math.sqrt(this.vy * this.vy + 2 * g * drop)) / g;
    this.emit('jump');
    if (this.queue.length) this.startTrick(this.queue.shift());
  }

  queueTrick(trickId) {
    if (this.locked) return false;
    if (this.state === 'launch') {
      if (this.queue.length) return false;
      this.queue.push(trickId);
      return true;
    }
    if (this.state !== 'airborne') return false;
    if (!this.current) this.startTrick(trickId);
    else if (this.queue.length < 1) this.queue.push(trickId);
    else return false;
    return true;
  }

  startTrick(trickId) {
    const trick = TRICKS[trickId];
    this.current = { trick, t: 0, startAngle: this.angle, startTwist: this.twist, startRoll: this.roll };
    this.emit('trickStart', { trick, timeLeft: this.impactT - this.airT });
  }

  lock() {
    if (this.state !== 'airborne' || this.locked) return false;
    const timeLeft = this.impactT - this.airT;
    this.locked = true;
    this.queue = [];
    if (this.current) {
      this.aborted = this.current.trick;
      this.current = null;
    }
    if (timeLeft > LOCK_WINDOW) {
      this.lockedEarly = true;
      this.lockDelta = null;
    } else {
      this.lockDelta = timeLeft;
    }
    this.lockAngleTarget = nearestVertical(this.angle) + (this.plan ? this.plan.entryAngleOffset : 0);
    this.emit('lock', { timeLeft, early: this.lockedEarly });
    return true;
  }

  // ---- update ------------------------------------------------------------

  update(dt, env, rand, time) {
    this.stateT += dt;
    if (GROUNDED.has(this.state)) this.y = -HIP_HEIGHT + this.rig.groundDrop;
    switch (this.state) {
      case 'idle':
      case 'ready':
      case 'hesitate':
        this.settleUpright(dt);
        break;
      case 'charging':
        this.settleUpright(dt);
        this.charge = clamp(this.stateT / CHARGE_TIME, 0, 1);
        if (this.autoRelease != null && this.stateT >= MIN_CROUCH && this.charge >= this.autoRelease) this.release();
        break;
      case 'launch':
        this.x += (0.4 + this.jumpCharge * 0.6) * dt;
        if (this.stateT >= LAUNCH_TIME) this.takeOff(env);
        break;
      case 'walking':
        this.updateWalking(dt);
        break;
      case 'airborne':
        this.updateAirborne(dt, env);
        break;
      case 'entering':
        this.updateEntering(dt);
        break;
      case 'surfacing':
        this.updateSurfacing(dt, env);
        break;
      case 'swimming':
        this.x += 1.5 * dt;
        this.y = env.height + 0.1 + Math.sin(this.stateT * 5.2) * 0.025;
        this.angle = this.swimPitch + Math.sin(this.stateT * 5.2) * 3;
        if (this.stateT > 4) this.setState('gone');
        break;
      default:
        break;
    }
    if (this.state !== 'gone') this.rig.update(dt, this, env, time);
    void rand;
  }

  settleUpright(dt) {
    this.angle = lerp(this.angle, 0, Math.min(1, dt * 10));
    this.twist = 0;
    this.roll = 0;
  }

  updateWalking(dt) {
    if (this.walkTarget == null) return;
    const dir = Math.sign(this.walkTarget - this.x);
    const step = 1.5 * dt;
    if (Math.abs(this.walkTarget - this.x) <= step) {
      this.x = this.walkTarget;
      this.walkTarget = null;
      this.setState('ready');
      this.emit('arrived');
    } else {
      this.x += dir * step;
    }
  }

  updateAirborne(dt, env) {
    this.airT += dt;
    this.vy += env.gravity * dt;
    this.y += this.vy * dt;
    this.x += this.vx * dt;
    this.vx *= 1 - 0.08 * dt;

    if (this.plan) this.updateBotAutopilot();

    if (this.current) {
      const c = this.current;
      const tr = c.trick;
      c.t += dt;
      const p = clamp(c.t / tr.duration, 0, 1);
      // Tucked shapes spin faster through the middle (angular momentum).
      const peak = tr.shape === 'tuck' ? 0.75 : tr.shape === 'layout' || tr.shape === 'straight' || tr.shape === 'gainer' ? 0.45 : 0.55;
      const s = spinProfile(p, peak);
      this.angle = c.startAngle + tr.flip * 360 * s;
      this.twist = c.startTwist + tr.twist * spinProfile(p, 0.35);
      this.roll = c.startRoll + tr.roll * s;
      if (p >= 1) {
        this.completed.push(tr.id);
        this.current = null;
        this.emit('trickDone', { trick: tr });
        if (this.queue.length > 0) this.startTrick(this.queue.shift());
      }
    } else if (this.locked) {
      // Ease into a streamlined entry line.
      const d = this.lockAngleTarget - this.angle;
      this.angle += clamp(d, -260 * dt, 260 * dt);
      this.twist = settleTo(this.twist, 0.5, 2 * dt);
      this.roll = settleTo(this.roll, 0.5, 2 * dt);
    } else {
      this.angle += (this.plan ? 0 : 6) * dt; // untended bodies drift
    }

    if (this.airT >= this.impactT) this.enterWater(env);
  }

  enterWater(env) {
    const stillTricking = this.current != null;
    this.entryAngleErr = entryTilt(this.angle, this.roll) + (stillTricking ? 10 : 0);
    this.setState('entering');
    this.y = env.height - IMPACT_OFFSET;
    this.emit('impact', {
      angleErrDeg: this.entryAngleErr,
      lockDelta: this.lockDelta,
      lockedEarly: this.lockedEarly,
      completed: [...this.completed],
      aborted: this.aborted,
      midTrick: stillTricking,
      vy: this.vy,
    });
    this.current = null;
  }

  /** Re-express a half roll as a half pitch + half twist (same pose) so the swim exit stays simple. */
  normalizeRoll() {
    const halves = Math.round(this.roll * 2);
    this.roll -= halves / 2;
    if (((halves % 2) + 2) % 2 === 1) {
      this.angle += 180;
      this.twist += 0.5;
      this.rig.shiftPitch(Math.PI);
    }
  }

  updateEntering(dt) {
    // Water drag: a clean entry slices deep, a flop stops short.
    const clean = clamp(1 - this.entryAngleErr / 60, 0, 1);
    this.vy *= Math.exp(-(2.2 + (1 - clean) * 6) * dt);
    this.y += this.vy * dt;
    this.x += (0.2 + this.vx * 0.1) * dt;
    this.vx *= Math.exp(-3 * dt);
    const target = nearestVertical(this.angle) + (this.entryAngleErr > 25 ? 60 : 20);
    this.angle = lerp(this.angle, target, Math.min(1, dt * 1.5));
    this.roll = settleTo(this.roll, 0.5, 1.5 * dt);
    this.twist = settleTo(this.twist, 0.5, 1.5 * dt);
    if (this.stateT > 0.9) {
      this.normalizeRoll();
      this.sinkDepth = this.y;
      // Swim pose has the head leading along +x: pitch 90° (nearest equivalent turn).
      this.swimPitch = 90 + 360 * Math.round((this.angle - 90) / 360);
      this.swimTwist = Math.ceil(this.twist - 1e-6); // roll over to face down
      this.setState('surfacing');
    }
  }

  updateSurfacing(dt, env) {
    const k = clamp(this.stateT / SURFACE_TIME, 0, 1);
    const ease = 1 - (1 - k) * (1 - k);
    this.y = lerp(this.sinkDepth, env.height + 0.1, ease);
    this.x += 0.6 * dt;
    this.vy = 0;
    this.angle = lerp(this.angle, this.swimPitch, Math.min(1, dt * 4));
    this.twist = lerp(this.twist, this.swimTwist, Math.min(1, dt * 4));
    this.roll = lerp(this.roll, 0, Math.min(1, dt * 4));
    if (this.stateT >= SURFACE_TIME) {
      this.angle = this.swimPitch;
      this.twist = this.swimTwist;
      this.roll = 0;
      this.setState('swimming');
      this.emit('surfaced');
    }
  }

  updateBotAutopilot() {
    const plan = this.plan;
    const timeLeft = this.impactT - this.airT;
    if (!plan.started && this.airT >= plan.trickStartDelay) {
      plan.started = true;
      if (plan.trickIds.length > 0) this.startTrick(plan.trickIds[0]);
      plan.nextIndex = 1;
    }
    if (plan.started && !this.current && plan.nextIndex < plan.trickIds.length && !this.locked) {
      this.startTrick(plan.trickIds[plan.nextIndex]);
      plan.nextIndex += 1;
    }
    if (!this.locked && plan.nextIndex >= plan.trickIds.length && !this.current && timeLeft <= plan.lockDelta) this.lock();
    if (!this.current && !this.locked) this.angle += plan.drift * 0.016;
  }
}

/** Create a bot's in-air plan from its synthesized dive. */
export function makeBotPlan({ trickIds, q, rand, airTime }) {
  // Decompose q into an angle component and a timing component.
  let angleQ = clamp(q + rand.range(-0.2, 0.2), 0, 1);
  let timingQ = (q - 0.55 * angleQ) / 0.45;
  if (timingQ < 0) {
    timingQ = 0;
    angleQ = clamp(q / 0.55, 0, 1);
  } else if (timingQ > 1) {
    timingQ = 1;
    angleQ = clamp((q - 0.45) / 0.55, 0, 1);
  }
  const angleErr = (1 - angleQ) * 60;
  const sign = rand.chance(0.5) ? 1 : -1;
  const lockDelta = clamp(LOCK_SWEET + sign * (1 - timingQ) * LOCK_TOLERANCE, 0.02, LOCK_WINDOW - 0.01);
  const tricksDur = trickIds.reduce((a, id) => a + TRICKS[id].duration, 0);
  const slack = Math.max(0, airTime - tricksDur - lockDelta - 0.3);
  return {
    trickIds,
    q,
    trickStartDelay: clamp(0.12 + rand() * Math.min(0.5, slack), 0.1, 1.0),
    lockDelta,
    entryAngleOffset: (rand.chance(0.5) ? 1 : -1) * angleErr,
    drift: rand.range(-15, 15),
    started: false,
    nextIndex: 0,
  };
}

export class Splash {
  constructor({ x, y, power, rand }) {
    this.t = 0;
    this.life = 1.6;
    this.rings = [];
    this.drops = [];
    const n = Math.round(10 + power * 60);
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + rand.range(-0.9, 0.9) * (0.35 + power);
      const sp = rand.range(1.5, 3.2) * (0.6 + power * 2.6);
      this.drops.push({
        x: x + rand.range(-0.25, 0.25) * (0.3 + power),
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        r: rand.range(0.05, 0.12) * (0.8 + power * 1.2),
        life: rand.range(0.5, 1.3),
      });
    }
    for (let i = 0; i < 3; i++) this.rings.push({ x, y, delay: i * 0.25, w: 0.6 + power * 2.2 });
    this.x = x;
    this.y = y;
    this.power = power;
  }

  update(dt, g) {
    this.t += dt;
    for (const d of this.drops) {
      d.vy += g * 0.9 * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.life -= dt;
    }
    this.drops = this.drops.filter((d) => d.life > 0 && d.y < this.y + 0.4);
  }

  get done() {
    return this.t > this.life;
  }
}

export class World {
  constructor() {
    this.divers = [];
    this.splashes = [];
    this.height = 10;
    this.gravity = 9.81;
    this.time = 0;
    this.rand = Math.random;
  }

  setCompetition(comp) {
    this.height = comp.height;
    // Choose gravity so a plain drop takes roughly comp.airTime seconds.
    const drop = comp.height - IMPACT_OFFSET + HIP_HEIGHT;
    this.gravity = (2 * (drop - JUMP_VY * comp.airTime)) / (comp.airTime * comp.airTime);
    this.airTime = comp.airTime;
  }

  /** Seconds in the air for a jump at the given charge (0..1). */
  airTimeFor(charge) {
    const { vy } = jumpVelocity(charge);
    const drop = this.height - IMPACT_OFFSET + HIP_HEIGHT;
    return (-vy + Math.sqrt(vy * vy + 2 * this.gravity * drop)) / this.gravity;
  }

  addSplash(x, power) {
    this.splashes.push(new Splash({ x, y: this.height, power, rand: this.rand }));
  }

  update(dt) {
    this.time += dt;
    for (const d of this.divers) d.update(dt, this, this.rand, this.time);
    for (const s of this.splashes) s.update(dt, this.gravity);
    this.splashes = this.splashes.filter((s) => !s.done);
  }
}
