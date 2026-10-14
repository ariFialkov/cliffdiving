// Canvas renderer: cartoon side view of the cliff, water and stickmen.

import { HIP_HEIGHT } from './world.js';
import { BONES } from './rig.js';
import { logoCanvas } from './logos.js';

const UI_FONT = "'Fredoka', 'Nunito', system-ui, sans-serif";

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
export function cliffFaceX(y, height, rock = null) {
  if (y <= 0) return 0;
  const t = y / height;
  const jag = rock?.jag ?? 1;
  let x = -0.25 - 1.1 * t + jag * (0.28 * Math.sin(y * 0.9 + 0.4) + 0.12 * Math.sin(y * 2.3));
  if (rock?.style === 'ledges') x += ((Math.floor(y / 1.8) % 2) - 0.5) * 0.22;
  if (rock?.style === 'columnar') x += ((Math.floor(y / 1.2) * 7) % 3 - 1) * 0.1;
  return x;
}

function hash(n) {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
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
    const theme = world.theme;
    this.drawSky(ctx, w, h, world, theme);
    this.drawBackdrop(ctx, world, theme);
    this.drawWater(ctx, world, theme, 'back');
    this.drawFloatie(ctx, world, theme);
    this.drawCliff(ctx, world, theme);
    this.drawVegetation(ctx, world, theme);
    this.drawBanner(ctx, world, theme);
    for (const d of world.divers) {
      if (d.state === 'gone') continue;
      this.drawDiver(ctx, d, world);
    }
    this.drawWater(ctx, world, theme, 'front');
    for (const s of world.splashes) this.drawSplash(ctx, s);
  }

  drawSky(ctx, w, h, world, theme) {
    const [, waterY] = this.toScreen(0, world.height);
    const g = ctx.createLinearGradient(0, 0, 0, Math.max(h, waterY));
    g.addColorStop(0, theme.sky[0]);
    g.addColorStop(0.55, theme.sky[1]);
    g.addColorStop(1, theme.sky[2]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const sx = w * 0.78 - this.camera.x * 2;
    const sy = h * 0.14 - this.camera.y * 2;
    ctx.fillStyle = theme.sunGlow;
    ctx.beginPath();
    ctx.arc(sx, sy, 54, 0, TAU);
    ctx.fill();
    ctx.fillStyle = theme.sun;
    ctx.beginPath();
    ctx.arc(sx, sy, 34, 0, TAU);
    ctx.fill();
    for (const c of this.clouds) {
      c.x += c.v * 0.016;
      if (c.x > 40) c.x = -25;
      const cx = (c.x - this.camera.x * 0.25) * this.camera.ppm + w * 0.5;
      const cy = (c.y - this.camera.y * 0.25) * this.camera.ppm + h * 0.5;
      this.drawCloud(ctx, cx, cy, c.s * this.camera.ppm * 0.9, theme.clouds);
    }
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

  drawCloud(ctx, x, y, s, color = 'rgba(255,255,255,0.92)') {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, s * 0.5, 0, TAU);
    ctx.arc(x + s * 0.55, y - s * 0.15, s * 0.6, 0, TAU);
    ctx.arc(x + s * 1.2, y, s * 0.5, 0, TAU);
    ctx.arc(x + s * 0.6, y + s * 0.2, s * 0.5, 0, TAU);
    ctx.fill();
  }

  /** Distant scenery on the horizon, right of the cliff. */
  drawBackdrop(ctx, world, theme) {
    const [, waterY] = this.toScreen(0, world.height);
    const ppm = this.camera.ppm;
    const px = -this.camera.x * 0.4 * ppm;
    const b = theme.backdrop;
    const w = this.w;
    ctx.save();
    if (b.kind === 'mountains') {
      for (let i = 0; i < 5; i++) {
        const bx = w * 0.35 + i * w * 0.2 + px;
        const bw = w * 0.3;
        const bh = ppm * (3 + (i % 3) * 1.4);
        ctx.fillStyle = i % 2 ? b.color : b.color2;
        ctx.beginPath();
        ctx.moveTo(bx - bw / 2, waterY);
        ctx.lineTo(bx - bw * 0.12, waterY - bh * 0.75);
        ctx.lineTo(bx, waterY - bh);
        ctx.lineTo(bx + bw * 0.1, waterY - bh * 0.8);
        ctx.lineTo(bx + bw / 2, waterY);
        ctx.closePath();
        ctx.fill();
        // Snow cap
        ctx.fillStyle = b.snow;
        ctx.beginPath();
        ctx.moveTo(bx - bw * 0.07, waterY - bh * 0.78);
        ctx.lineTo(bx, waterY - bh);
        ctx.lineTo(bx + bw * 0.06, waterY - bh * 0.84);
        ctx.lineTo(bx + bw * 0.02, waterY - bh * 0.8);
        ctx.lineTo(bx - bw * 0.02, waterY - bh * 0.84);
        ctx.closePath();
        ctx.fill();
      }
      // Treeline at the far shore
      ctx.fillStyle = '#5c9d82';
      for (let x = w * 0.3 + px; x < w + 40; x += 11) {
        const th = ppm * (0.5 + hash(x) * 0.5);
        ctx.beginPath();
        ctx.moveTo(x - 6, waterY);
        ctx.lineTo(x, waterY - th);
        ctx.lineTo(x + 6, waterY);
        ctx.closePath();
        ctx.fill();
      }
    } else if (b.kind === 'hills') {
      for (let i = 0; i < 4; i++) {
        const bx = w * 0.45 + i * w * 0.24 + px;
        const bw = w * 0.34;
        const bh = ppm * (1.0 + (i % 2) * 0.6);
        ctx.fillStyle = i % 2 ? b.color : b.color2;
        ctx.beginPath();
        ctx.moveTo(bx - bw / 2, waterY);
        ctx.quadraticCurveTo(bx - bw * 0.2, waterY - bh, bx, waterY - bh * 0.8);
        ctx.quadraticCurveTo(bx + bw * 0.25, waterY - bh * 1.1, bx + bw / 2, waterY);
        ctx.fill();
      }
    } else if (b.kind === 'mesas') {
      for (let i = 0; i < 4; i++) {
        const bx = w * 0.4 + i * w * 0.22 + px;
        const bw = w * (0.16 + (i % 2) * 0.08);
        const bh = ppm * (2.2 + (i % 3) * 0.9);
        ctx.fillStyle = i % 2 ? b.color : b.color2;
        ctx.beginPath();
        ctx.moveTo(bx - bw / 2 - ppm * 0.8, waterY);
        ctx.lineTo(bx - bw / 2, waterY - bh);
        ctx.lineTo(bx + bw / 2, waterY - bh);
        ctx.lineTo(bx + bw / 2 + ppm * 0.8, waterY);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(90,30,10,0.18)';
        ctx.fillRect(bx - bw / 2, waterY - bh * 0.55, bw, bh * 0.08);
      }
    } else if (b.kind === 'islands') {
      // A volcanic island with a cone, and a smaller islet
      const bx = w * 0.62 + px;
      const bw = w * 0.5;
      const bh = ppm * 3.2;
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.moveTo(bx - bw / 2, waterY);
      ctx.quadraticCurveTo(bx - bw * 0.25, waterY - bh * 0.35, bx - bw * 0.1, waterY - bh * 0.6);
      ctx.lineTo(bx, waterY - bh);
      ctx.lineTo(bx + bw * 0.08, waterY - bh);
      ctx.quadraticCurveTo(bx + bw * 0.3, waterY - bh * 0.4, bx + bw / 2, waterY);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = b.color2;
      ctx.beginPath();
      ctx.ellipse(bx + bw * 0.62, waterY, bw * 0.16, ppm * 0.6, 0, Math.PI, TAU);
      ctx.fill();
      // Tiny palms on the islet
      ctx.strokeStyle = b.color;
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        const x = bx + bw * (0.56 + i * 0.05);
        ctx.beginPath();
        ctx.moveTo(x, waterY - ppm * 0.45);
        ctx.lineTo(x + 3, waterY - ppm * 1.0);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  drawWater(ctx, world, theme, layer) {
    const ppm = this.camera.ppm;
    const [, waterY] = this.toScreen(0, world.height);
    const w = this.w;
    const h = this.h;
    if (waterY > h + 40) return;
    const t = this.time;
    const amp = ppm * 0.08;
    const wave = (x, phase) =>
      Math.sin((x / ppm) * 1.3 + t * 1.6 + phase) * amp + Math.sin((x / ppm) * 2.9 - t * 2.3 + phase) * amp * 0.5;
    const wc = theme.water;
    if (layer === 'back') {
      const g = ctx.createLinearGradient(0, waterY, 0, waterY + ppm * 12);
      g.addColorStop(0, wc.top);
      g.addColorStop(1, wc.deep);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += 8) ctx.lineTo(x, waterY + wave(x, 0));
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();
      // Sun sparkle on the surface
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      for (let i = 0; i < 14; i++) {
        const x = ((hash(i) * 2 + t * 0.03 * (1 + (i % 3))) % 1.2) * w;
        const y = waterY + ppm * (0.4 + hash(i + 50) * 2.5);
        const len = ppm * (0.2 + hash(i + 90) * 0.5) * (0.6 + 0.4 * Math.sin(t * 2 + i));
        ctx.fillRect(x, y, len, 2);
      }
    } else {
      ctx.fillStyle = wc.front;
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += 8) ctx.lineTo(x, waterY + wave(x, 1.7) + ppm * 0.06);
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = wc.foam;
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

  drawCliff(ctx, world, theme) {
    const ppm = this.camera.ppm;
    const H = world.height;
    const rock = theme.rock;
    const top = theme.top;
    const [edgeX, topY] = this.toScreen(0, 0);
    const [, waterY] = this.toScreen(0, H);
    const bottomY = Math.min(this.h + 50, waterY + ppm * 6);
    if (topY > this.h + 50 && edgeX < -50) return;
    // Rock body
    ctx.fillStyle = rock.base;
    ctx.beginPath();
    ctx.moveTo(-50, topY);
    ctx.lineTo(edgeX, topY);
    const steps = 60;
    for (let i = 1; i <= steps; i++) {
      const y = (i / steps) * (H + 6);
      const [sx, sy] = this.toScreen(cliffFaceX(y, H, rock), y);
      ctx.lineTo(sx, Math.min(sy, bottomY + 200));
    }
    ctx.lineTo(-50, bottomY + 200);
    ctx.closePath();
    ctx.fill();
    ctx.save();
    ctx.clip();
    if (rock.style === 'columnar') {
      // Basalt columns: vertical seams with horizontal fractures.
      ctx.strokeStyle = rock.strata;
      ctx.lineWidth = Math.max(1.5, ppm * 0.05);
      for (let x = -14; x <= 0.5; x += 0.9) {
        const [sx0] = this.toScreen(x, 0);
        ctx.beginPath();
        ctx.moveTo(sx0 + Math.sin(x * 3) * 4, topY);
        ctx.lineTo(sx0 + Math.sin(x * 3 + 1) * 4 - ppm * 1.1 * ((H + 6) / H), bottomY + 200);
        ctx.stroke();
        for (let y = 0.7 + hash(x) * 1.2; y < H + 6; y += rock.strataStep + hash(x + y) * 0.8) {
          const [sx, sy] = this.toScreen(x, y);
          ctx.beginPath();
          ctx.moveTo(sx - ppm * 0.45, sy);
          ctx.lineTo(sx + ppm * 0.45, sy + Math.sin(y) * 3);
          ctx.stroke();
        }
      }
      ctx.fillStyle = rock.highlight;
      for (let x = -14; x <= 0.5; x += 0.9) {
        const [sx0] = this.toScreen(x + 0.12, 0);
        ctx.fillRect(sx0, topY, ppm * 0.12, bottomY + 200 - topY);
      }
    } else {
      // Strata bands
      ctx.fillStyle = rock.strata;
      const thick = rock.style === 'fine' ? 0.12 : rock.style === 'ledges' ? 0.45 : 0.5;
      for (let y = 1.2; y < H + 6; y += rock.strataStep) {
        const [, sy] = this.toScreen(0, y);
        const [, sy2] = this.toScreen(0, y + thick + Math.sin(y) * 0.1);
        ctx.beginPath();
        ctx.moveTo(-50, sy);
        ctx.lineTo(edgeX + 40, sy + Math.sin(y * 3) * 6);
        ctx.lineTo(edgeX + 40, sy2 + Math.sin(y * 3) * 6);
        ctx.lineTo(-50, sy2);
        ctx.closePath();
        ctx.fill();
      }
      if (rock.style === 'ledges') {
        // Lit ledge tops and a few vertical cracks
        ctx.fillStyle = rock.highlight;
        for (let y = 1.2; y < H + 6; y += rock.strataStep) {
          const [, sy] = this.toScreen(0, y);
          ctx.fillRect(-50, sy - ppm * 0.08, edgeX + 90, ppm * 0.08);
        }
        ctx.strokeStyle = rock.strata;
        ctx.lineWidth = 2;
        for (let i = 0; i < 9; i++) {
          const [sx, sy] = this.toScreen(-1.2 - hash(i) * 10, hash(i + 3) * H);
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(sx + 4, sy + ppm * (0.8 + hash(i + 7) * 1.5));
          ctx.stroke();
        }
      } else if (rock.style === 'fine') {
        // Erosion gullies down the soft bluff face
        ctx.fillStyle = rock.highlight;
        for (let i = 0; i < 7; i++) {
          const x = -0.8 - hash(i + 20) * 9;
          const [sx] = this.toScreen(x, 0);
          ctx.beginPath();
          ctx.moveTo(sx, topY + ppm * 0.5);
          ctx.lineTo(sx - ppm * 0.25, bottomY + 200);
          ctx.lineTo(sx + ppm * 0.25, bottomY + 200);
          ctx.closePath();
          ctx.fill();
        }
      } else {
        ctx.fillStyle = rock.highlight;
        for (let y = 0.5; y < H + 6; y += 3.1) {
          const [sx, sy] = this.toScreen(cliffFaceX(y, H, rock) - 0.4, y);
          ctx.beginPath();
          ctx.ellipse(sx - ppm * 0.7, sy, ppm * 0.9, ppm * 0.25, 0, 0, TAU);
          ctx.fill();
        }
      }
    }
    ctx.restore();
    // Cliff-top ground lip
    ctx.fillStyle = top.ground;
    ctx.beginPath();
    ctx.moveTo(-50, topY - ppm * 0.18);
    ctx.lineTo(edgeX + ppm * 0.05, topY - ppm * 0.18);
    ctx.quadraticCurveTo(edgeX + ppm * 0.12, topY + ppm * 0.12, edgeX - ppm * 0.1, topY + ppm * 0.3);
    ctx.lineTo(-50, topY + ppm * 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = top.lip;
    ctx.fillRect(-50, topY - ppm * 0.18, edgeX + 52, ppm * 0.12);
    if (top.hasGrass) {
      ctx.strokeStyle = top.tuft;
      ctx.lineWidth = 2;
      for (let i = 0; i < 18; i++) {
        const gx = edgeX - i * ppm * 0.9 - ppm * 0.3;
        if (gx < -10) break;
        ctx.beginPath();
        ctx.moveTo(gx, topY - ppm * 0.15);
        ctx.lineTo(gx - 3, topY - ppm * 0.42);
        ctx.moveTo(gx + 4, topY - ppm * 0.15);
        ctx.lineTo(gx + 7, topY - ppm * 0.4);
        ctx.stroke();
      }
    } else {
      // Pebbles on bare ground
      ctx.fillStyle = 'rgba(90,50,30,0.35)';
      for (let i = 0; i < 16; i++) {
        const gx = edgeX - i * ppm * 0.95 - ppm * 0.4 - hash(i) * 10;
        if (gx < -10) break;
        ctx.beginPath();
        ctx.ellipse(gx, topY - ppm * 0.12, ppm * 0.07, ppm * 0.04, 0, 0, TAU);
        ctx.fill();
      }
    }
    // Depth marks on the cliff face: a cartoon "height ruler".
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = `700 ${Math.round(ppm * 0.26)}px ${UI_FONT}`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let m = 5; m < H; m += 5) {
      const [mx, my] = this.toScreen(cliffFaceX(m, H, rock), m);
      ctx.fillRect(mx - ppm * 0.5, my - 1, ppm * 0.4, 2);
      ctx.fillText(`${H - m}m`, mx - ppm * 0.6, my);
    }
  }

  /** Trees and bushes along the cliff top, behind the queue of divers. */
  drawVegetation(ctx, world, theme) {
    const ppm = this.camera.ppm;
    const [, topY] = this.toScreen(0, 0);
    if (topY < -200 || topY > this.h + 200) return;
    const kind = theme.vegetation;
    const S = (x) => this.toScreen(x, 0)[0];
    ctx.save();
    ctx.lineCap = 'round';
    if (kind === 'pines') {
      const pines = [[-17.5, 3.6], [-15.8, 4.6], [-14.2, 3.2], [-12.6, 4.2], [-11.4, 2.8], [-6.0, 2.2]];
      for (const [x, hgt] of pines) {
        const sx = S(x);
        if (sx < -80 || sx > this.w + 80) continue;
        ctx.strokeStyle = '#5a3a22';
        ctx.lineWidth = Math.max(2, ppm * 0.12);
        ctx.beginPath();
        ctx.moveTo(sx, topY);
        ctx.lineTo(sx, topY - ppm * hgt * 0.4);
        ctx.stroke();
        for (let tier = 0; tier < 3; tier++) {
          const base = topY - ppm * hgt * (0.25 + tier * 0.25);
          const wdt = ppm * hgt * (0.26 - tier * 0.06);
          ctx.fillStyle = tier % 2 ? '#2f7a45' : '#3a8f52';
          ctx.beginPath();
          ctx.moveTo(sx - wdt, base);
          ctx.lineTo(sx, base - ppm * hgt * 0.32);
          ctx.lineTo(sx + wdt, base);
          ctx.closePath();
          ctx.fill();
        }
      }
    } else if (kind === 'shrubs') {
      const items = [[-16.5, 1.1], [-14.6, 0.8], [-13.0, 1.4], [-10.8, 0.9], [-9.0, 0.7], [-6.2, 0.8]];
      for (const [x, sz] of items) {
        const sx = S(x);
        if (sx < -80 || sx > this.w + 80) continue;
        ctx.fillStyle = '#4e9a46';
        ctx.beginPath();
        ctx.arc(sx, topY - ppm * sz * 0.45, ppm * sz * 0.5, 0, TAU);
        ctx.arc(sx + ppm * sz * 0.5, topY - ppm * sz * 0.35, ppm * sz * 0.4, 0, TAU);
        ctx.arc(sx - ppm * sz * 0.45, topY - ppm * sz * 0.3, ppm * sz * 0.38, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#6cbf5c';
        ctx.beginPath();
        ctx.arc(sx - ppm * sz * 0.1, topY - ppm * sz * 0.6, ppm * sz * 0.28, 0, TAU);
        ctx.fill();
      }
      // A round deciduous tree
      const tx = S(-12.0);
      ctx.strokeStyle = '#6b4a2b';
      ctx.lineWidth = Math.max(2, ppm * 0.14);
      ctx.beginPath();
      ctx.moveTo(tx, topY);
      ctx.lineTo(tx, topY - ppm * 1.8);
      ctx.stroke();
      ctx.fillStyle = '#5aa84f';
      ctx.beginPath();
      ctx.arc(tx, topY - ppm * 2.4, ppm * 1.0, 0, TAU);
      ctx.arc(tx - ppm * 0.7, topY - ppm * 2.0, ppm * 0.7, 0, TAU);
      ctx.arc(tx + ppm * 0.75, topY - ppm * 2.05, ppm * 0.7, 0, TAU);
      ctx.fill();
    } else if (kind === 'scrub') {
      const items = [[-16.8, 0.7], [-15.0, 0.5], [-13.4, 0.8], [-11.2, 0.6], [-9.6, 0.5], [-6.3, 0.55]];
      for (const [x, sz] of items) {
        const sx = S(x);
        if (sx < -80 || sx > this.w + 80) continue;
        ctx.fillStyle = '#7f8c4f';
        ctx.beginPath();
        ctx.arc(sx, topY - ppm * sz * 0.4, ppm * sz * 0.45, 0, TAU);
        ctx.arc(sx + ppm * sz * 0.45, topY - ppm * sz * 0.3, ppm * sz * 0.35, 0, TAU);
        ctx.arc(sx - ppm * sz * 0.4, topY - ppm * sz * 0.28, ppm * sz * 0.33, 0, TAU);
        ctx.fill();
      }
      // An agave: radial spiky leaves
      const ax = S(-12.4);
      ctx.strokeStyle = '#6f9a7a';
      ctx.lineWidth = Math.max(2, ppm * 0.09);
      for (let i = 0; i < 9; i++) {
        const a = Math.PI + (i / 8) * Math.PI;
        ctx.beginPath();
        ctx.moveTo(ax, topY - ppm * 0.1);
        ctx.quadraticCurveTo(ax + Math.cos(a) * ppm * 0.5, topY - ppm * 0.1 + Math.sin(a) * ppm * 0.9, ax + Math.cos(a) * ppm * 0.9, topY - ppm * 0.1 + Math.sin(a) * ppm * 1.1);
        ctx.stroke();
      }
      // Juniper
      const jx = S(-8.2);
      ctx.fillStyle = '#4f7a4a';
      ctx.beginPath();
      ctx.arc(jx, topY - ppm * 0.9, ppm * 0.6, 0, TAU);
      ctx.arc(jx + ppm * 0.5, topY - ppm * 0.6, ppm * 0.45, 0, TAU);
      ctx.arc(jx - ppm * 0.45, topY - ppm * 0.55, ppm * 0.42, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#5a3a22';
      ctx.lineWidth = Math.max(2, ppm * 0.1);
      ctx.beginPath();
      ctx.moveTo(jx, topY);
      ctx.lineTo(jx + 2, topY - ppm * 0.5);
      ctx.stroke();
    } else if (kind === 'palms') {
      const palms = [[-16.8, 4.2, 1], [-14.4, 5.2, -1], [-11.8, 3.6, 1], [-6.4, 3.0, -1]];
      for (const [x, hgt, lean] of palms) {
        const sx = S(x);
        if (sx < -120 || sx > this.w + 120) continue;
        const topX = sx + lean * ppm * 0.9;
        const topYp = topY - ppm * hgt;
        ctx.strokeStyle = '#8a6a3c';
        ctx.lineWidth = Math.max(3, ppm * 0.16);
        ctx.beginPath();
        ctx.moveTo(sx, topY);
        ctx.quadraticCurveTo(sx + lean * ppm * 0.1, topY - ppm * hgt * 0.6, topX, topYp);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(0,0,0,0.15)';
        ctx.lineWidth = 2;
        for (let i = 1; i < 7; i++) {
          const t = i / 7;
          const px = sx + (topX - sx) * t + lean * ppm * 0.1 * Math.sin(t * Math.PI);
          const py = topY + (topYp - topY) * t;
          ctx.beginPath();
          ctx.moveTo(px - ppm * 0.08, py);
          ctx.lineTo(px + ppm * 0.08, py);
          ctx.stroke();
        }
        ctx.strokeStyle = '#3f9a3d';
        ctx.lineWidth = Math.max(3, ppm * 0.13);
        for (let i = 0; i < 7; i++) {
          const a = -Math.PI * 0.95 + (i / 6) * Math.PI * 0.9;
          const fl = ppm * (1.1 + (i % 2) * 0.3);
          ctx.beginPath();
          ctx.moveTo(topX, topYp);
          ctx.quadraticCurveTo(topX + Math.cos(a) * fl * 0.6, topYp + Math.sin(a) * fl * 0.3 - ppm * 0.3, topX + Math.cos(a) * fl, topYp + Math.sin(a) * fl * 0.5 + ppm * 0.4);
          ctx.stroke();
        }
        ctx.fillStyle = '#6b4a2b';
        ctx.beginPath();
        ctx.arc(topX - 4, topYp + 4, ppm * 0.08, 0, TAU);
        ctx.arc(topX + 4, topYp + 5, ppm * 0.08, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  /** The tournament banner on the cliff top, behind the queue. */
  drawBanner(ctx, world, theme) {
    const ppm = this.camera.ppm;
    const [, topY] = this.toScreen(0, 0);
    if (topY < -300 || topY > this.h + 300) return;
    const comp = world.comp;
    if (!comp) return;
    const style = theme.banner;
    const xL = -10.4;
    const xR = -6.0;
    const [pxL] = this.toScreen(xL, 0);
    const [pxR] = this.toScreen(xR, 0);
    if (pxR < -50) return;
    const poleH = 3.3;
    const poleTop = topY - ppm * poleH;
    ctx.save();
    ctx.lineCap = 'round';
    // Poles
    ctx.strokeStyle = style === 'bunting' ? '#6b4a2b' : style === 'pro' ? '#1b1d2a' : '#8a8f9c';
    ctx.lineWidth = Math.max(3, ppm * 0.12);
    for (const px of [pxL, pxR]) {
      ctx.beginPath();
      ctx.moveTo(px, topY - ppm * 0.1);
      ctx.lineTo(px, poleTop);
      ctx.stroke();
    }
    // Height plaque on the left pole
    ctx.fillStyle = '#fff8ea';
    ctx.strokeStyle = '#1b1d2a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(pxL - ppm * 0.5, topY - ppm * 1.2, ppm * 1.0, ppm * 0.42, 5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#1b1d2a';
    ctx.font = `700 ${Math.round(ppm * 0.28)}px ${UI_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${world.height}m`, pxL, topY - ppm * 0.99);
    const cx = (pxL + pxR) / 2;
    const bw = pxR - pxL;
    const sway = Math.sin(this.time * 1.3) * ppm * 0.03;
    if (style === 'bunting') {
      // String of flags + a hanging wooden sign with the logo
      ctx.strokeStyle = '#1b1d2a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(pxL, poleTop);
      ctx.quadraticCurveTo(cx, poleTop + ppm * 0.35, pxR, poleTop);
      ctx.stroke();
      const cols = ['#ff6b57', '#ffd84d', '#4fb0ea', '#6cc24a', '#b16cea'];
      const n = 9;
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const fx = pxL + bw * t;
        const fy = poleTop + ppm * 0.35 * 4 * t * (1 - t) * 0.5 + 1;
        ctx.fillStyle = cols[i % cols.length];
        ctx.beginPath();
        ctx.moveTo(fx - ppm * 0.16, fy);
        ctx.lineTo(fx + ppm * 0.16, fy);
        ctx.lineTo(fx + sway, fy + ppm * 0.3);
        ctx.closePath();
        ctx.fill();
      }
      const sw = ppm * 2.4;
      const sh = ppm * 1.2;
      const sy = poleTop + ppm * 0.75;
      ctx.strokeStyle = '#6b4a2b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx - sw * 0.35, sy);
      ctx.lineTo(cx - sw * 0.35, poleTop + ppm * 0.2);
      ctx.moveTo(cx + sw * 0.35, sy);
      ctx.lineTo(cx + sw * 0.35, poleTop + ppm * 0.2);
      ctx.stroke();
      ctx.fillStyle = '#e9c88f';
      ctx.strokeStyle = '#6b4a2b';
      ctx.lineWidth = Math.max(2, ppm * 0.06);
      ctx.beginPath();
      ctx.roundRect(cx - sw / 2 + sway, sy, sw, sh, ppm * 0.12);
      ctx.fill();
      ctx.stroke();
      this.blitLogo(ctx, comp.id, cx + sway, sy + sh / 2, sw * 0.9, sh * 0.9);
    } else if (style === 'cloth') {
      const sag = ppm * 0.18;
      const by = poleTop + ppm * 0.1;
      const bh = ppm * 1.25;
      ctx.fillStyle = '#f3ead6';
      ctx.strokeStyle = '#3c5a78';
      ctx.lineWidth = Math.max(2, ppm * 0.05);
      ctx.beginPath();
      ctx.moveTo(pxL, by);
      ctx.quadraticCurveTo(cx, by + sag, pxR, by);
      ctx.lineTo(pxR, by + bh);
      ctx.quadraticCurveTo(cx + sway, by + bh + sag, pxL, by + bh);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      this.blitLogo(ctx, comp.id, cx + sway * 0.5, by + bh / 2 + sag * 0.5, bw * 0.78, bh * 0.82);
    } else if (style === 'pleated') {
      const by = poleTop + ppm * 0.05;
      const bh = ppm * 1.35;
      ctx.fillStyle = '#15305c';
      ctx.beginPath();
      ctx.moveTo(pxL, by);
      ctx.lineTo(pxR, by);
      ctx.lineTo(pxR, by + bh);
      // Scalloped bottom
      const n = 8;
      for (let i = n; i >= 0; i--) {
        const x = pxL + (bw * i) / n;
        ctx.lineTo(x, by + bh);
        if (i > 0) ctx.quadraticCurveTo(x - bw / n / 2, by + bh + ppm * 0.22 + sway, x - bw / n, by + bh);
      }
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#e4b53c';
      ctx.lineWidth = Math.max(2, ppm * 0.06);
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.roundRect(pxL + bw * 0.08, by + bh * 0.1, bw * 0.84, bh * 0.76, ppm * 0.1);
      ctx.fill();
      this.blitLogo(ctx, comp.id, cx, by + bh * 0.48, bw * 0.8, bh * 0.7);
    } else {
      // Pro: rigid sponsor board with a blue edge and a pair of flags
      const by = poleTop - ppm * 0.1;
      const bh = ppm * 1.5;
      ctx.fillStyle = '#0f1119';
      ctx.strokeStyle = '#1ba3ff';
      ctx.lineWidth = Math.max(2, ppm * 0.07);
      ctx.beginPath();
      ctx.roundRect(pxL - ppm * 0.15, by, bw + ppm * 0.3, bh, ppm * 0.12);
      ctx.fill();
      ctx.stroke();
      this.blitLogo(ctx, comp.id, cx, by + bh / 2, bw * 0.92, bh * 0.9);
      for (const px of [pxL, pxR]) {
        ctx.strokeStyle = '#1b1d2a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(px, by);
        ctx.lineTo(px, by - ppm * 0.9);
        ctx.stroke();
        ctx.fillStyle = '#1ba3ff';
        ctx.beginPath();
        ctx.moveTo(px, by - ppm * 0.9);
        ctx.lineTo(px + ppm * 0.55 + sway * 2, by - ppm * 0.72);
        ctx.lineTo(px, by - ppm * 0.54);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();
  }

  /** Something floating in the landing zone that carries the logo. */
  drawFloatie(ctx, world, theme) {
    const ppm = this.camera.ppm;
    const comp = world.comp;
    if (!comp) return;
    const x = 6.4;
    const bob = Math.sin(this.time * 1.6 + x * 1.3) * 0.06;
    const tilt = Math.sin(this.time * 1.6 + 0.8) * 0.04;
    const [fx, fy] = this.toScreen(x, world.height + bob);
    if (fx < -ppm * 4 || fx > this.w + ppm * 4 || fy < -ppm * 4 || fy > this.h + ppm * 4) return;
    ctx.save();
    ctx.translate(fx, fy);
    ctx.rotate(tilt);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const kind = theme.floatie;
    if (kind === 'ring') {
      // A big inflatable duck with the logo on its side
      ctx.fillStyle = '#ffd84d';
      ctx.strokeStyle = '#1b1d2a';
      ctx.lineWidth = Math.max(2, ppm * 0.06);
      ctx.beginPath();
      ctx.ellipse(0, -ppm * 0.25, ppm * 1.3, ppm * 0.5, 0, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(ppm * 1.0, -ppm * 1.1, ppm * 0.48, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ff9f43';
      ctx.beginPath();
      ctx.moveTo(ppm * 1.4, -ppm * 1.15);
      ctx.lineTo(ppm * 1.95, -ppm * 1.0);
      ctx.lineTo(ppm * 1.4, -ppm * 0.88);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#1b1d2a';
      ctx.beginPath();
      ctx.arc(ppm * 1.15, -ppm * 1.2, ppm * 0.06, 0, TAU);
      ctx.fill();
      this.blitLogo(ctx, comp.id, -ppm * 0.15, -ppm * 0.28, ppm * 1.7, ppm * 0.75);
    } else if (kind === 'buoy') {
      // Striped marker buoy with a sign
      ctx.fillStyle = '#ff6b57';
      ctx.strokeStyle = '#1b1d2a';
      ctx.lineWidth = Math.max(2, ppm * 0.05);
      ctx.beginPath();
      ctx.moveTo(-ppm * 0.7, 0);
      ctx.lineTo(-ppm * 0.35, -ppm * 1.1);
      ctx.lineTo(ppm * 0.35, -ppm * 1.1);
      ctx.lineTo(ppm * 0.7, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(-ppm * 0.58, -ppm * 0.35);
      ctx.lineTo(ppm * 0.58, -ppm * 0.35);
      ctx.lineTo(ppm * 0.48, -ppm * 0.7);
      ctx.lineTo(-ppm * 0.48, -ppm * 0.7);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#3c5a78';
      ctx.lineWidth = Math.max(2, ppm * 0.07);
      ctx.beginPath();
      ctx.moveTo(0, -ppm * 1.1);
      ctx.lineTo(0, -ppm * 2.4);
      ctx.stroke();
      ctx.fillStyle = '#f3ead6';
      ctx.strokeStyle = '#3c5a78';
      ctx.lineWidth = Math.max(2, ppm * 0.05);
      ctx.beginPath();
      ctx.roundRect(-ppm * 0.95, -ppm * 2.9, ppm * 1.9, ppm * 0.95, ppm * 0.08);
      ctx.fill();
      ctx.stroke();
      this.blitLogo(ctx, comp.id, 0, -ppm * 2.42, ppm * 1.75, ppm * 0.85);
    } else if (kind === 'platform') {
      // Floating mat with a backboard
      ctx.fillStyle = '#1a9db5';
      ctx.strokeStyle = '#15305c';
      ctx.lineWidth = Math.max(2, ppm * 0.05);
      ctx.beginPath();
      ctx.roundRect(-ppm * 1.6, -ppm * 0.3, ppm * 3.2, ppm * 0.36, ppm * 0.1);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#e4b53c';
      ctx.fillRect(-ppm * 1.5, -ppm * 0.26, ppm * 3.0, ppm * 0.07);
      ctx.strokeStyle = '#15305c';
      ctx.lineWidth = Math.max(2, ppm * 0.07);
      for (const px of [-ppm * 1.1, ppm * 1.1]) {
        ctx.beginPath();
        ctx.moveTo(px, -ppm * 0.3);
        ctx.lineTo(px, -ppm * 1.5);
        ctx.stroke();
      }
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#15305c';
      ctx.lineWidth = Math.max(2, ppm * 0.06);
      ctx.beginPath();
      ctx.roundRect(-ppm * 1.35, -ppm * 2.3, ppm * 2.7, ppm * 1.25, ppm * 0.1);
      ctx.fill();
      ctx.stroke();
      this.blitLogo(ctx, comp.id, 0, -ppm * 1.67, ppm * 2.5, ppm * 1.1);
    } else {
      // Pro pontoon: black barge, blue stripe, backboard and flags
      ctx.fillStyle = '#0f1119';
      ctx.strokeStyle = '#1ba3ff';
      ctx.lineWidth = Math.max(2, ppm * 0.06);
      ctx.beginPath();
      ctx.moveTo(-ppm * 2.2, -ppm * 0.45);
      ctx.lineTo(ppm * 2.2, -ppm * 0.45);
      ctx.lineTo(ppm * 1.9, ppm * 0.15);
      ctx.lineTo(-ppm * 1.9, ppm * 0.15);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#1ba3ff';
      ctx.fillRect(-ppm * 2.1, -ppm * 0.2, ppm * 4.2, ppm * 0.08);
      ctx.fillStyle = '#2a2d3a';
      ctx.strokeStyle = '#1ba3ff';
      ctx.beginPath();
      ctx.roundRect(-ppm * 1.7, -ppm * 2.2, ppm * 3.4, ppm * 1.6, ppm * 0.08);
      ctx.fill();
      ctx.stroke();
      this.blitLogo(ctx, comp.id, 0, -ppm * 1.4, ppm * 3.2, ppm * 1.45);
      for (const px of [-ppm * 2.0, ppm * 2.0]) {
        ctx.strokeStyle = '#1b1d2a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(px, -ppm * 0.45);
        ctx.lineTo(px, -ppm * 2.9);
        ctx.stroke();
        ctx.fillStyle = '#1ba3ff';
        const fl = Math.sin(this.time * 4 + px) * ppm * 0.05;
        ctx.beginPath();
        ctx.moveTo(px, -ppm * 2.9);
        ctx.lineTo(px + ppm * 0.5, -ppm * 2.75 + fl);
        ctx.lineTo(px, -ppm * 2.6);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();
  }

  blitLogo(ctx, id, cx, cy, w, h) {
    const px = Math.min(1024, Math.max(128, Math.round(w * this.dpr * 1.2)));
    const img = logoCanvas(id, px);
    const s = Math.min(w / img.width, h / img.height);
    ctx.drawImage(img, cx - (img.width * s) / 2, cy - (img.height * s) / 2, img.width * s, img.height * s);
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
      ctx.font = `600 ${Math.round(ppm * 0.28)}px ${UI_FONT}`;
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
