// Simulation: divers, physics, trick execution and bot behaviour.
// Units: metres. x grows toward the water, y grows downward (cliff top = 0).

import { TRICKS } from './tricks.js';
import { LOCK_WINDOW, LOCK_SWEET, LOCK_TOLERANCE } from './scoring.js';

export const HIP_HEIGHT = 0.95; // hip above feet when standing
export const IMPACT_OFFSET = 0.45; // hip is this far above the surface at impact
export const JUMP_VY = -1.6; // initial vertical speed (negative = up)
export const JUMP_VX = 1.7; // initial horizontal speed

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const lerp = (a, b, t) => a + (b - a) * t;

function nearestVertical(angle) {
  // Nearest multiple of 180° (feet-first or head-first entries are both clean).
  return Math.round(angle / 180) * 180;
}

export function angleError(angle) {
  return Math.abs(angle - nearestVertical(angle));
}

export class Diver {
  constructor({ id, name, color, isPlayer = false, x = 0 }) {
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
    // pose
    this.angle = 0;
    this.tuck = 0;
    this.pike = 0;
    this.twist = 0;
    this.arms = 'nervous';
    this.lean = 0;
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
  }

  setState(s) {
    this.state = s;
    this.stateT = 0;
  }

  emit(type, data) {
    if (this.onEvent) this.onEvent(type, data, this);
  }

  // ---- control -----------------------------------------------------------

  jump(env) {
    if (this.state !== 'ready' && this.state !== 'crouch' && this.state !== 'idle') return false;
    this.setState('airborne');
    this.vx = JUMP_VX;
    this.vy = JUMP_VY;
    this.airT = 0;
    this.angle = 0;
    this.arms = 'out';
    this.lean = 0;
    // Analytical time of impact (hip reaches surface - IMPACT_OFFSET).
    const drop = env.height - IMPACT_OFFSET - this.y;
    const g = env.gravity;
    this.impactT = (-this.vy + Math.sqrt(this.vy * this.vy + 2 * g * drop)) / g;
    this.emit('jump');
    return true;
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
    this.current = {
      trick,
      t: 0,
      startAngle: this.angle,
      startTwist: this.twist,
    };
    this.arms = trick.shape === 'tuck' ? 'tuck' : trick.shape === 'pike' ? 'pike' : trick.shape === 'straight' ? 'cross' : 'out';
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
    this.arms = 'up';
    this.tuck = 0;
    this.pike = 0;
    this.emit('lock', { timeLeft, early: this.lockedEarly });
    return true;
  }

  // ---- update ------------------------------------------------------------

  update(dt, env, rand) {
    this.stateT += dt;
    switch (this.state) {
      case 'idle':
      case 'ready':
        this.updateIdle(dt);
        break;
      case 'walking':
        this.updateWalking(dt);
        break;
      case 'hesitate':
        this.updateIdle(dt);
        break;
      case 'crouch':
        this.updateIdle(dt);
        break;
      case 'airborne':
        this.updateAirborne(dt, env);
        break;
      case 'entering':
        this.updateEntering(dt, env);
        break;
      case 'swimming':
        this.x += 1.8 * dt;
        this.y = env.height + 0.25 + Math.sin(this.stateT * 6) * 0.05;
        if (this.stateT > 4) this.setState('gone');
        break;
      default:
        break;
    }
    void rand;
  }

  updateIdle(dt) {
    // Standing on the cliff top. Nervous wobble handled by the renderer.
    this.y = -HIP_HEIGHT;
    this.angle = lerp(this.angle, 0, Math.min(1, dt * 10));
    this.tuck = lerp(this.tuck, this.state === 'crouch' ? 0.35 : 0, Math.min(1, dt * 10));
    this.pike = 0;
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
    this.y = -HIP_HEIGHT;
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
      // Mostly-linear rotation with a touch of ease at the ends looks natural.
      const rot = p < 0.1 ? 5 * p * p : p > 0.9 ? 1 - 5 * (1 - p) * (1 - p) : 0.5 + (p - 0.5) * 1.0;
      void rot;
      this.angle = c.startAngle + c.trick.flip * 360 * p;
      this.twist = c.startTwist + c.trick.twist * p;
      const fold = Math.sin(Math.PI * p);
      this.tuck = c.trick.shape === 'tuck' || c.trick.shape === 'side' ? fold : 0;
      this.pike = c.trick.shape === 'pike' ? fold : 0;
      if (p >= 1) {
        this.completed.push(c.trick.id);
        this.current = null;
        this.emit('trickDone', { trick: c.trick });
        this.arms = 'out';
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
      this.tuck = lerp(this.tuck, 0, Math.min(1, dt * 12));
      this.pike = lerp(this.pike, 0, Math.min(1, dt * 12));
    } else {
      // Free-fall without input: body drifts slightly, arms flail a bit.
      this.tuck = lerp(this.tuck, 0, Math.min(1, dt * 6));
      this.pike = lerp(this.pike, 0, Math.min(1, dt * 6));
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
    // Sink and slow down, then swim off.
    this.vy = lerp(this.vy, 0, Math.min(1, dt * 3));
    this.y += this.vy * dt * 0.6;
    this.x += 0.4 * dt;
    this.angle = lerp(this.angle, nearestVertical(this.angle), Math.min(1, dt * 4));
    if (this.stateT > 1.2) {
      this.y = env.height + 0.25;
      this.angle = 0;
      this.arms = 'swim';
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
    for (const d of this.divers) d.update(dt, this, this.rand);
    for (const s of this.splashes) s.update(dt, this.gravity);
    this.splashes = this.splashes.filter((s) => !s.done);
  }
}
