// Simulation: divers, physics, trick execution and bot behaviour.
// Units: metres. x grows toward the water, y grows downward (cliff top = 0).

import { TRICKS, comboFor } from './tricks.js';
import { LOCK_WINDOW, LOCK_SWEET, LOCK_TOLERANCE, HEAD_FIRST_BONUS, ANGLE_WEIGHT, TIMING_WEIGHT } from './scoring.js';
import { Rig, STANDING_HIP_HEIGHT } from './rig.js';
import { themeFor } from './themes.js';

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
export const SWIM_SPEED = 1.5;
export const SWIM_TIME = 2.5; // the camera leaves the landing before the swimmer is done
export const START_X = -0.3; // the diving spot at the cliff edge
export const FLOATIE_HALF_WIDTH = 2.3; // widest branded floatie (the Blue Horse pontoon)
const FLOATIE_MARGIN = 1.5;

// Rotation physics (pitch). A trick sets an angular momentum L (expressed as
// the spin rate, deg/s, the body would have when fully open). Folding into a
// tuck/pike cuts the moment of inertia so the body spins faster; opening out
// slows it again, and the leftover open-body spin bleeds off with SPIN_TAU as
// the diver "checks" the rotation. L is chosen so that a power-1.0 swipe ends
// exactly on its nominal rotation once the residual has died away.
export const SPIN_TAU = 0.2;
const LOCK_TAU = 0.07; // streamlining for entry kills spin quickly
export const HOLD_RATE = 270; // deg/s forward rotation while holding
export const HOLD_ACCEL = 1500;
export const HOLD_DECEL = 2200;
export const COMBO_MAX_P = 0.6; // a combo needs the 2nd trick within the first 60% of the 1st
const INERTIA_K = { tuck: 0.7, pike: 0.55, gainer: 0.3, layout: 0.25, straight: 0.25, twist: 0.15 };

function fold(p) {
  return Math.sin(Math.PI * clamp(p, 0, 1)) ** 0.8;
}

/** ∫ dt / (1 − k·fold) from progress p0 to 1, for a trick of duration T. */
function inertiaIntegral(T, k, p0 = 0) {
  const n = 32;
  const span = 1 - p0;
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const p = p0 + ((i + 0.5) / n) * span;
    acc += 1 / (1 - k * fold(p));
  }
  return (acc / n) * span * T;
}
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

