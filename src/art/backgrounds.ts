import type { Biome } from '../game/enemies';

/** Procedural low-res dungeon backdrops, drawn once per biome at 96x160 and scaled up pixelated. */
const W = 96;
const H = 160;
const cache = new Map<string, string>();

function mulberry(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function px(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, c: string) {
  ctx.fillStyle = c;
  ctx.fillRect(x, y, w, h);
}

function bricks(ctx: CanvasRenderingContext2D, rng: () => number, y0: number, y1: number, cols: string[], mortar: string) {
  px(ctx, 0, y0, W, y1 - y0, mortar);
  for (let y = y0, row = 0; y < y1; y += 6, row++) {
    for (let x = row % 2 ? -6 : 0; x < W; x += 12) {
      px(ctx, x + 1, y + 1, 11, 5, cols[Math.floor(rng() * cols.length)]);
      if (rng() < 0.15) px(ctx, x + 3 + Math.floor(rng() * 6), y + 2, 2, 1, mortar);
    }
  }
}

function torch(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const glow = ctx.createRadialGradient(x, y, 1, x, y, 26);
  glow.addColorStop(0, 'rgba(255,150,50,0.45)');
  glow.addColorStop(1, 'rgba(255,120,40,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(x - 26, y - 26, 52, 52);
  px(ctx, x - 1, y + 1, 3, 6, '#3a2616');
  px(ctx, x - 2, y, 5, 2, '#6a4a2a');
  px(ctx, x - 1, y - 4, 3, 4, '#e0782a');
  px(ctx, x, y - 6, 1, 3, '#fff0a0');
}

function drawCrypt(ctx: CanvasRenderingContext2D, rng: () => number) {
  bricks(ctx, rng, 0, 110, ['#2a2624', '#302b28', '#262220', '#35302c'], '#141110');
  // arches
  for (const ax of [8, 56]) {
    px(ctx, ax, 34, 32, 76, '#0a0808');
    for (let i = 0; i < 16; i++) {
      const w = Math.round(Math.sqrt(256 - (16 - i) ** 2));
      px(ctx, ax + 16 - w, 18 + i, w * 2, 1, '#0a0808');
    }
    px(ctx, ax - 2, 34, 2, 76, '#3d3733');
    px(ctx, ax + 32, 34, 2, 76, '#3d3733');
  }
  torch(ctx, 48, 50);
  torch(ctx, 4, 60);
  torch(ctx, 92, 60);
  // floor
  for (let y = 110; y < H; y++) {
    const t = (y - 110) / 50;
    px(ctx, 0, y, W, 1, `rgb(${30 + t * 20},${26 + t * 16},${24 + t * 14})`);
  }
  for (let i = 0; i < 40; i++) px(ctx, Math.floor(rng() * W), 112 + Math.floor(rng() * 48), 2, 1, '#1a1614');
  // bones
  for (let i = 0; i < 5; i++) {
    const x = Math.floor(rng() * 86);
    const y = 124 + Math.floor(rng() * 30);
    px(ctx, x, y, 6, 1, '#b8b0a0');
    px(ctx, x - 1, y - 1, 2, 3, '#b8b0a0');
    px(ctx, x + 5, y - 1, 2, 3, '#b8b0a0');
  }
}

function drawBog(ctx: CanvasRenderingContext2D, rng: () => number) {
  for (let y = 0; y < 100; y++) {
    const t = y / 100;
    px(ctx, 0, y, W, 1, `rgb(${14 + t * 20},${22 + t * 28},${18 + t * 14})`);
  }
  // moon behind fog
  ctx.fillStyle = 'rgba(210,230,170,0.35)';
  ctx.beginPath();
  ctx.arc(70, 22, 10, 0, Math.PI * 2);
  ctx.fill();
  // far treeline
  for (let x = 0; x < W; x++) {
    const h = 12 + Math.floor(Math.sin(x * 0.3) * 3 + rng() * 5);
    px(ctx, x, 100 - h, 1, h, '#0e1610');
  }
  // dead trees
  for (const tx of [10, 78]) {
    px(ctx, tx, 40, 4, 64, '#1a1410');
    px(ctx, tx - 8, 52, 9, 2, '#1a1410');
    px(ctx, tx + 3, 46, 10, 2, '#1a1410');
    px(ctx, tx - 8, 48, 2, 5, '#1a1410');
    px(ctx, tx + 11, 40, 2, 7, '#1a1410');
    for (let i = 0; i < 6; i++) px(ctx, tx - 6 + Math.floor(rng() * 14), 54 + i * 3, 1, 4 + Math.floor(rng() * 5), '#3a5a2a');
  }
  // water
  for (let y = 100; y < H; y++) {
    const t = (y - 100) / 60;
    px(ctx, 0, y, W, 1, `rgb(${16 + t * 10},${30 + t * 12},${24 + t * 6})`);
  }
  for (let i = 0; i < 50; i++) px(ctx, Math.floor(rng() * W), 102 + Math.floor(rng() * 58), 3 + Math.floor(rng() * 6), 1, rng() < 0.5 ? '#2c4a34' : '#0c1a12');
  // reeds & lily
  for (let i = 0; i < 14; i++) {
    const x = Math.floor(rng() * W);
    const h = 6 + Math.floor(rng() * 10);
    px(ctx, x, 106 - h + Math.floor(rng() * 40), 1, h, '#4a7a3a');
  }
  // fog bands
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = 'rgba(150,180,140,0.07)';
    ctx.fillRect(0, 80 + i * 12, W, 6);
  }
}

function drawKeep(ctx: CanvasRenderingContext2D, rng: () => number) {
  for (let y = 0; y < 90; y++) {
    const t = y / 90;
    px(ctx, 0, y, W, 1, `rgb(${18 + t * 30},${14 + t * 12},${30 + t * 10})`);
  }
  for (let i = 0; i < 30; i++) px(ctx, Math.floor(rng() * W), Math.floor(rng() * 60), 1, 1, rng() < 0.3 ? '#fff0a0' : '#8a8090');
  // blood moon
  ctx.fillStyle = '#a02020';
  ctx.beginPath();
  ctx.arc(24, 24, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(160,30,30,0.15)';
  ctx.beginPath();
  ctx.arc(24, 24, 16, 0, Math.PI * 2);
  ctx.fill();
  // ruined walls silhouette with crenellations
  const wall = (x: number, w: number, h: number, c: string) => {
    px(ctx, x, 110 - h, w, h, c);
    for (let cx = x; cx < x + w; cx += 6) px(ctx, cx, 110 - h - 4, 3, 4, c);
  };
  wall(0, 30, 50, '#1c1820');
  wall(60, 36, 64, '#1c1820');
  px(ctx, 70, 60, 4, 8, '#e0782a');
  px(ctx, 84, 70, 3, 6, '#a05020');
  wall(34, 20, 26, '#26202a');
  // broken banner
  px(ctx, 18, 64, 1, 30, '#3a2616');
  px(ctx, 19, 64, 8, 12, '#6a1414');
  px(ctx, 19, 76, 4, 4, '#6a1414');
  // courtyard floor
  bricks(ctx, rng, 110, H, ['#2c2826', '#322d2a', '#282421'], '#161312');
  for (let i = 0; i < 10; i++) px(ctx, Math.floor(rng() * W), 112 + Math.floor(rng() * 44), 4, 2, '#3d3733');
}


function drawMine(ctx: CanvasRenderingContext2D, rng: () => number) {
  for (let y = 0; y < H; y++) px(ctx, 0, y, W, 1, `rgb(${22 + (y / H) * 16},${18 + (y / H) * 12},${16 + (y / H) * 10})`);
  // rough cave walls
  for (let i = 0; i < 260; i++) {
    const x = Math.floor(rng() * W);
    const y = Math.floor(rng() * 120);
    px(ctx, x, y, 3 + Math.floor(rng() * 5), 2 + Math.floor(rng() * 3), rng() < 0.5 ? '#2e2824' : '#1a1614');
  }
  // ore glints
  const glints = ['#c87a3a', '#7ae0e8', '#a8a8a0', '#6ab07a', '#7a8ad0'];
  for (let i = 0; i < 26; i++) px(ctx, Math.floor(rng() * W), Math.floor(rng() * 110), 2, 2, glints[Math.floor(rng() * glints.length)]);
  // support beams
  for (const bx of [10, 82]) {
    px(ctx, bx, 30, 4, 90, '#4a3018');
    px(ctx, bx + 1, 30, 1, 90, '#6a4a2a');
  }
  px(ctx, 6, 28, 84, 4, '#4a3018');
  torch(ctx, 22, 56);
  torch(ctx, 74, 56);
  // cart rails
  for (let y = 118; y < H; y++) px(ctx, 0, y, W, 1, `rgb(${34 + (y - 118)},${28 + (y - 118) * 0.6},${24})`);
  for (let x = 0; x < W; x += 8) px(ctx, x, 140, 5, 2, '#3a2616');
  px(ctx, 0, 138, W, 1, '#6a6a70');
  px(ctx, 0, 143, W, 1, '#6a6a70');
}

function drawForest(ctx: CanvasRenderingContext2D, rng: () => number) {
  for (let y = 0; y < 90; y++) px(ctx, 0, y, W, 1, `rgb(${20 + (y / 90) * 20},${26 + (y / 90) * 30},${30 + (y / 90) * 12})`);
  ctx.fillStyle = 'rgba(230,220,180,0.5)';
  ctx.beginPath();
  ctx.arc(74, 20, 7, 0, Math.PI * 2);
  ctx.fill();
  const tree = (x: number, base: number, h: number, c: string, t: string) => {
    px(ctx, x - 1, base - h * 0.4, 3, h * 0.4, t);
    for (let i = 0; i < h * 0.7; i++) {
      const w = Math.round((i / (h * 0.7)) * h * 0.35) + 1;
      px(ctx, x - w, base - h + i, w * 2 + 1, 1, c);
    }
  };
  for (let i = 0; i < 12; i++) tree(Math.floor(rng() * W), 98, 30 + rng() * 20, '#12200f', '#0e0a08');
  for (let i = 0; i < 7; i++) tree(Math.floor(rng() * W), 124, 44 + rng() * 26, '#1e3a1a', '#2a1a10');
  for (let y = 110; y < H; y++) px(ctx, 0, y, W, 1, `rgb(${24 + (y - 110) * 0.3},${36 + (y - 110) * 0.3},${18})`);
  for (let i = 0; i < 40; i++) px(ctx, Math.floor(rng() * W), 112 + Math.floor(rng() * 48), 1, 3, '#4a7a3a');
  // stumps
  for (const sx of [20, 64]) {
    px(ctx, sx, 134, 10, 8, '#5a3a1a');
    px(ctx, sx, 133, 10, 2, '#b08a5a');
  }
}

function drawRiver(ctx: CanvasRenderingContext2D, rng: () => number) {
  for (let y = 0; y < 70; y++) px(ctx, 0, y, W, 1, `rgb(${30 + y * 0.5},${34 + y * 0.6},${52 + y * 0.5})`);
  for (let x = 0; x < W; x++) {
    const h = 8 + Math.floor(Math.sin(x * 0.12) * 4 + rng() * 3);
    px(ctx, x, 70 - h, 1, h, '#1a2418');
  }
  px(ctx, 0, 70, W, 14, '#2a3a1e');
  for (let y = 84; y < H; y++) px(ctx, 0, y, W, 1, `rgb(${20 + (y - 84) * 0.1},${40 + (y - 84) * 0.25},${62 + (y - 84) * 0.3})`);
  for (let i = 0; i < 70; i++) px(ctx, Math.floor(rng() * W), 86 + Math.floor(rng() * 74), 4 + Math.floor(rng() * 8), 1, rng() < 0.5 ? '#5a8aaa' : '#2a4a6a');
  // jetty
  px(ctx, 0, 118, 40, 4, '#5a3a1a');
  for (let x = 2; x < 40; x += 9) px(ctx, x, 122, 2, 20, '#3a2616');
  for (let x = 0; x < 40; x += 5) px(ctx, x, 118, 1, 4, '#3a2616');
}

function drawForge(ctx: CanvasRenderingContext2D, rng: () => number) {
  bricks(ctx, rng, 0, 116, ['#3a2a22', '#42302a', '#34261e', '#4a3428'], '#1a120e');
  // furnace mouth
  px(ctx, 30, 44, 36, 44, '#1a120e');
  for (let i = 0; i < 12; i++) {
    const w = Math.round(Math.sqrt(144 - (12 - i) ** 2));
    px(ctx, 48 - w, 32 + i, w * 2, 1, '#1a120e');
  }
  const glow = ctx.createRadialGradient(48, 74, 2, 48, 74, 40);
  glow.addColorStop(0, 'rgba(255,170,60,0.9)');
  glow.addColorStop(0.4, 'rgba(224,90,30,0.5)');
  glow.addColorStop(1, 'rgba(224,90,30,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(8, 30, 80, 80);
  for (let i = 0; i < 20; i++) px(ctx, 34 + Math.floor(rng() * 28), 70 + Math.floor(rng() * 16), 2, 2, rng() < 0.5 ? '#fff0a0' : '#e0782a');
  for (let y = 116; y < H; y++) px(ctx, 0, y, W, 1, `rgb(${40 - (y - 116) * 0.2},${30 - (y - 116) * 0.2},${24})`);
  // anvil
  px(ctx, 62, 124, 22, 4, '#5a5550');
  px(ctx, 67, 128, 12, 3, '#3a3531');
  px(ctx, 65, 131, 16, 6, '#3a3531');
}

function drawFarm(ctx: CanvasRenderingContext2D, rng: () => number) {
  for (let y = 0; y < 70; y++) px(ctx, 0, y, W, 1, `rgb(${36 + y * 0.6},${30 + y * 0.4},${46 + y * 0.2})`);
  ctx.fillStyle = 'rgba(240,160,80,0.6)';
  ctx.beginPath();
  ctx.arc(20, 62, 12, 0, Math.PI * 2);
  ctx.fill();
  for (let x = 0; x < W; x++) px(ctx, x, 60 + Math.floor(Math.sin(x * 0.08) * 3), 1, 12, '#1e2a16');
  for (let y = 70; y < H; y++) px(ctx, 0, y, W, 1, `rgb(${46 + (y - 70) * 0.1},${34 + (y - 70) * 0.05},${22})`);
  for (let y = 80; y < H; y += 12) {
    px(ctx, 0, y, W, 4, '#3a2616');
    for (let x = 3; x < W; x += 7) if (rng() < 0.8) px(ctx, x, y - 3, 2, 3, rng() < 0.3 ? '#8ab04a' : '#4a7a3a');
  }
  // fence
  for (let x = 0; x < W; x += 10) px(ctx, x, 64, 2, 12, '#5a3a1a');
  px(ctx, 0, 67, W, 1, '#6a4a2a');
  px(ctx, 0, 72, W, 1, '#6a4a2a');
}

export type Scene = Biome | 'town' | 'mine' | 'forest' | 'river' | 'forge' | 'farm';

export function backgroundUrl(biome: Scene): string {
  const hit = cache.get(biome);
  if (hit) return hit;
  if (typeof document === 'undefined') return '';
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d')!;
  const rng = mulberry(biome.length * 977);
  if (biome === 'crypt') drawCrypt(ctx, rng);
  else if (biome === 'bog') drawBog(ctx, rng);
  else if (biome === 'mine') drawMine(ctx, rng);
  else if (biome === 'forest') drawForest(ctx, rng);
  else if (biome === 'river') drawRiver(ctx, rng);
  else if (biome === 'forge') drawForge(ctx, rng);
  else if (biome === 'farm') drawFarm(ctx, rng);
  else drawKeep(ctx, rng);
  // vignette
  const v = ctx.createRadialGradient(W / 2, H / 2, 30, W / 2, H / 2, 100);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
  const url = cv.toDataURL();
  cache.set(biome, url);
  return url;
}
