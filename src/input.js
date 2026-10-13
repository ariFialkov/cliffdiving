// Pointer input: taps (click/touch) and swipes (mouse or trackpad movement
// without pressing, or touch drags). Also keyboard fallbacks.

import { classifySwipe } from './tricks.js';

const SWIPE_START_SPEED = 0.45; // px per ms (unpressed pointer)
const SWIPE_END_SPEED = 0.18;
const SWIPE_END_IDLE_MS = 70;
const SWIPE_MAX_MS = 1100;
const SWIPE_MIN_LEN = 40;
const SWIPE_COOLDOWN_MS = 140;
const TAP_MAX_MS = 350;
const TAP_MAX_MOVE = 14;

export class InputController {
  constructor(target, handlers) {
    this.target = target;
    this.handlers = handlers; // { onTap, onSwipe, onKey }
    this.enabled = true;
    this.swipeEnabled = false;
    this.pts = [];
    this.active = false;
    this.pressed = false;
    this.pressStart = null;
    this.last = null;
    this.idleMs = 0;
    this.startT = 0;
    this.cooldownUntil = 0;
    this.pathLen = 0;
    this.endTimer = null;
    this._bind();
  }

  _bind() {
    const t = this.target;
    t.addEventListener('pointerdown', (e) => this.onDown(e));
    window.addEventListener('pointerup', (e) => this.onUp(e));
    window.addEventListener('pointercancel', (e) => this.onUp(e));
    window.addEventListener('pointermove', (e) => this.onMove(e), { passive: true });
    window.addEventListener('keydown', (e) => this.onKey(e));
    t.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  isUiTarget(e) {
    return e.target && e.target.closest && e.target.closest('.ui');
  }

  onDown(e) {
    if (!this.enabled || this.isUiTarget(e)) return;
    this.pressed = true;
    this.pressStart = { x: e.clientX, y: e.clientY, t: e.timeStamp, id: e.pointerId };
    if (this.active) this.finishSwipe(e.timeStamp);
    this.last = { x: e.clientX, y: e.clientY, t: e.timeStamp };
    this.pts = [];
    this.pathLen = 0;
  }

  onUp(e) {
    if (!this.enabled) return;
    const wasPressed = this.pressed;
    this.pressed = false;
    if (this.active) {
      this.finishSwipe(e.timeStamp);
      this.pressStart = null;
      return;
    }
    if (wasPressed && this.pressStart) {
      const dt = e.timeStamp - this.pressStart.t;
      const dist = Math.hypot(e.clientX - this.pressStart.x, e.clientY - this.pressStart.y);
      if (dt <= TAP_MAX_MS && dist <= TAP_MAX_MOVE) this.handlers.onTap?.(e);
    }
    this.pressStart = null;
  }

  onMove(e) {
    if (!this.enabled) return;
    const now = e.timeStamp;
    const p = { x: e.clientX, y: e.clientY, t: now };
    if (!this.last) {
      this.last = p;
      return;
    }
    const dtm = Math.max(1, now - this.last.t);
    const dist = Math.hypot(p.x - this.last.x, p.y - this.last.y);
    const speed = dist / dtm;
    const pressed = this.pressed && e.buttons !== 0;

    if (!this.swipeEnabled) {
      this.last = p;
      if (this.active) this.active = false;
      return;
    }

    if (!this.active) {
      const start = pressed ? dist > 6 : speed > SWIPE_START_SPEED;
      if (start && now >= this.cooldownUntil && !this.isUiTarget(e)) {
        this.active = true;
        this.startT = now;
        this.idleMs = 0;
        this.pathLen = dist;
        this.pts = [{ x: this.last.x, y: this.last.y }, { x: p.x, y: p.y }];
      }
    } else {
      this.pts.push({ x: p.x, y: p.y });
      this.pathLen += dist;
      if (!pressed) {
        if (speed < SWIPE_END_SPEED) this.idleMs += dtm;
        else this.idleMs = 0;
        if (this.idleMs >= SWIPE_END_IDLE_MS) this.finishSwipe(now);
        else {
          // A flick that stops dead produces no further events: close it by timer.
          clearTimeout(this.endTimer);
          this.endTimer = setTimeout(() => {
            if (this.active && !this.pressed) this.finishSwipe(performance.now());
          }, SWIPE_END_IDLE_MS + 30);
        }
      }
      if (this.active && now - this.startT > SWIPE_MAX_MS) this.finishSwipe(now);
    }
    this.last = p;
  }

  finishSwipe(now) {
    clearTimeout(this.endTimer);
    this.endTimer = null;
    this.active = false;
    this.cooldownUntil = now + SWIPE_COOLDOWN_MS;
    const pts = this.pts;
    this.pts = [];
    if (this.pathLen < SWIPE_MIN_LEN) return;
    const result = classifySwipe(pts);
    if (result) this.handlers.onSwipe?.(result);
  }

  onKey(e) {
    if (!this.enabled) return;
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    const map = {
      ArrowDown: 'fronttuck',
      ArrowUp: 'gainer',
      ArrowLeft: 'corkscrew',
      ArrowRight: 'corkscrew',
      KeyJ: 'jackknife',
      KeyB: 'barani',
      KeyS: 'sideflip',
    };
    if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      this.handlers.onTap?.(e);
    } else if (map[e.code] && this.swipeEnabled) {
      e.preventDefault();
      this.handlers.onSwipe?.({ trick: map[e.code], dirs: ['key'] });
    }
  }
}