/** Is the head below the hips (a head-first entry)? */
export function isHeadDown(pitchDeg, rollRev) {
  return Math.cos((pitchDeg * Math.PI) / 180) * Math.cos(rollRev * 2 * Math.PI) < 0;
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
    // rotation physics
    this.spinL = 0; // open-body spin rate (deg/s) left over from tricks
    this.holding = false; // hold-to-rotate input
    this.holdOmega = 0;
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
    this.spinL = 0;
    this.holdOmega = 0;
    const drop = env.height - IMPACT_OFFSET - this.y;
    const g = env.gravity;
    this.impactT = (-this.vy + Math.sqrt(this.vy * this.vy + 2 * g * drop)) / g;
    this.emit('jump');
    if (this.queue.length) {
      const q = this.queue.shift();
      this.startTrick(q.id, q.power);
    }
  }

  /**
   * Request a trick. Returns 'start', 'queued', 'combo' or false. A second
   * trick fired early in the first one merges into a combination trick.
   */
  queueTrick(trickId, power = 1) {
    if (this.locked) return false;
    if (this.state === 'launch') {
      const prev = this.queue[0];
      const combo = prev && comboFor(prev.id, trickId);
      if (combo) {
        this.queue[0] = { id: combo, power: (prev.power + power) / 2 };
        return 'combo';
      }
      if (this.queue.length) return false;
      this.queue.push({ id: trickId, power });
      return 'queued';
    }
    if (this.state !== 'airborne') return false;
    const c = this.current;
    if (c) {
      const combo = !c.trick.combo && c.t / c.T < COMBO_MAX_P ? comboFor(c.trick.id, trickId) : null;
      if (combo) {
        this.upgradeToCombo(combo, power);
        return 'combo';
      }
      if (this.queue.length >= 1) return false;
      this.queue.push({ id: trickId, power });
      return 'queued';
    }
    this.startTrick(trickId, power);
    return 'start';
  }

  startTrick(trickId, power = 1) {
    const trick = TRICKS[trickId];
    const T = trick.duration;
    const k = INERTIA_K[trick.shape] ?? 0.4;
    // Momentum already spinning carries on; the new trick adds its rotation on top.
    const carry = this.spinL * SPIN_TAU;
    const targetFinal = this.angle + carry + trick.flip * 360 * power;
    const L = (targetFinal - this.angle) / (inertiaIntegral(T, k) + SPIN_TAU);
    this.spinL = 0;
    this.current = {
      trick, t: 0, T, k, L, power, flipPower: trick.flip ? power : null,
      baseAngle: this.angle + carry, startTwist: this.twist, startRoll: this.roll,
      twistPlan: { from: this.twist, to: this.twist + trick.twist, t0: 0 },
      rollPlan: { from: this.roll, to: this.roll + trick.roll, t0: 0 },
    };
    this.emit('trickStart', { trick, timeLeft: this.impactT - this.airT, power });
  }

  upgradeToCombo(comboId, power) {
    const c = this.current;
    const combo = TRICKS[comboId];
    const incoming = TRICKS[c.trick.id === combo.parts[0] ? combo.parts[1] : combo.parts[0]];
    // Flip power: average the parts that actually flip.
    const powers = [c.flipPower, incoming.flip ? power : null].filter((x) => x != null);
    const pw = powers.length ? powers.reduce((a, b) => a + b, 0) / powers.length : 1;
    c.trick = combo;
    c.T = Math.max(combo.duration, c.t + 0.3);
    c.k = INERTIA_K[combo.shape] ?? 0.4;
    c.flipPower = pw;
    const targetFinal = c.baseAngle + combo.flip * 360 * pw;
    c.L = (targetFinal - this.angle) / (inertiaIntegral(c.T, c.k, c.t / c.T) + SPIN_TAU);
    c.twistPlan = { from: this.twist, to: c.startTwist + combo.twist, t0: c.t };
    c.rollPlan = { from: this.roll, to: c.startRoll + combo.roll, t0: c.t };
    this.emit('combo', { trick: combo });
  }

  lock() {
    if (this.state !== 'airborne' || this.locked) return false;
    const timeLeft = this.impactT - this.airT;
    this.locked = true;
    this.queue = [];
    if (this.current) {
      // Bailing out of a trick: the body opens and keeps whatever spin it had.
      this.aborted = this.current.trick;
      this.spinL = this.current.L;
      this.current = null;
    }
    if (timeLeft > LOCK_WINDOW) {
      this.lockedEarly = true;
      this.lockDelta = null;
    } else {
      this.lockDelta = timeLeft;
    }
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
        this.x += SWIM_SPEED * dt;
        this.y = env.height + 0.1 + Math.sin(this.stateT * 5.2) * 0.025;
        this.angle = this.swimPitch + Math.sin(this.stateT * 5.2) * 3;
        if (this.stateT > SWIM_TIME) this.setState('gone');
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

    const c = this.current;
    if (c) {
      c.t += dt;
      const p = clamp(c.t / c.T, 0, 1);
      // Spin rate rises as the body folds (smaller moment of inertia).
      this.angle += (c.L / (1 - c.k * fold(p))) * dt;
      const axis = (plan, peak) => {
        const q = clamp((c.t - plan.t0) / Math.max(1e-3, c.T - plan.t0), 0, 1);
        return plan.from + (plan.to - plan.from) * spinProfile(q, peak);
      };
      this.twist = axis(c.twistPlan, 0.35);
      this.roll = axis(c.rollPlan, 0.6);
      if (p >= 1) {
        this.completed.push(c.trick.id);
        this.spinL = c.L; // kicked out: open-body spin carries on and bleeds off
        this.twist = c.twistPlan.to;
        this.roll = c.rollPlan.to;
        this.current = null;
        this.emit('trickDone', { trick: c.trick });
        if (this.queue.length > 0) {
          const q = this.queue.shift();
          this.startTrick(q.id, q.power);
        }
      }
    } else {
      this.angle += this.spinL * dt;
      this.spinL *= Math.exp(-dt / (this.locked ? LOCK_TAU : SPIN_TAU));
      if (this.locked) {
        // Twists and sideflips square themselves up for the entry.
        this.twist = settleTo(this.twist, 0.5, 2 * dt);
        this.roll = settleTo(this.roll, 0.5, 2 * dt);
      }
    }

    // Hold to rotate forward in a straight dive position (not during a trick).
    if (this.holding && !this.current) this.holdOmega = Math.min(HOLD_RATE, this.holdOmega + HOLD_ACCEL * dt);
    else this.holdOmega = Math.max(0, this.holdOmega - HOLD_DECEL * dt);
    this.angle += this.holdOmega * dt;

    if (this.airT >= this.impactT) this.enterWater(env);
  }

  /** Where the pitch will come to rest if nothing else is done. */
  predictedRestAngle() {
    return this.angle + this.spinL * (this.locked ? LOCK_TAU : SPIN_TAU) + (this.holdOmega * this.holdOmega) / (2 * HOLD_DECEL);
  }

  enterWater(env) {
    const stillTricking = this.current != null;
    this.entryAngleErr = entryTilt(this.angle, this.roll) + (stillTricking ? 10 : 0);
    this.headFirst = isHeadDown(this.angle, this.roll) && this.entryAngleErr < 30;
    this.holding = false;
    this.holdOmega = 0;
    this.setState('entering');
    this.y = env.height - IMPACT_OFFSET;
    this.emit('impact', {
      angleErrDeg: this.entryAngleErr,
      lockDelta: this.lockDelta,
      lockedEarly: this.lockedEarly,
      completed: [...this.completed],
      aborted: this.aborted,
      midTrick: stillTricking,
      headFirst: this.headFirst,
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
      if (plan.trickIds.length > 0) this.startTrick(plan.trickIds[0], plan.powers[0]);
      plan.nextIndex = 1;
    }
    if (plan.started && !this.current && plan.nextIndex < plan.trickIds.length && !this.locked) {
      this.startTrick(plan.trickIds[plan.nextIndex], plan.powers[plan.nextIndex]);
      plan.nextIndex += 1;
    }
    const tricksDone = plan.started && !this.current && plan.nextIndex >= plan.trickIds.length;
    if (tricksDone && plan.aimTarget == null) {
      // Line up the entry with the same hold-to-rotate the player uses.
      const pred = this.predictedRestAngle();
      if (plan.aimOffset == null) {
        plan.aimTarget = pred;
        return this.lockIfDue(tricksDone, timeLeft);
      }
      const room = Math.max(0, timeLeft - plan.lockDelta - 0.12) * HOLD_RATE * 0.8;
      const need = (base) => (((base + plan.aimOffset - pred) % 360) + 360) % 360;
      const want = plan.headFirst ? 180 : 0;
      let delta = need(want);
      if (delta > 340) delta = 0; // a hair past the line: live with it
      if (delta > room) {
        const alt = need(want + 180);
        delta = alt <= room ? alt : 0;
      }
      plan.aimTarget = pred + delta;
    }
    if (plan.aimTarget != null) this.holding = this.predictedRestAngle() < plan.aimTarget - 0.5;
    this.lockIfDue(tricksDone, timeLeft);
  }

  lockIfDue(tricksDone, timeLeft) {
    if (!this.locked && tricksDone && timeLeft <= this.plan.lockDelta) this.lock();
  }
}

