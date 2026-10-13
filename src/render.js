// Canvas renderer: cartoon side view of the cliff, water and stickmen.

import { HIP_HEIGHT } from './world.js';

const TAU = Math.PI * 2;
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const lerp = (a, b, t) => a + (b - a) * t;

export class Camera {
  constructor() {
    this.x = 0.8;
    this.y = 0.6;
    this.tx = 0.8;
    this.ty = 0.6;
    this.ppm = 40;
    this.shake = 0;
  }

  follow(x, y, snap = false) {
    this.tx = x;
    this.ty = y;
    if (snap) {
      this.x = x;
      this.y = y;
    }
  }

  update(dt) {
    const k = Math.min(1, dt * 6);
    this.x = lerp(this.x, this.tx, k);
    this.y = lerp(this.y, this.ty, k);
    this.shake = Math.max(0, this.shake - dt * 2.5);
  }
}

/** Cliff face x position (metres) at a given depth y. Negative = into the rock. */
export function cliffFaceX(y, height) {
  if (y <= 0) return 0;
  const t = y / height;
  return -0.25 - 1.1 * t + 0.28 * Math.sin(y * 0.9 + 0.4) + 0.12 * Math.sin(y * 2.3);
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.w = 0;
    this.h = 0;
    this.dpr = 1;
    this.camera = new Camera();
    this.clouds = Array.from({ length: 7 }, (_, i) => ({
      x: (i / 7) * 60 - 20 + Math.random() * 6,
      y: -8 + Math.random() * 10,
      s: 0.8 + Math.random() * 1.2,
      v: 0.15 + Math.random() * 0.2,
    }));
    this.birds = Array.from({ length: 3 }, (_, i) => ({ x: 8 + i * 4, y: -6 - i * 1.5, p: i }));
    this.time = 0;
    this.resize();
  }

  resize() {
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.dpr = dpr;
    this.w = w;
    this.h = h;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.camera.ppm = clamp(Math.min(h / 17, w / 11), 22, 46);
  }

  toScreen(x, y) {
    const c = this.camera;
    const shx = c.shake > 0 ? Math.sin(this.time * 60) * c.shake * 6 : 0;
    return [
      (x - c.x) * c.ppm + this.w * 0.5 + shx,
      (y - c.y) * c.ppm + this.h * 0.5,
    ];
  }

  draw(world, dt) {
    this.time += dt;
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const { w, h } = this;
    const ppm = this.camera.ppm;
    this.drawSky(ctx, w, h, world);
    this.drawBackdrop(ctx, world);
    this.drawWater(ctx, world, 'back');
    this.drawCliff(ctx, world);
    for (const d of world.divers) {
      if (d.state === 'gone') continue;
      this.drawDiver(ctx, d, world);
    }
    this.drawWater(ctx, world, 'front');
    for (const s of world.splashes) this.drawSplash(ctx, s);
    void ppm;
  }

  drawSky(ctx, w, h, world) {
    const [, waterY] = this.toScreen(0, world.height);
    const g = ctx.createLinearGradient(0, 0, 0, Math.max(h, waterY));
    g.addColorStop(0, '#4fb0ea');
    g.addColorStop(0.55, '#9ad8f7');
    g.addColorStop(1, '#dff3fb');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // Sun (fixed to the sky, slight parallax).
    const sx = w * 0.78 - this.camera.x * 2;
    const sy = h * 0.14 - this.camera.y * 2;
    ctx.fillStyle = 'rgba(255, 250, 200, 0.28)';
    ctx.beginPath();
    ctx.arc(sx, sy, 54, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ffe066';
    ctx.beginPath();
    ctx.arc(sx, sy, 34, 0, TAU);
    ctx.fill();
    // Clouds
    for (const c of this.clouds) {
      c.x += c.v * 0.016;
      if (c.x > 40) c.x = -25;
      const cx = (c.x - this.camera.x * 0.25) * this.camera.ppm + w * 0.5;
      const cy = (c.y - this.camera.y * 0.25) * this.camera.ppm + h * 0.5;
      this.drawCloud(ctx, cx, cy, c.s * this.camera.ppm * 0.9);
    }
    // Birds
    for (const b of this.birds) {
      b.x -= 0.4 * 0.016;
      if (b.x < -20) b.x = 30;
      const bx = (b.x - this.camera.x * 0.5) * this.camera.ppm + w * 0.5;
      const by = (b.y - this.camera.y * 0.5) * this.camera.ppm + h * 0.5;
      const flap = Math.sin(this.time * 7 + b.p) * 4;
      ctx.strokeStyle = 'rgba(40,50,70,0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(bx - 8, by + flap);
      ctx.quadraticCurveTo(bx - 3, by - 3, bx, by);
      ctx.quadraticCurveTo(bx + 3, by - 3, bx + 8, by + flap);
      ctx.stroke();
    }
  }

  drawCloud(ctx, x, y, s) {
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.beginPath();
    ctx.arc(x, y, s * 0.5, 0, TAU);
    ctx.arc(x + s * 0.55, y - s * 0.15, s * 0.6, 0, TAU);
    ctx.arc(x + s * 1.2, y, s * 0.5, 0, TAU);
    ctx.arc(x + s * 0.6, y + s * 0.2, s * 0.5, 0, TAU);
    ctx.fill();
  }

  drawBackdrop(ctx, world) {
    // Distant islands sitting on the horizon, right side.
    const [, waterY] = this.toScreen(0, world.height);
    const ppm = this.camera.ppm;
    const px = -this.camera.x * 0.4 * ppm;
    ctx.fillStyle = '#7fbfd9';
    for (let i = 0; i < 4; i++) {
      const bx = this.w * 0.45 + i * this.w * 0.22 + px;
      const bw = this.w * 0.26;
      const bh = ppm * (1.2 + (i % 2) * 0.9);
      ctx.beginPath();
      ctx.moveTo(bx - bw / 2, waterY);
      ctx.quadraticCurveTo(bx - bw * 0.2, waterY - bh, bx, waterY - bh * 0.8);
      ctx.quadraticCurveTo(bx + bw * 0.25, waterY - bh * 1.1, bx + bw / 2, waterY);
      ctx.fill();
    }
  }

  drawWater(ctx, world, layer) {
    const ppm = this.camera.ppm;
    const [, waterY] = this.toScreen(0, world.height);
    const w = this.w;
    const h = this.h;
    if (waterY > h + 40) return;
    const t = this.time;
    const amp = ppm * 0.08;
    const wave = (x, phase) =>
      Math.sin(x / ppm * 1.3 + t * 1.6 + phase) * amp + Math.sin(x / ppm * 2.9 - t * 2.3 + phase) * amp * 0.5;
    if (layer === 'back') {
      const g = ctx.createLinearGradient(0, waterY, 0, waterY + ppm * 12);
      g.addColorStop(0, '#2f8fd6');
      g.addColorStop(1, '#123f78');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += 8) ctx.lineTo(x, waterY + wave(x, 0));
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();
    } else {
      // Foreground translucent band gives divers a "submerged" look.
      ctx.fillStyle = 'rgba(70, 160, 220, 0.55)';
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += 8) ctx.lineTo(x, waterY + wave(x, 1.7) + ppm * 0.06);
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();
      // Foam line
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 8) {
        const y = waterY + wave(x, 1.7) + ppm * 0.06;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  drawCliff(ctx, world) {
    const ppm = this.camera.ppm;
    const H = world.height;
    const [edgeX, topY] = this.toScreen(0, 0);
    const [, waterY] = this.toScreen(0, H);
    const bottomY = Math.min(this.h + 50, waterY + ppm * 6);
    if (topY > this.h + 50 && edgeX < -50) return;
    // Rock body
    ctx.fillStyle = '#8b5e3c';
    ctx.beginPath();
    ctx.moveTo(-50, topY);
    ctx.lineTo(edgeX, topY);
    const steps = 40;
    for (let i = 1; i <= steps; i++) {
      const y = (i / steps) * (H + 6);
      const [sx, sy] = this.toScreen(cliffFaceX(y, H), y);
      ctx.lineTo(sx, Math.min(sy, bottomY + 200));
    }
    ctx.lineTo(-50, bottomY + 200);
    ctx.closePath();
    ctx.fill();
    // Rock strata (darker bands)
    ctx.save();
    ctx.clip();
    ctx.fillStyle = 'rgba(70, 42, 26, 0.35)';
    for (let y = 1.2; y < H + 6; y += 2.6) {
      const [, sy] = this.toScreen(0, y);
      const [, sy2] = this.toScreen(0, y + 0.5 + Math.sin(y) * 0.2);
      ctx.beginPath();
      ctx.moveTo(-50, sy);
      ctx.lineTo(edgeX + 40, sy + Math.sin(y * 3) * 6);
      ctx.lineTo(edgeX + 40, sy2 + Math.sin(y * 3) * 6);
      ctx.lineTo(-50, sy2);
      ctx.closePath();
      ctx.fill();
    }
    // Highlights
    ctx.fillStyle = 'rgba(255, 220, 180, 0.12)';
    for (let y = 0.5; y < H + 6; y += 3.1) {
      const [sx, sy] = this.toScreen(cliffFaceX(y, H) - 0.4, y);
      ctx.beginPath();
      ctx.ellipse(sx - ppm * 0.7, sy, ppm * 0.9, ppm * 0.25, 0, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
    // Grass lip
    ctx.fillStyle = '#5fb24f';
    ctx.beginPath();
    ctx.moveTo(-50, topY - ppm * 0.18);
    ctx.lineTo(edgeX + ppm * 0.05, topY - ppm * 0.18);
    ctx.quadraticCurveTo(edgeX + ppm * 0.12, topY + ppm * 0.12, edgeX - ppm * 0.1, topY + ppm * 0.3);
    ctx.lineTo(-50, topY + ppm * 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#7ccf6a';
    ctx.fillRect(-50, topY - ppm * 0.18, edgeX + 52, ppm * 0.12);
    // Tufts of grass
    ctx.strokeStyle = '#3f8f35';
    ctx.lineWidth = 2;
    for (let i = 0; i < 12; i++) {
      const gx = edgeX - i * ppm * 0.9 - ppm * 0.3;
      if (gx < -10) break;
      ctx.beginPath();
      ctx.moveTo(gx, topY - ppm * 0.15);
      ctx.lineTo(gx - 3, topY - ppm * 0.42);
      ctx.moveTo(gx + 4, topY - ppm * 0.15);
      ctx.lineTo(gx + 7, topY - ppm * 0.4);
      ctx.stroke();
    }
    // A small bush and a sign post further back for charm.
    const [bx, by] = this.toScreen(-6.5, 0);
    ctx.fillStyle = '#3e9a3d';
    ctx.beginPath();
    ctx.arc(bx, by - ppm * 0.45, ppm * 0.5, 0, TAU);
    ctx.arc(bx + ppm * 0.5, by - ppm * 0.35, ppm * 0.4, 0, TAU);
    ctx.arc(bx - ppm * 0.45, by - ppm * 0.3, ppm * 0.38, 0, TAU);
    ctx.fill();
    const [px, py] = this.toScreen(-8.2, 0);
    ctx.strokeStyle = '#6b4a2b';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(px, py - ppm * 0.15);
    ctx.lineTo(px, py - ppm * 1.7);
    ctx.stroke();
    ctx.fillStyle = '#f3e3b8';
    ctx.strokeStyle = '#6b4a2b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(px - ppm * 0.6, py - ppm * 2.2, ppm * 1.2, ppm * 0.55, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#5a3d22';
    ctx.font = `bold ${Math.round(ppm * 0.3)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${H}m`, px, py - ppm * 1.93);
    // Depth marks on the cliff face: a cartoon "height ruler".
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.font = `bold ${Math.round(ppm * 0.26)}px system-ui, sans-serif`;
    ctx.textAlign = 'right';
    for (let m = 5; m < H; m += 5) {
      const [mx, my] = this.toScreen(cliffFaceX(m, H), m);
      ctx.fillRect(mx - ppm * 0.5, my - 1, ppm * 0.4, 2);
      ctx.fillText(`${H - m}m`, mx - ppm * 0.6, my);
    }
  }

  drawDiver(ctx, d, world) {
    const ppm = this.camera.ppm;
    const [sx, sy] = this.toScreen(d.x, d.y);
    if (sx < -100 || sx > this.w + 100 || sy < -150 || sy > this.h + 150) return;
    const t = this.time;
    const idle = d.state === 'idle' || d.state === 'ready' || d.state === 'hesitate' || d.state === 'crouch' || d.state === 'walking';
    const nervous = idle ? Math.sin(t * 14 + d.idleSeed) * 0.012 : 0;
    const breathe = idle ? Math.sin(t * 2.5 + d.idleSeed) * 0.02 : 0;
    const lw = Math.max(2, ppm * 0.085);
    const skin = '#ffd9b3';
    const ink = '#232637';

    ctx.save();
    ctx.translate(sx + nervous * ppm, sy);
    ctx.scale(ppm, ppm);
    const peek = d.state === 'ready' || d.state === 'hesitate' ? 0.18 : d.state === 'idle' ? 0.05 : 0;
    ctx.rotate(((d.angle + (idle ? (d.lean + peek * 60) : 0)) * Math.PI) / 180);
    // Twist: squash horizontally to fake rotation about the long axis.
    const twistScale = d.twist ? Math.cos(d.twist * TAU) : 1;
    const sxScale = idle ? 1 : Math.sign(twistScale || 1) * Math.max(0.28, Math.abs(twistScale));
    ctx.scale(sxScale, 1);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = lw / ppm;

    const walkPhase = d.state === 'walking' ? Math.sin(t * 9) : 0;
    // Legs
    const tuck = d.tuck;
    const pike = d.pike;
    const legAng = (pike * 115 * Math.PI) / 180; // rotate legs forward about hip
    const crouch = d.state === 'crouch' ? 0.35 : 0;
    const bend = Math.max(tuck, crouch);
    const kneeF = { x: 0.32 * bend + 0.12 * walkPhase, y: 0.42 - 0.3 * bend };
    const ankF = { x: 0.12 * bend + 0.2 * walkPhase, y: 0.9 - 0.52 * bend };
    const kneeB = { x: 0.3 * bend - 0.12 * walkPhase, y: 0.44 - 0.28 * bend };
    const ankB = { x: 0.1 * bend - 0.2 * walkPhase, y: 0.9 - 0.5 * bend };
    const rot = (p) => ({ x: p.x * Math.cos(legAng) - p.y * Math.sin(legAng), y: p.x * Math.sin(legAng) + p.y * Math.cos(legAng) });
    const hipY = idle ? -breathe : 0;
    ctx.strokeStyle = ink;
    for (const [k, a] of [
      [rot(kneeB), rot(ankB)],
      [rot(kneeF), rot(ankF)],
    ]) {
      ctx.beginPath();
      ctx.moveTo(0, hipY);
      ctx.lineTo(k.x, k.y + hipY);
      ctx.lineTo(a.x, a.y + hipY);
      ctx.stroke();
      // feet
      ctx.beginPath();
      ctx.moveTo(a.x, a.y + hipY);
      ctx.lineTo(a.x + 0.16, a.y + hipY);
      ctx.stroke();
    }
    // Torso (team colour), curled forward when tucked/piked.
    const fold = Math.max(tuck * 0.6, pike * 0.5);
    const shoulder = { x: 0.35 * fold, y: -0.55 + 0.12 * fold + hipY };
    ctx.strokeStyle = d.color;
    ctx.lineWidth = (lw * 2.4) / ppm;
    ctx.beginPath();
    ctx.moveTo(0, hipY);
    ctx.quadraticCurveTo(0.08 * fold, -0.3 + hipY, shoulder.x, shoulder.y);
    ctx.stroke();
    // Arms
    ctx.strokeStyle = ink;
    ctx.lineWidth = lw / ppm;
    const arms = this.armPoses(d, t, fold, shoulder);
    for (const [e, hnd] of arms) {
      ctx.beginPath();
      ctx.moveTo(shoulder.x, shoulder.y);
      ctx.lineTo(e.x, e.y);
      ctx.lineTo(hnd.x, hnd.y);
      ctx.stroke();
    }
    // Head
    const head = { x: shoulder.x + 0.08 * fold, y: shoulder.y - 0.2 + 0.05 * fold };
    const headR = 0.165;
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(head.x, head.y, headR, 0, TAU);
    ctx.fill();
    ctx.stroke();
    // Hair / cap in team colour
    ctx.fillStyle = d.color;
    ctx.beginPath();
    ctx.arc(head.x, head.y, headR, Math.PI * 1.05, Math.PI * 1.95);
    ctx.closePath();
    ctx.fill();
    // Face: eyes + mouth, nervous when idle
    const nervousFace = idle && (d.state === 'ready' || d.state === 'hesitate' || d.isPlayer);
    ctx.fillStyle = ink;
    const eyeDx = 0.06;
    const eyeDy = nervousFace ? 0.02 : -0.01;
    ctx.beginPath();
    ctx.arc(head.x + eyeDx, head.y + eyeDy, 0.022, 0, TAU);
    ctx.arc(head.x + eyeDx + 0.065, head.y + eyeDy, 0.022, 0, TAU);
    ctx.fill();
    ctx.lineWidth = (lw * 0.6) / ppm;
    ctx.beginPath();
    if (nervousFace) {
      // wobbly worried mouth
      ctx.moveTo(head.x + 0.03, head.y + 0.08);
      ctx.quadraticCurveTo(head.x + 0.06, head.y + 0.06 + Math.sin(t * 20) * 0.01, head.x + 0.09, head.y + 0.085);
      ctx.quadraticCurveTo(head.x + 0.12, head.y + 0.1, head.x + 0.14, head.y + 0.07);
    } else if (d.state === 'swimming') {
      ctx.arc(head.x + 0.08, head.y + 0.05, 0.045, 0.1, Math.PI - 0.1);
    } else {
      ctx.moveTo(head.x + 0.04, head.y + 0.075);
      ctx.lineTo(head.x + 0.13, head.y + 0.075);
    }
    ctx.stroke();
    // Sweat drop when nervous at the edge
    if (nervousFace && d.state !== 'idle') {
      const dropT = (t * 1.5 + d.idleSeed) % 1;
      ctx.fillStyle = '#4fb0ea';
      ctx.beginPath();
      ctx.arc(head.x - 0.14, head.y - 0.1 + dropT * 0.18, 0.03, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    // Name tag above idle divers
    if (idle && d.state !== 'walking') {
      ctx.save();
      ctx.font = `600 ${Math.round(ppm * 0.28)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      const label = d.isPlayer ? 'YOU' : d.name;
      const tw = ctx.measureText(label).width + ppm * 0.3;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.roundRect(sx - tw / 2, sy - ppm * 1.55, tw, ppm * 0.4, 6);
      ctx.fill();
      ctx.fillStyle = d.isPlayer ? '#d23c3c' : '#2a3350';
      ctx.fillText(label, sx, sy - ppm * 1.2);
      ctx.restore();
    }
    void world;
  }

  armPoses(d, t, fold, shoulder) {
    const s = shoulder;
    switch (d.arms) {
      case 'up':
        return [
          [{ x: s.x + 0.05, y: s.y - 0.32 }, { x: s.x + 0.06, y: s.y - 0.62 }],
          [{ x: s.x - 0.05, y: s.y - 0.32 }, { x: s.x - 0.06, y: s.y - 0.62 }],
        ];
      case 'tuck':
        return [
          [{ x: s.x + 0.25, y: s.y + 0.15 }, { x: s.x + 0.28, y: s.y + 0.42 }],
          [{ x: s.x + 0.22, y: s.y + 0.18 }, { x: s.x + 0.26, y: s.y + 0.45 }],
        ];
      case 'pike':
        return [
          [{ x: s.x + 0.3, y: s.y + 0.25 }, { x: s.x + 0.55, y: s.y + 0.45 }],
          [{ x: s.x + 0.28, y: s.y + 0.28 }, { x: s.x + 0.52, y: s.y + 0.48 }],
        ];
      case 'cross':
        return [
          [{ x: s.x + 0.12, y: s.y + 0.1 }, { x: s.x - 0.1, y: s.y + 0.2 }],
          [{ x: s.x - 0.12, y: s.y + 0.1 }, { x: s.x + 0.1, y: s.y + 0.2 }],
        ];
      case 'swim': {
        const ph = Math.sin(t * 6);
        return [
          [{ x: s.x + 0.3, y: s.y - 0.1 * ph }, { x: s.x + 0.55, y: s.y + 0.05 }],
          [{ x: s.x - 0.3, y: s.y + 0.1 * ph }, { x: s.x - 0.55, y: s.y + 0.05 }],
        ];
      }
      case 'out': {
        const fl = Math.sin(t * 9) * 0.06;
        return [
          [{ x: s.x + 0.3, y: s.y - 0.12 + fl }, { x: s.x + 0.58, y: s.y - 0.3 - fl }],
          [{ x: s.x - 0.3, y: s.y - 0.12 - fl }, { x: s.x - 0.58, y: s.y - 0.3 + fl }],
        ];
      }
      case 'nervous':
      default: {
        // Arms slightly out, hands wringing / shaking.
        const sh = Math.sin(t * 16 + d.idleSeed) * 0.015;
        const peek = d.state === 'ready' || d.state === 'hesitate';
        if (peek) {
          return [
            [{ x: s.x + 0.22, y: s.y + 0.2 }, { x: s.x + 0.12 + sh, y: s.y + 0.02 }],
            [{ x: s.x - 0.18, y: s.y + 0.22 }, { x: s.x + 0.08 - sh, y: s.y + 0.04 }],
          ];
        }
        return [
          [{ x: s.x + 0.2, y: s.y + 0.28 }, { x: s.x + 0.26 + sh, y: s.y + 0.55 }],
          [{ x: s.x - 0.2, y: s.y + 0.28 }, { x: s.x - 0.26 - sh, y: s.y + 0.55 }],
        ];
      }
    }
  }

  drawSplash(ctx, s) {
    const ppm = this.camera.ppm;
    for (const d of s.drops) {
      const [x, y] = this.toScreen(d.x, d.y);
      ctx.fillStyle = `rgba(235, 248, 255, ${clamp(d.life, 0, 1)})`;
      ctx.beginPath();
      ctx.arc(x, y, d.r * ppm, 0, TAU);
      ctx.fill();
    }
    for (const r of s.rings) {
      const age = s.t - r.delay;
      if (age < 0 || age > 1.2) continue;
      const [x, y] = this.toScreen(r.x, r.y);
      const rw = (0.3 + age * r.w) * ppm;
      ctx.strokeStyle = `rgba(255,255,255,${0.7 * (1 - age / 1.2)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(x, y + ppm * 0.08, rw, rw * 0.22, 0, 0, TAU);
      ctx.stroke();
    }
  }
}

export { HIP_HEIGHT };
