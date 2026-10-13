// Simulation: divers, physics, trick execution and bot behaviour.
// Units: metres. x grows toward the water, y grows downward (cliff top = 0).

import { TRICKS } from './tricks.js';
import { LOCK_WINDOW, LOCK_SWEET, LOCK_TOLERANCE } from './scoring.js';
import { Rig, STANDING_HIP_HEIGHT } from './rig.js';

export const HIP_HEIGHT = STANDING_HIP_HEIGHT; // hip above feet when standing
export const IMPACT_OFFSET = 0.45; // hip is this far above the surface at impact
export const JUMP_VY = -1.6; // initial vertical speed (negative = up)
export const JUMP_VX = 1.7; // initial horizontal speed
const CROUCH_TIME = 0.17;
const LAUNCH_TIME = 0.1;

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const lerp = (a, b, t) => a + (b - a) * t;

function nearestVertical(angle) {
  // Nearest multiple of 180° (feet-first or head-first entries are both clean).
  return Math.round(angle / 180) * 180;
}

export function angleError(angle) {
  return Math.abs(angle - nearestVertical(angle));
}

/** Rotation progress profile: slow in, fast through the middle, slow out. */
function spinProfile(p, peak) {
  return p - (Math.sin(2 * Math.PI * p) / (2 * Math.PI)) * peak;
}

export class Diver {
  constructor({ id, name, color, isPlayer = false, x = 0, hairStyle = 'spiky', hairColor = '#2b1d12', idleStyle = 'stand' }) {
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
    this.rig = new Rig({ hairStyle, hairColor, idleStyle });
    // pose
    this.angle = 0;
    this.twist = 0;
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
    this.entryTwistErr = 0;
    this.result = null;
    this.plan = null; // bots only
    this.walkTarget = null;
    this.onEvent = null;
    this.sinkDepth = 0;
    this.pendingJump = false;
  }

  setState(s) {
    this.state = s;
    this.stateT = 0;
  }

  emit(type, data) {
    if (this.onEvent) this.onEvent(type, data, this);
  }

  // ---- control -----------------------------------------------------------

  /** Begin the jump: crouch, extend, then leave the edge. */
  jump() {
    if (!['ready', 'idle', 'hesitate'].includes(this.state)) return false;
    this.setState('crouch');
    this.pendingJump = true;
    return true;
  }

  takeOff(env) {
    this.setState('airborne');
    this.vx = JUMP_VX;
    this.vy = JUMP_VY;
    this.airT = 0;
    this.angle = 0;
    this.twist = 0;
    this.pendingJump = false;
    // Analytical time of impact (hip reaches surface - IMPACT_OFFSET).
    const drop = env.height - IMPACT_OFFSET - this.y;
    const g = env.gravity;
    this.impactT = (-this.vy + Math.sqrt(this.vy * this.vy + 2 * g * drop)) / g;
    this.emit('jump');
  }

  queueTrick(trickId) {
    if (this.state !== 'airborne' || this.locked) return false;
    if (!this.current) {
      this.startTrick(trickId);
    } else if (this.queue.length < 1) {
      this.queue.push(trickId);
    } else {
      return false;
    }
    return true;
  }

  startTrick(trickId) {
    const trick = TRICKS[trickId];
    this.current = { trick, t: 0, startAngle: this.angle, startTwist: this.twist };
    this.emit('trickStart', { trick, timeLeft: this.impactT - this.airT });
  }