/** Create a bot's in-air plan from its synthesized dive (entry quality q). */
export function makeBotPlan({ trickIds, q, rand, airTime }) {
  const tricksDur = trickIds.reduce((a, id) => a + TRICKS[id].duration, 0);
  const spare = airTime - tricksDur - 0.4;
  // Good divers like to rip it in head-first when there's time to line it up.
  const headFirst = q >= 0.3 && spare > 1.0 && rand.chance(q > 0.7 ? 0.75 : 0.4);
  // q = AW·angleQ + TIMING_WEIGHT·timingQ, where AW includes the head-first bonus.
  const AW = ANGLE_WEIGHT + (headFirst ? HEAD_FIRST_BONUS : 0);
  let angleQ = clamp(q / (AW + TIMING_WEIGHT) + rand.range(-0.2, 0.2), 0, 1);
  let timingQ = (q - AW * angleQ) / TIMING_WEIGHT;
  if (timingQ < 0) {
    timingQ = 0;
    angleQ = clamp(q / AW, 0, 1);
  } else if (timingQ > 1) {
    timingQ = 1;
    angleQ = clamp((q - TIMING_WEIGHT) / AW, 0, 1);
  }
  const angleErr = (1 - angleQ) * 60;
  const sign = rand.chance(0.5) ? 1 : -1;
  const lockDelta = clamp(LOCK_SWEET + sign * (1 - timingQ) * LOCK_TOLERANCE, 0.02, LOCK_WINDOW - 0.01);
  const slack = Math.max(0, spare - (headFirst ? 0.8 : 0));
  let entryAngleOffset = (rand.chance(0.5) ? 1 : -1) * angleErr;
  // Feet-first bots build their planned miss into the power of their last flip,
  // so the dive needs no correction time. Head-first bots rotate the last half
  // turn with hold-to-rotate, like the player.
  const powers = trickIds.map(() => 1);
  let aimOffset = entryAngleOffset;
  const lastFlip = trickIds.map((id, i) => [i, TRICKS[id].flip]).filter(([, f]) => f !== 0).at(-1);
  if (!headFirst) {
    if (lastFlip) {
      const [i, flip] = lastFlip;
      powers[i] = 1 + entryAngleOffset / (360 * flip);
      aimOffset = null; // nothing to aim: the flips land where planned
    } else {
      entryAngleOffset = Math.abs(entryAngleOffset); // can only rotate forward
      aimOffset = entryAngleOffset;
    }
  }
  return {
    trickIds,
    q,
    headFirst,
    powers,
    trickStartDelay: clamp(0.12 + rand() * Math.min(0.35, slack), 0.1, 0.6),
    lockDelta,
    entryAngleOffset,
    aimOffset,
    aimTarget: null,
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
    this.theme = themeFor(null);
  }

  setCompetition(comp) {
    this.comp = comp;
    this.theme = themeFor(comp);
    this.height = comp.height;
    // Choose gravity so a plain drop takes roughly comp.airTime seconds.
    const drop = comp.height - IMPACT_OFFSET + HIP_HEIGHT;
    this.gravity = (2 * (drop - JUMP_VY * comp.airTime)) / (comp.airTime * comp.airTime);
    this.airTime = comp.airTime;
    // The branded floatie sits beyond anywhere a diver can reach, so nobody ever lands on it.
    this.floatieX = this.maxReachX() + FLOATIE_HALF_WIDTH + FLOATIE_MARGIN;
  }

  /**
   * The farthest x any diver can reach at this venue: a full-power jump,
   * the drift through the water entry and surfacing, and the swim-off.
   */
  maxReachX() {
    const { vx } = jumpVelocity(1);
    const T = this.airTimeFor(1) + 0.15;
    const launch = 0.1 * (0.4 + 0.6);
    const flight = (vx * (1 - Math.exp(-0.08 * T))) / 0.08;
    const entry = 0.9 * (0.2 + vx * 0.1) + 0.6 * SURFACE_TIME;
    const reach = 0.9; // arms and hands extend past the hip
    return START_X + launch + flight + entry + SWIM_SPEED * SWIM_TIME + reach;
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
