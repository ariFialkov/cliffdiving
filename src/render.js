// Canvas renderer: cartoon side view of the cliff, water and stickmen.

import { HIP_HEIGHT } from './world.js';
import { BONES } from './rig.js';

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
    const pts = d.rig.points;
    if (!pts) return;
    const [sx, sy] = this.toScreen(d.x, d.y);
    if (sx < -200 || sx > this.w + 200 || sy < -250 || sy > this.h + 250) return;
    const lw = Math.max(2, ppm * 0.075);
    const S = (p) => this.toScreen(p.x, p.y);
    const path = (list) => {
      ctx.beginPath();
      list.forEach((p, i) => {
        const [x, y] = S(p);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
    };
    const avgZ = (list) => list.reduce((a, p) => a + p.z, 0) / list.length;
    const inkFor = (z) => {
      // Limbs turned away from the camera are a touch lighter so crossings read.
      const t = clamp(-z / 0.12, 0, 1);
      const c = Math.round(27 + t * 45);
      return `rgb(${c},${c + 2},${c + 15})`;
    };

    const items = [];
    const limb = (list) => items.push({ z: avgZ(list), draw: () => {
      ctx.strokeStyle = inkFor(avgZ(list));
      ctx.lineWidth = lw;
      path(list);
      ctx.stroke();
    } });
    limb([pts.hip, pts.kneeF, pts.ankF, pts.toeF]);
    limb([pts.hip, pts.kneeB, pts.ankB, pts.toeB]);
    limb([pts.shoulder, pts.elbF, pts.wrF]);
    limb([pts.shoulder, pts.elbB, pts.wrB]);
    const spine = [pts.hip, pts.chest, pts.neck, pts.headC];
    const torsoZ = avgZ(spine);
    items.push({ z: torsoZ - 0.001, draw: () => {
      ctx.strokeStyle = '#1b1d2a';
      ctx.lineWidth = lw;
      path(spine);
      ctx.stroke();
    } });
    // Speedo sits over the hips and the tops of both legs.
    const speedo = [pts.waistF, pts.thighF, pts.crotch, pts.thighB, pts.waistB];
    const legTopZ = Math.max(pts.thighF.z, pts.thighB.z, torsoZ);
    items.push({ z: legTopZ + 0.0005, draw: () => {
      ctx.fillStyle = d.color;
      ctx.strokeStyle = d.color;
      ctx.lineWidth = lw * 1.25;
      path(speedo);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } });
    // Head: a plain circle. Hair outline sits just behind it unless the head is turned toward us.
    items.push({ z: pts.headC.z + 0.002, draw: () => {
      const [hx, hy] = S(pts.headC);
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#1b1d2a';
      ctx.lineWidth = lw * 0.75;
      ctx.beginPath();
      ctx.arc(hx, hy, BONES.headR * ppm, 0, TAU);
      ctx.fill();
      ctx.stroke();
    } });
    items.push({ z: Math.max(pts.hairDepth, -10) + (pts.hairDepth > pts.headC.z + 0.02 ? 0.003 : 0), draw: () => this.drawHair(ctx, d, lw) });

    items.sort((a, b) => a.z - b.z);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (d.state === 'entering') ctx.globalAlpha = 0.85;
    for (const it of items) it.draw();
    // A bead of sweat while working up the nerve at the edge.
    const nervous = d.state === 'ready' || d.state === 'hesitate' || d.state === 'charging';
    if (nervous) {
      const [hx, hy] = S(pts.headC);
      const hr = BONES.headR * ppm;
      const dropT = (this.time * 1.5 + d.idleSeed) % 1;
      ctx.fillStyle = '#4fb0ea';
      ctx.beginPath();
      ctx.arc(hx - pts.facing * hr * 1.25, hy - hr * 0.2 + dropT * hr * 0.9, Math.max(1.5, ppm * 0.024), 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    // Name tag above standing divers.
    if (['idle', 'ready', 'hesitate', 'charging'].includes(d.state)) {
      const [tx, ty] = S(pts.headC);
      ctx.save();
      ctx.font = `600 ${Math.round(ppm * 0.28)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      const label = d.isPlayer ? 'YOU' : d.name;
      const tw = ctx.measureText(label).width + ppm * 0.3;
      const top = ty - ppm * 1.15;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.roundRect(tx - tw / 2, top, tw, ppm * 0.4, 6);
      ctx.fill();
      ctx.fillStyle = d.isPlayer ? '#d23c3c' : '#2a3350';
      ctx.fillText(label, tx, top + ppm * 0.35);
      ctx.restore();
    }
    void world;
  }

  /** One continuous outline around the head, filled white so it reads as a solid hairdo. */
  drawHair(ctx, d, lw) {
    const hair = d.rig.hair;
    const nodes = hair.nodes;
    if (!nodes || nodes.length < 2) return;
    const P = nodes.map((n) => this.toScreen(n.x, n.y));
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(P[0][0], P[0][1]);
    if (hair.style.smooth) {
      for (let i = 1; i < P.length - 1; i++) {
        const mx = (P[i][0] + P[i + 1][0]) / 2;
        const my = (P[i][1] + P[i + 1][1]) / 2;
        ctx.quadraticCurveTo(P[i][0], P[i][1], mx, my);
      }
      ctx.lineTo(P[P.length - 1][0], P[P.length - 1][1]);
    } else {
      for (let i = 1; i < P.length; i++) ctx.lineTo(P[i][0], P[i][1]);
    }
    // Fill the enclosed area (closing through the head, which is drawn over it).
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#1b1d2a';
    ctx.lineWidth = lw * 0.6;
    ctx.stroke();
    ctx.restore();
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