  lock() {
    if (this.state !== 'airborne' || this.locked) return false;
    const timeLeft = this.impactT - this.airT;
    this.locked = true;
    this.queue = [];
    if (this.current) {
      // Abort the trick; the body will ease toward vertical.
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
    switch (this.state) {
      case 'idle':
      case 'ready':
      case 'hesitate':
        this.updateIdle(dt);
        break;
      case 'crouch':
        this.updateIdle(dt);
        if (this.stateT >= CROUCH_TIME) this.setState('launch');
        break;
      case 'launch':
        this.y = -HIP_HEIGHT + 0.06 * (1 - this.stateT / LAUNCH_TIME); // rising out of the crouch
        this.x += 0.6 * dt;
        if (this.stateT >= LAUNCH_TIME) this.takeOff(env);
        break;
      case 'walking':
        this.updateWalking(dt);
        break;
      case 'airborne':
        this.updateAirborne(dt, env);
        break;
      case 'entering':
        this.updateEntering(dt, env);
        break;
      case 'surfacing': {
        const k = clamp(this.stateT / 0.6, 0, 1);
        const ease = 1 - (1 - k) * (1 - k);
        this.y = lerp(this.sinkDepth, env.height + 0.12, ease);
        this.x += 0.5 * dt;
        this.angle = lerp(this.angle, 0, Math.min(1, dt * 6));
        this.vy = 0;
        if (this.stateT >= 0.6) {
          this.setState('swimming');
          this.emit('surfaced');
        }
        break;
      }
      case 'swimming':
        this.x += 1.7 * dt;
        this.y = env.height + 0.12 + Math.sin(this.stateT * 5) * 0.03;
        this.angle = Math.sin(this.stateT * 5) * 2;
        if (this.stateT > 4) this.setState('gone');
        break;
      default:
        break;
    }
    if (this.state !== 'gone') this.rig.update(dt, this, env, time);
    void rand;
  }

  updateIdle(dt) {
    // Standing on the cliff top; the rig handles the nervous animation.
    const crouchDrop = this.state === 'crouch' ? 0.1 * clamp(this.stateT / CROUCH_TIME, 0, 1) : 0;
    this.y = -HIP_HEIGHT + crouchDrop;
    this.angle = lerp(this.angle, 0, Math.min(1, dt * 10));
    this.twist = 0;
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
    this.y = -HIP_HEIGHT + Math.abs(Math.sin(this.stateT * 8.5)) * 0.02;
  }

  updateAirborne(dt, env) {
    this.airT += dt;
    this.vy += env.gravity * dt;
    this.y += this.vy * dt;
    this.x += this.vx * dt;
    this.vx *= 1 - 0.08 * dt;

    // Bot autopilot: feed tricks and lock from the plan.
    if (this.plan) this.updateBotAutopilot();

    // Tricks
    if (this.current) {
      const c = this.current;
      c.t += dt;
      const p = clamp(c.t / c.trick.duration, 0, 1);
      // Tucked shapes spin faster through the middle (angular momentum).
      const peak = c.trick.shape === 'tuck' || c.trick.shape === 'side' ? 0.75 : c.trick.shape === 'layout' ? 0.45 : 0.55;
      const s = spinProfile(p, peak);
      this.angle = c.startAngle + c.trick.flip * 360 * s;
      this.twist = c.startTwist + c.trick.twist * spinProfile(p, 0.5);
      if (p >= 1) {
        this.completed.push(c.trick.id);
        this.current = null;
        this.emit('trickDone', { trick: c.trick });
        if (this.queue.length > 0) this.startTrick(this.queue.shift());
      }
    } else if (this.locked) {
      // Ease into the entry line.
      const rate = 260 * dt;
      const d = this.lockAngleTarget - this.angle;
      this.angle += clamp(d, -rate, rate);
      // Finish any partial twist.
      const tw = Math.round(this.twist * 2) / 2;
      this.twist += clamp(tw - this.twist, -2 * dt, 2 * dt);
    } else {
      // Free-fall without input: the body drifts slightly.
      this.angle += (this.plan ? 0 : 6) * dt;
    }

    if (this.airT >= this.impactT) {
      this.enterWater(env);
    }
  }

  enterWater(env) {
    // Any whole or half twist leaves the body vertical; penalise partial twists.
    const twistFrac = ((this.twist % 0.5) + 0.5) % 0.5;
    this.entryTwistErr = Math.min(twistFrac, 0.5 - twistFrac) * 4 * 45; // degrees-equivalent
    const stillTricking = this.current != null;
    this.entryAngleErr = angleError(this.angle) + this.entryTwistErr + (stillTricking ? 10 : 0);
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
  }

  updateEntering(dt, env) {
    // Water drag: a clean entry slices deep, a flop stops short.
    const clean = clamp(1 - this.entryAngleErr / 60, 0, 1);
    const drag = 2.2 + (1 - clean) * 6;
    this.vy *= Math.exp(-drag * dt);
    this.y += this.vy * dt;
    this.x += (0.2 + this.vx * 0.1) * dt;
    this.vx *= Math.exp(-3 * dt);
    // Tumble to a float: the body relaxes toward horizontal-ish face-down.
    const target = nearestVertical(this.angle) + (this.entryAngleErr > 25 ? 60 : 20);
    this.angle = lerp(this.angle, target, Math.min(1, dt * 1.5));
    this.twist = lerp(this.twist, Math.round(this.twist * 2) / 2, Math.min(1, dt * 4));
    if (this.stateT > 0.9) {
      this.sinkDepth = this.y;
      this.setState('surfacing');
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
    if (!this.locked && plan.nextIndex >= plan.trickIds.length && !this.current) {
      if (timeLeft <= plan.lockDelta) this.lock();
    }
    // Mid-air "sloppy" bots: drift the angle a little.
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
