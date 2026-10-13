// Pointer + keyboard input.
//   - press start / end (charging the jump: hold the screen, mouse or Space)
//   - taps (lock the entry in mid-air)
//   - swipes: touch drags, or quick mouse / trackpad movement with no button
//   - modifier for tuck variants: Shift, or a second finger held on the screen

import { StrokeBuffer } from './tricks.js';

const HOVER_START_SPEED = 1.0; // px/ms: a deliberate flick, not ordinary cursor travel
const HOVER_END_SPEED = 0.35;
const HOVER_MIN_AVG_SPEED = 0.8; // the stroke as a whole must be flick-fast
const HOVER_END_IDLE_MS = 110; // slow time needed to end a hover stroke (corners are shorter)
const SWIPE_MAX_MS = 1300;
const SWIPE_MIN_LEN = 40;
const PRESS_SWIPE_START = 10; // px a pressed pointer must move to become a swipe
const TAP_MAX_MS = 350;
const TAP_MAX_MOVE = 14;

export class InputController {
  constructor(target, handlers) {
    this.target = target;
    this.handlers = handlers; // { onPressStart(src), onPressEnd(src), onTap, onSwipe }
    this.enabled = true;
    this.swipeEnabled = false;
    this.shift = false;
    this.pointers = new Map(); // pressed pointers by id
    this.swipe = null; // { pointerId|null, pts, len, startT, modifier, idleMs }
    this.hoverLast = null;
    this.endTimer = null;
    this.spaceDown = false;
    this.buffer = new StrokeBuffer((r) => this.handlers.onSwipe?.(r));
    this._bind();
  }

  _bind() {
    const t = this.target;
    t.addEventListener('pointerdown', (e) => this.onDown(e));
    window.addEventListener('pointerup', (e) => this.onUp(e));
    window.addEventListener('pointercancel', (e) => this.onUp(e, true));
    window.addEventListener('pointermove', (e) => this.onMove(e), { passive: true });
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => {
      this.shift = false;
      if (this.spaceDown) {
        this.spaceDown = false;
        this.handlers.onPressEnd?.('key');
      }
    });
    t.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  isUiTarget(e) {
    return e.target && e.target.closest && e.target.closest('.ui');
  }

  get modifierActive() {
    return this.shift || this.pointers.size >= 2;
  }

  // ---- pointer -------------------------------------------------------------
  onDown(e) {
    if (!this.enabled || this.isUiTarget(e)) return;
    if (e.shiftKey) this.shift = true;
    const first = this.pointers.size === 0;
    // Any pointer that shares the screen with another can never be a tap.
    for (const p of this.pointers.values()) p.multi = true;
    this.pointers.set(e.pointerId, {
      id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: e.timeStamp,
      x: e.clientX, y: e.clientY, moved: 0, multi: !first, first,
    });
    if (this.swipe) this.swipe.modifier = true;
    else if (!first) this.buffer.setModifier();
    // A hover swipe in progress is finished by a click.
    if (this.swipe && this.swipe.pointerId == null) this.finishSwipe();
    if (first) this.handlers.onPressStart?.('pointer');
  }

