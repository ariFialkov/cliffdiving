// Random number helpers.
// - secureSeed(): a fresh 32-bit seed from the platform CSPRNG.
// - mulberry32(seed): a small, fast seeded PRNG so every cosmetic detail of a
//   round (judge noise, bot hesitation, splash shapes) is reproducible from
//   the round seed.

export function secureSeed() {
  const g = globalThis.crypto;
  if (g && typeof g.getRandomValues === 'function') {
    const buf = new Uint32Array(1);
    g.getRandomValues(buf);
    return buf[0] >>> 0;
  }
  return (Math.random() * 0xffffffff) >>> 0;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.range = (lo, hi) => lo + next() * (hi - lo);
  next.int = (lo, hi) => lo + Math.floor(next() * (hi - lo + 1));
  next.pick = (arr) => arr[Math.floor(next() * arr.length)];
  next.chance = (p) => next() < p;
  return next;
}

export function seedToId(seed) {
  return seed.toString(16).padStart(8, '0').toUpperCase();
}
