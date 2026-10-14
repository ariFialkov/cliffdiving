// Per-competition scenery: where each tournament is held and how it looks.

export const THEMES = {
  tykes: {
    place: 'Lake Muskoka, Ontario',
    sky: ['#4fb0ea', '#9ad8f7', '#dff3fb'],
    sun: '#ffe066',
    sunGlow: 'rgba(255, 250, 200, 0.28)',
    clouds: 'rgba(255,255,255,0.92)',
    water: { top: '#2f8fd6', deep: '#123f78', front: 'rgba(70,160,220,0.55)', foam: 'rgba(255,255,255,0.75)', under: '#1b5c9c' },
    rock: { base: '#8b5e3c', strata: 'rgba(70,42,26,0.35)', highlight: 'rgba(255,220,180,0.12)', strataStep: 2.6, jag: 1.0, style: 'blocky' },
    top: { ground: '#5fb24f', lip: '#7ccf6a', tuft: '#3f8f35', hasGrass: true },
    backdrop: { kind: 'mountains', color: '#7fbfd9', color2: '#9fd2e8', snow: '#f4fbff' },
    vegetation: 'pines',
    floatie: 'ring',
    banner: 'bunting',
  },
  bluffs: {
    place: 'Scarborough Bluffs, Lake Ontario',
    sky: ['#58b3ea', '#aadcf3', '#f3ecd9'],
    sun: '#ffe9a3',
    sunGlow: 'rgba(255, 245, 210, 0.3)',
    clouds: 'rgba(255,255,255,0.9)',
    water: { top: '#5cc3df', deep: '#2a8fb5', front: 'rgba(130,210,230,0.5)', foam: 'rgba(255,255,255,0.8)', under: '#3aa6c9' },
    rock: { base: '#d8ccb0', strata: 'rgba(120,105,80,0.26)', highlight: 'rgba(255,255,255,0.35)', strataStep: 1.1, jag: 0.55, style: 'fine' },
    top: { ground: '#8cc96b', lip: '#a6d98a', tuft: '#5e9e47', hasGrass: true },
    backdrop: { kind: 'hills', color: '#89c5d9', color2: '#a6d6e6' },
    vegetation: 'shrubs',
    floatie: 'buoy',
    banner: 'cloth',
  },
  olympic: {
    place: 'Redwall Gorge, Arizona',
    sky: ['#3f9be6', '#8fd0f4', '#ffe3c2'],
    sun: '#fff1a8',
    sunGlow: 'rgba(255, 240, 200, 0.35)',
    clouds: 'rgba(255,255,255,0.85)',
    water: { top: '#3ad5cf', deep: '#1a9db5', front: 'rgba(120,235,225,0.45)', foam: 'rgba(255,255,255,0.85)', under: '#2bb8bf' },
    rock: { base: '#c8552c', strata: 'rgba(90,30,10,0.33)', highlight: 'rgba(255,200,150,0.2)', strataStep: 1.8, jag: 1.25, style: 'ledges' },
    top: { ground: '#d9a66b', lip: '#e8bd85', tuft: '#8a8f4a', hasGrass: false },
    backdrop: { kind: 'mesas', color: '#e08a5a', color2: '#f0a878' },
    vegetation: 'scrub',
    floatie: 'platform',
    banner: 'pleated',
  },
  bluehorse: {
    place: 'Kaʻanapali Point, Maui',
    sky: ['#1f7ddb', '#5fb7f0', '#cfeefd'],
    sun: '#fff3b0',
    sunGlow: 'rgba(255, 255, 220, 0.3)',
    clouds: 'rgba(255,255,255,0.95)',
    water: { top: '#1ba3ff', deep: '#0b4ea8', front: 'rgba(60,170,255,0.5)', foam: 'rgba(255,255,255,0.9)', under: '#0f6fd1' },
    rock: { base: '#2b2b33', strata: 'rgba(0,0,0,0.35)', highlight: 'rgba(120,130,160,0.22)', strataStep: 1.4, jag: 1.4, style: 'columnar' },
    top: { ground: '#3f9a3d', lip: '#5fbf55', tuft: '#2e7a2c', hasGrass: true },
    backdrop: { kind: 'islands', color: '#2f6f9f', color2: '#4d8fb8' },
    vegetation: 'palms',
    floatie: 'pontoon',
    banner: 'pro',
  },
};

export function themeFor(comp) {
  return THEMES[comp?.id] ?? THEMES.tykes;
}