  onUp(e, cancelled = false) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    this.pointers.delete(e.pointerId);
    if (!this.enabled) return;
    if (this.swipe && this.swipe.pointerId === e.pointerId) {
      this.finishSwipe();
    } else if (!cancelled && !p.multi && !p.swiped) {
      const dt = e.timeStamp - p.t0;
      if (dt <= TAP_MAX_MS && p.moved <= TAP_MAX_MOVE) this.handlers.onTap?.(e);
    }
    if (p.first) this.handlers.onPressEnd?.('pointer');
  }

  onMove(e) {
    if (!this.enabled) return;
    if (e.pointerType === 'mouse') this.shift = e.shiftKey;
    const p = this.pointers.get(e.pointerId);
    if (p) {
      this.onPressedMove(e, p);
      return;
    }
    if (e.pointerType === 'mouse' || e.pointerType === 'pen' || e.pointerType === '') this.onHoverMove(e);
  }

  onPressedMove(e, p) {
    const dist = Math.hypot(e.clientX - p.x, e.clientY - p.y);
    p.moved = Math.max(p.moved, Math.hypot(e.clientX - p.x0, e.clientY - p.y0));
    p.x = e.clientX;
    p.y = e.clientY;
    if (!this.swipeEnabled) return;
    if (this.swipe && this.swipe.pointerId === e.pointerId) {
      this.swipe.pts.push({ x: e.clientX, y: e.clientY });
      this.swipe.len += dist;
      if (this.modifierActive) this.swipe.modifier = true;
      return;
    }
    if (!this.swipe && p.moved > PRESS_SWIPE_START) {
      p.swiped = true;
      this.swipe = {
        pointerId: e.pointerId, pts: [{ x: p.x0, y: p.y0 }, { x: e.clientX, y: e.clientY }],
        len: p.moved, startT: e.timeStamp, modifier: this.modifierActive, idleMs: 0,
      };
    }
  }

  onHoverMove(e) {
    const now = e.timeStamp;
    const pt = { x: e.clientX, y: e.clientY, t: now };
    const last = this.hoverLast;
    this.hoverLast = pt;
    if (!last || !this.swipeEnabled) {
      if (this.swipe && this.swipe.pointerId == null) this.swipe = null;
      return;
    }
    const dtm = Math.max(1, now - last.t);
    const dist = Math.hypot(pt.x - last.x, pt.y - last.y);
    const speed = dist / dtm;
    const s = this.swipe;
    if (!s) {
      if (speed > HOVER_START_SPEED && !this.isUiTarget(e)) {
        this.swipe = {
          pointerId: null, pts: [{ x: last.x, y: last.y }, { x: pt.x, y: pt.y }],
          len: dist, startT: last.t, lastFastT: now, modifier: this.modifierActive, idleMs: 0,
        };
        this.armEndTimer();
      }
      return;
    }
    if (s.pointerId != null) return; // a pressed swipe owns the gesture
    s.pts.push({ x: pt.x, y: pt.y });
    s.len += dist;
    if (this.modifierActive) s.modifier = true;
    if (speed < HOVER_END_SPEED) s.idleMs += dtm;
    else {
      s.idleMs = 0;
      s.lastFastT = now;
    }
    if (s.idleMs >= HOVER_END_IDLE_MS || now - s.startT > SWIPE_MAX_MS) this.finishSwipe();
    else this.armEndTimer();
  }

  armEndTimer() {
    // A stroke that stops dead produces no more events: close it by timer.
    clearTimeout(this.endTimer);
    this.endTimer = setTimeout(() => {
      if (this.swipe && this.swipe.pointerId == null) this.finishSwipe();
    }, HOVER_END_IDLE_MS + 20);
  }

  finishSwipe() {
    clearTimeout(this.endTimer);
    this.endTimer = null;
    const s = this.swipe;
    this.swipe = null;
    if (!s || s.len < SWIPE_MIN_LEN) return;
    if (s.pointerId == null) {
      // Ignore the slow tail when judging how fast a hover stroke was.
      const activeMs = Math.max(1, (s.lastFastT ?? s.startT) - s.startT);
      if (s.len / activeMs < HOVER_MIN_AVG_SPEED) return;
    }
    this.buffer.push(s.pts, s.modifier || this.modifierActive);
  }

  resetGestures() {
    this.swipe = null;
    this.buffer.cancel();
  }

  // ---- keyboard ------------------------------------------------------------
  onKey(e, down) {
    if (e.key === 'Shift') this.shift = down;
    if (!this.enabled) return;
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      if (down && !e.repeat && !this.spaceDown) {
        this.spaceDown = true;
        this.handlers.onPressStart?.('key');
      } else if (!down && this.spaceDown) {
        this.spaceDown = false;
        this.handlers.onPressEnd?.('key');
      }
      return;
    }
    if (!down || e.repeat || !this.swipeEnabled) return;
    const mod = e.shiftKey;
    const map = {
      ArrowDown: mod ? 'fronttuck' : 'frontflip',
      ArrowUp: mod ? 'backtuck' : 'backflip',
      ArrowLeft: 'corkscrew',
      ArrowRight: 'corkscrew',
      KeyG: 'gainer',
      KeyJ: 'jackknife',
      KeyB: 'barani',
      KeyS: 'sideflip',
    };
    if (map[e.code]) {
      e.preventDefault();
      this.handlers.onSwipe?.({ trick: map[e.code], dirs: ['key'], compound: false });
    }
  }
}
