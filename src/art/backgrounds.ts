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

export function backgroundUrl(biome: Biome | 'town'): string {
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
