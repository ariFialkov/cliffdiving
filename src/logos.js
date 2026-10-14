// Tournament logos, drawn with canvas primitives so they scale crisply on
// banners, floaties and lobby cards. Each one is drawn into a 400×200 box
// centred on the origin; the polish steps up with the tier.

const FONT = "'Fredoka', 'Nunito', system-ui, sans-serif";
const INK = '#1b1d2a';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function text(ctx, str, x, y, { size = 40, weight = 700, color = INK, align = 'center', stroke = null, strokeW = 0, spacing = 0, italic = false } = {}) {
  ctx.save();
  ctx.font = `${italic ? 'italic ' : ''}${weight} ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  if (spacing && 'letterSpacing' in ctx) ctx.letterSpacing = `${spacing}px`;
  ctx.lineJoin = 'round';
  if (stroke) {
    ctx.lineWidth = strokeW;
    ctx.strokeStyle = stroke;
    ctx.strokeText(str, x, y);
  }
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
  ctx.restore();
}

// Tier 1: a kid's-club badge. Wobbly, bright, every letter a different colour.
function drawTykes(ctx) {
  // Cloud-shaped badge
  ctx.fillStyle = '#fff8ea';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 7;
  ctx.beginPath();
  const bumps = [[-150, 20, 48], [-100, -30, 46], [-40, -50, 50], [30, -48, 52], [100, -30, 46], [150, 20, 48], [100, 55, 46], [0, 62, 50], [-100, 55, 46]];
  for (const [x, y, r] of bumps) {
    ctx.moveTo(x + r, y);
    ctx.arc(x, y, r, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.stroke();
  // Inner fill to hide inner strokes
  ctx.fillStyle = '#fff8ea';
  ctx.beginPath();
  for (const [x, y, r] of bumps) {
    ctx.moveTo(x + r - 4, y);
    ctx.arc(x, y, r - 4, 0, Math.PI * 2);
  }
  ctx.fill();
  // Smiling sun peeking from the top-left
  ctx.save();
  ctx.translate(-138, -44);
  ctx.fillStyle = '#ffd84d';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 5;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 30, Math.sin(a) * 30);
    ctx.lineTo(Math.cos(a) * 44, Math.sin(a) * 44);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(0, 0, 28, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(-9, -5, 3.2, 0, Math.PI * 2);
  ctx.arc(9, -5, 3.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, 2, 12, 0.2, Math.PI - 0.2);
  ctx.stroke();
  ctx.restore();
  // A little stick kid mid-jump on the right
  ctx.save();
  ctx.translate(140, -38);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(0, -22, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, -11);
  ctx.lineTo(0, 16);
  ctx.moveTo(0, -4);
  ctx.lineTo(-18, -24);
  ctx.moveTo(0, -4);
  ctx.lineTo(18, -24);
  ctx.moveTo(0, 16);
  ctx.lineTo(-14, 38);
  ctx.moveTo(0, 16);
  ctx.lineTo(16, 36);
  ctx.stroke();
  ctx.strokeStyle = '#ff6b57';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(-5, 12);
  ctx.lineTo(5, 12);
  ctx.stroke();
  ctx.restore();
  // Multicolour wordmark
  const colors = ['#ff6b57', '#4fb0ea', '#6cc24a', '#f7b733', '#b16cea', '#ff6b57', '#4fb0ea', '#6cc24a', '#f7b733', '#b16cea', '#ff6b57'];
  const word = 'LITTLE TYKES';
  ctx.save();
  ctx.font = `700 44px ${FONT}`;
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  const widths = [...word].map((ch) => ctx.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0);
  let x = -total / 2;
  let ci = 0;
  [...word].forEach((ch, i) => {
    const cx = x + widths[i] / 2;
    const wob = Math.sin(i * 1.7) * 4;
    ctx.save();
    ctx.translate(cx, 4 + wob);
    ctx.rotate(Math.sin(i * 2.3) * 0.08);
    ctx.textAlign = 'center';
    ctx.lineWidth = 9;
    ctx.strokeStyle = INK;
    ctx.strokeText(ch, 0, 0);
    ctx.fillStyle = ch === ' ' ? INK : colors[ci++ % colors.length];
    ctx.fillText(ch, 0, 0);
    ctx.restore();
    x += widths[i];
  });
  ctx.restore();
  text(ctx, 'diving tourney', 0, 46, { size: 22, weight: 600, color: '#4a4f66' });
}

// Tier 2: a local club crest. Two colours, a cliff-and-waves emblem, tidy type.
function drawBluffs(ctx) {
  const slate = '#3c5a78';
  const sand = '#e8dcc0';
  // Patch
  roundRect(ctx, -190, -84, 380, 168, 26);
  ctx.fillStyle = sand;
  ctx.fill();
  ctx.lineWidth = 7;
  ctx.strokeStyle = slate;
  ctx.stroke();
  roundRect(ctx, -178, -72, 356, 144, 18);
  ctx.lineWidth = 2.5;
  ctx.stroke();
  // Emblem: circle with strata cliff and waves
  ctx.save();
  ctx.translate(-118, 0);
  ctx.beginPath();
  ctx.arc(0, 0, 54, 0, Math.PI * 2);
  ctx.fillStyle = '#bfe3f1';
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = slate;
  ctx.stroke();
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, 51, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = '#d8ccb0';
  ctx.beginPath();
  ctx.moveTo(-60, 60);
  ctx.lineTo(-60, -30);
  ctx.lineTo(-20, -34);
  ctx.lineTo(-10, -10);
  ctx.lineTo(-2, 8);
  ctx.lineTo(4, 30);
  ctx.lineTo(8, 60);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(80,70,50,0.45)';
  ctx.lineWidth = 2;
  for (let y = -22; y < 60; y += 9) {
    ctx.beginPath();
    ctx.moveTo(-60, y);
    ctx.lineTo(4 + (y + 22) * 0.1, y + 1);
    ctx.stroke();
  }
  ctx.fillStyle = '#7fcde5';
  ctx.beginPath();
  ctx.moveTo(-60, 60);
  for (let x = -60; x <= 60; x += 6) ctx.lineTo(x, 28 + Math.sin(x / 7) * 3);
  ctx.lineTo(60, 60);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  for (let x = -60; x <= 60; x += 6) {
    const y = 28 + Math.sin(x / 7) * 3;
    if (x === -60) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();
  ctx.restore();
  // Wordmark
  text(ctx, 'THE BLUFFS', 52, -22, { size: 42, weight: 700, color: slate, spacing: 1 });
  ctx.fillStyle = slate;
  ctx.fillRect(-28, 4, 160, 3);
  text(ctx, 'AMATEUR DIVING COMP.', 52, 26, { size: 16, weight: 600, color: slate, spacing: 2 });
  text(ctx, 'EST. 1998', 52, 50, { size: 13, weight: 600, color: '#6b7a8c', spacing: 3 });
}

// Tier 3: a championship crest. Navy shield, gold laurels, a diver's arc.
function drawOlympic(ctx) {
  const navy = '#15305c';
  const gold = '#e4b53c';
  const goldDark = '#b88a1e';
  // Laurel wreath
  ctx.save();
  ctx.translate(-120, 4);
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.scale(side, 1);
    ctx.fillStyle = gold;
    ctx.strokeStyle = goldDark;
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 7; i++) {
      const a = -0.35 + i * 0.26;
      const r = 70;
      const x = Math.sin(a) * r;
      const y = -Math.cos(a) * r + 60;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a + 0.9);
      ctx.beginPath();
      ctx.ellipse(0, 0, 17, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }
  // Shield
  ctx.beginPath();
  ctx.moveTo(-54, -62);
  ctx.lineTo(54, -62);
  ctx.lineTo(54, 10);
  ctx.quadraticCurveTo(54, 50, 0, 70);
  ctx.quadraticCurveTo(-54, 50, -54, 10);
  ctx.closePath();
  ctx.fillStyle = navy;
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = gold;
  ctx.stroke();
  // Diver arc + figure
  ctx.strokeStyle = gold;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(-6, 20, 40, -2.6, -0.5);
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(-6, 20, 30, -2.4, -0.8);
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(14, -30, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(10, -22);
  ctx.lineTo(-12, 6);
  ctx.lineTo(-30, 26);
  ctx.moveTo(-12, 6);
  ctx.lineTo(-24, 0);
  ctx.moveTo(6, -18);
  ctx.lineTo(24, -4);
  ctx.moveTo(6, -18);
  ctx.lineTo(-6, -34);
  ctx.stroke();
  // Star
  ctx.fillStyle = gold;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 4 : 9;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    ctx.lineTo(Math.cos(a) * r, 50 + Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  // Wordmark
  text(ctx, 'OLYMPIC', 60, -46, { size: 18, weight: 600, color: goldDark, spacing: 7 });
  text(ctx, 'SUPERDIVE', 60, -12, { size: 50, weight: 700, color: navy, spacing: 1 });
  text(ctx, 'CLASSIC', 60, 32, { size: 46, weight: 700, color: navy, spacing: 6 });
  ctx.fillStyle = gold;
  ctx.fillRect(-30, 58, 180, 4);
  text(ctx, 'REDWALL GORGE', 60, 72, { size: 14, weight: 600, color: '#5a6478', spacing: 3 });
}

// Tier 4: a world-series sponsor mark. Black plate, electric-blue horse head, heavy italic wordmark.
function drawBlueHorse(ctx) {
  const blue = '#1ba3ff';
  const blueDeep = '#0b4ea8';
  // Plate
  roundRect(ctx, -196, -90, 392, 180, 20);
  const g = ctx.createLinearGradient(0, -90, 0, 90);
  g.addColorStop(0, '#2a2d3a');
  g.addColorStop(1, '#0f1119');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = blue;
  ctx.stroke();
  // Speed stripes
  ctx.save();
  roundRect(ctx, -194, -88, 388, 176, 18);
  ctx.clip();
  ctx.strokeStyle = 'rgba(27,163,255,0.25)';
  ctx.lineWidth = 3;
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.moveTo(-200 + i * 14, 90);
    ctx.lineTo(-120 + i * 14, -90);
    ctx.stroke();
  }
  ctx.restore();
  // Horse head emblem
  ctx.save();
  ctx.translate(-150, -4);
  ctx.scale(1.25, 1.25);
  const hg = ctx.createLinearGradient(-40, -50, 40, 40);
  hg.addColorStop(0, '#7fd0ff');
  hg.addColorStop(0.5, blue);
  hg.addColorStop(1, blueDeep);
  ctx.fillStyle = hg;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(-34, 48); // base of neck
  ctx.lineTo(-30, 4);
  ctx.lineTo(-16, -22);
  ctx.lineTo(-8, -42); // ear
  ctx.lineTo(2, -24);
  ctx.lineTo(14, -22); // forehead
  ctx.quadraticCurveTo(34, -14, 46, 2); // nose bridge
  ctx.lineTo(48, 14); // muzzle tip
  ctx.lineTo(40, 18); // lip
  ctx.lineTo(30, 10);
  ctx.quadraticCurveTo(18, 14, 8, 24); // jaw
  ctx.lineTo(0, 48);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Mane: angular spikes
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(-16, -22);
  ctx.lineTo(-32, -34);
  ctx.lineTo(-26, -16);
  ctx.lineTo(-44, -12);
  ctx.lineTo(-30, 0);
  ctx.lineTo(-46, 16);
  ctx.lineTo(-30, 14);
  ctx.lineTo(-34, 48);
  ctx.lineTo(-24, 20);
  ctx.closePath();
  ctx.fill();
  // Eye + nostril
  ctx.fillStyle = '#0f1119';
  ctx.beginPath();
  ctx.ellipse(10, -12, 4.5, 3, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(40, 8, 2.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // Wordmark
  text(ctx, 'BLUE HORSE', 56, -26, { size: 48, weight: 700, color: '#fff', italic: true, spacing: -1 });
  ctx.fillStyle = blue;
  ctx.fillRect(-52, 6, 238, 4);
  text(ctx, 'CLIFFDIVING', 56, 30, { size: 20, weight: 700, color: blue, spacing: 6 });
  text(ctx, 'WORLD SERIES', 56, 56, { size: 20, weight: 700, color: '#fff', spacing: 6 });
}

const DRAWERS = { tykes: drawTykes, bluffs: drawBluffs, olympic: drawOlympic, bluehorse: drawBlueHorse };

/** Draw a logo centred on the origin, scaled to fit a w×h box (logo is 400×200). */
export function drawLogo(ctx, id, w, h) {
  const fn = DRAWERS[id] ?? drawTykes;
  const s = Math.min(w / 400, h / 200);
  ctx.save();
  ctx.scale(s, s);
  fn(ctx);
  ctx.restore();
}

const cache = new Map();
let generation = 0;
if (typeof document !== 'undefined' && document.fonts?.ready) {
  document.fonts.ready.then(() => {
    generation += 1;
    cache.clear();
  });
}

/** An offscreen canvas holding the logo at the given pixel width (2:1). */
export function logoCanvas(id, widthPx) {
  const key = `${id}:${widthPx}:${generation}`;
  let c = cache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = widthPx;
  c.height = widthPx / 2;
  const ctx = c.getContext('2d');
  ctx.translate(widthPx / 2, widthPx / 4);
  drawLogo(ctx, id, widthPx * 0.96, widthPx * 0.48);
  cache.set(key, c);
  return c;
}

export function logoDataURL(id, widthPx = 320) {
  return logoCanvas(id, widthPx).toDataURL('image/png');
}
