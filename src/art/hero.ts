/**
 * Procedural pixel-art hero and skilling props, drawn on tiny canvases (1 unit = 1 pixel)
 * and scaled up with image-rendering: pixelated. Everything is drawn in two passes,
 * outline first then fill, so overlapping parts share one clean dark outline.
 */
export const OUTLINE = '#0d0b0a';

type Px = { x: number; y: number; c: string };

/** Collects pixels/rects and paints them outline-first. */
export class Painter {
  private cells: Px[] = [];
  constructor(private ctx: CanvasRenderingContext2D) {}
  rect(x: number, y: number, w: number, h: number, c: string) {
    x = Math.round(x);
    y = Math.round(y);
    for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) this.cells.push({ x: x + i, y: y + j, c });
  }
  px(x: number, y: number, c: string) {
    this.cells.push({ x: Math.round(x), y: Math.round(y), c });
  }
  /** A 1px line from (x0,y0) to (x1,y1). */
  line(x0: number, y0: number, x1: number, y1: number, c: string) {
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
    for (let i = 0; i <= n; i++) this.px(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, c);
  }
  flush(outline = true) {
    const { ctx } = this;
    if (outline) {
      ctx.fillStyle = OUTLINE;
      for (const p of this.cells) ctx.fillRect(p.x - 1, p.y - 1, 3, 3);
    }
    for (const p of this.cells) {
      ctx.fillStyle = p.c;
      ctx.fillRect(p.x, p.y, 1, 1);
    }
    this.cells = [];
  }
}

export type ToolKind = 'pickaxe' | 'axe' | 'hammer' | 'rod' | 'spoon' | 'sword' | 'none';

export interface HeroLook {
  helm?: string; // metal colour
  helmLight?: string;
  body?: string;
  bodyLight?: string;
  shield?: string;
  tool: ToolKind;
  toolColor: string; // metal / tip colour
  toolLight?: string;
}

export interface HeroPose {
  /** arm angle in radians: 0 = pointing right, negative = up */
  arm: number;
  bob: number;
  lunge?: number;
  crouch?: number;
}

const SKIN = '#d0a080';
const HAIR = '#4a2e18';
const TUNIC = '#8a1414';
const TUNIC_LIGHT = '#b02a1e';
const LEGS = '#3a2616';
const WOOD = '#6a4a2a';

/**
 * Draw the hero standing on `groundY`, centred on `cx`, facing right.
 * Returns the hand position and the tool tip (useful for fishing lines and impacts).
 */
export function drawHero(ctx: CanvasRenderingContext2D, cx: number, groundY: number, look: HeroLook, pose: HeroPose): { hand: [number, number]; tip: [number, number] } {
  const p = new Painter(ctx);
  const x = cx + (pose.lunge ?? 0);
  const crouch = pose.crouch ?? 0;
  const top = groundY - 17 - pose.bob + crouch;

  // shield on the back arm
  if (look.shield) {
    p.rect(x - 5, top + 6, 3, 5, look.shield);
    p.px(x - 4, top + 7, look.helmLight ?? '#fff');
  }
  // legs
  p.rect(x - 2, groundY - 5 + crouch, 2, 5 - crouch, LEGS);
  p.rect(x + 1, groundY - 5 + crouch, 2, 5 - crouch, LEGS);
  // body
  p.rect(x - 2, top + 5, 5, 7, look.body ?? TUNIC);
  p.rect(x - 1, top + 6, 1, 4, look.bodyLight ?? TUNIC_LIGHT);
  if (!look.body) p.rect(x - 2, top + 10, 5, 1, '#c8a040'); // belt
  // head
  p.rect(x - 2, top, 5, 5, SKIN);
  if (look.helm) {
    p.rect(x - 2, top - 1, 5, 2, look.helm);
    p.rect(x - 3, top, 1, 4, look.helm);
    p.px(x - 1, top - 1, look.helmLight ?? look.helm);
  } else {
    p.rect(x - 2, top - 1, 5, 1, HAIR);
    p.rect(x - 3, top, 1, 3, HAIR);
  }
  p.flush();

  // face detail (no outline)
  ctx.fillStyle = OUTLINE;
  ctx.fillRect(x + 1, top + 2, 1, 1);

  // arm + tool
  const sx = x + 1;
  const sy = top + 6;
  const ca = Math.cos(pose.arm);
  const sa = Math.sin(pose.arm);
  const hand: [number, number] = [sx + ca * 4, sy + sa * 4];
  const t = new Painter(ctx);
  t.line(sx, sy, hand[0], hand[1], SKIN);
  const len = look.tool === 'rod' ? 17 : look.tool === 'hammer' ? 6 : look.tool === 'spoon' ? 7 : 8;
  const tip: [number, number] = [hand[0] + ca * len, hand[1] + sa * len];
  // perpendicular (towards the swing direction's "front")
  const nx = -sa;
  const ny = ca;
  if (look.tool !== 'none') {
    const handle = look.tool === 'sword' ? look.toolColor : WOOD;
    if (look.tool === 'sword') {
      t.line(hand[0] + ca * 2, hand[1] + sa * 2, tip[0], tip[1], look.toolColor);
      t.line(hand[0] + ca * 2 - nx * 2, hand[1] + sa * 2 - ny * 2, hand[0] + ca * 2 + nx * 2, hand[1] + sa * 2 + ny * 2, '#c8a040');
    } else t.line(hand[0], hand[1], tip[0], tip[1], handle);
    if (look.tool === 'pickaxe') t.line(tip[0] - nx * 3, tip[1] - ny * 3, tip[0] + nx * 3, tip[1] + ny * 3, look.toolColor);
    if (look.tool === 'axe') {
      for (let i = 0; i < 3; i++) t.line(tip[0] - ca * i, tip[1] - sa * i, tip[0] - ca * i + nx * 3, tip[1] - sa * i + ny * 3, look.toolColor);
    }
    if (look.tool === 'hammer') {
      for (let i = 0; i < 2; i++) t.line(tip[0] - nx * 2 + ca * i, tip[1] - ny * 2 + sa * i, tip[0] + nx * 2 + ca * i, tip[1] + ny * 2 + sa * i, look.toolColor);
    }
    if (look.tool === 'rod') t.px(tip[0], tip[1], look.toolColor);
    if (look.tool === 'spoon') t.rect(tip[0] - 1, tip[1] - 1, 2, 2, '#9a9486');
  }
  t.px(hand[0], hand[1], SKIN);
  t.flush();
  // shine on metal heads
  if (look.toolLight && (look.tool === 'pickaxe' || look.tool === 'axe' || look.tool === 'hammer')) {
    ctx.fillStyle = look.toolLight;
    ctx.fillRect(Math.round(tip[0]), Math.round(tip[1]), 1, 1);
  }
  return { hand, tip };
}

// ---------- props ----------

export function drawRock(ctx: CanvasRenderingContext2D, x: number, groundY: number, ore: string, oreLight: string, shake = 0) {
  const p = new Painter(ctx);
  const X = x + shake;
  const rows: [number, number][] = [[3, 8], [1, 12], [0, 14], [0, 14], [0, 15], [0, 15], [0, 15], [1, 14], [0, 15]];
  rows.forEach(([o, w], i) => p.rect(X + o, groundY - rows.length + i, w, 1, i < 3 ? '#8a847c' : i < 6 ? '#6e6964' : '#55504b'));
  p.flush();
  const specks: [number, number, string][] = [[4, 3, ore], [5, 3, oreLight], [9, 5, ore], [3, 6, ore], [11, 2, ore], [12, 6, oreLight], [7, 7, ore]];
  for (const [dx, dy, c] of specks) {
    ctx.fillStyle = c;
    ctx.fillRect(X + dx, groundY - rows.length + dy, 1, 1);
  }
  ctx.fillStyle = '#a8a29a';
  ctx.fillRect(X + 4, groundY - rows.length, 3, 1);
}

export function drawTree(ctx: CanvasRenderingContext2D, x: number, groundY: number, trunk: string, leaves: string | null, leavesLight: string | null, shake = 0, t = 0) {
  const p = new Painter(ctx);
  p.rect(x + 5, groundY - 20, 4, 20, trunk);
  p.rect(x + 3, groundY - 2, 8, 2, trunk);
  if (!leaves) {
    // dead tree: bare branches
    p.line(x + 6, groundY - 18, x + 1 + shake, groundY - 26, trunk);
    p.line(x + 8, groundY - 16, x + 13 + shake, groundY - 24, trunk);
    p.line(x + 7, groundY - 20, x + 7 + shake, groundY - 30, trunk);
  } else {
    const blobs: [number, number, number][] = [[7, -28, 7], [2, -23, 5], [12, -23, 5], [7, -21, 6]];
    for (const [bx, by, r] of blobs) {
      for (let dy = -r; dy <= r; dy++) {
        const w = Math.round(Math.sqrt(r * r - dy * dy));
        p.rect(x + bx - w + shake, groundY + by + dy, w * 2 + 1, 1, leaves);
      }
    }
  }
  p.flush();
  ctx.fillStyle = '#00000040';
  ctx.fillRect(x + 7, groundY - 18, 1, 16);
  if (leaves && leavesLight) {
    ctx.fillStyle = leavesLight;
    for (const [dx, dy] of [[4, -31], [9, -30], [1, -25], [13, -25], [6, -26], [11, -22]]) ctx.fillRect(x + dx + shake, groundY + dy + (Math.floor(t * 2 + dx) % 2), 1, 1);
  }
}

export function drawFire(ctx: CanvasRenderingContext2D, x: number, groundY: number, t: number) {
  const p = new Painter(ctx);
  p.line(x, groundY - 1, x + 9, groundY - 3, WOOD);
  p.line(x, groundY - 3, x + 9, groundY - 1, '#5a3a1a');
  p.flush();
  const f = Math.floor(t * 8) % 3;
  const flames = [[3, 5, 3, '#e0782a'], [4, 7, 2, '#f0b040'], [5, 4 + f, 1, '#fff0a0'], [2 + (f % 2), 3, 2, '#e03a2a'], [6, 4 - (f % 2), 2, '#e03a2a']] as const;
  for (const [dx, h, w, c] of flames) {
    ctx.fillStyle = c;
    ctx.fillRect(x + dx, groundY - 3 - h, w, h);
  }
}

export function drawPot(ctx: CanvasRenderingContext2D, x: number, groundY: number, contents: string, t: number) {
  const p = new Painter(ctx);
  p.rect(x, groundY - 16, 11, 6, '#3a3531');
  p.rect(x - 1, groundY - 17, 13, 1, '#56504a');
  p.flush();
  ctx.fillStyle = contents;
  ctx.fillRect(x + 1, groundY - 16, 9, 1);
  const bub = Math.floor(t * 5) % 4;
  ctx.fillStyle = '#fff8e0';
  ctx.fillRect(x + 2 + bub * 2, groundY - 17 - (bub % 2), 1, 1);
}

export function drawAnvil(ctx: CanvasRenderingContext2D, x: number, groundY: number, bar: string, glow: number) {
  const p = new Painter(ctx);
  p.rect(x, groundY - 9, 13, 3, '#5a5550');
  p.rect(x + 13, groundY - 8, 3, 1, '#5a5550');
  p.rect(x + 3, groundY - 6, 6, 2, '#3a3531');
  p.rect(x + 1, groundY - 4, 10, 4, '#3a3531');
  p.flush();
  ctx.fillStyle = '#8a847c';
  ctx.fillRect(x, groundY - 9, 13, 1);
  // hot bar
  ctx.fillStyle = bar;
  ctx.fillRect(x + 3, groundY - 10, 6, 1);
  ctx.fillStyle = `rgba(255,${120 + Math.round(glow * 100)},40,${0.35 + glow * 0.5})`;
  ctx.fillRect(x + 3, groundY - 10, 6, 1);
}

export function drawBobber(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = OUTLINE;
  ctx.fillRect(x - 1, y - 2, 3, 4);
  ctx.fillStyle = '#e03a2a';
  ctx.fillRect(x, y - 1, 1, 1);
  ctx.fillStyle = '#f0e8d8';
  ctx.fillRect(x, y, 1, 1);
}

export function drawFish(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  const p = new Painter(ctx);
  p.rect(x, y, 5, 2, color);
  p.px(x - 1, y - 1, color);
  p.px(x - 1, y + 2, color);
  p.flush();
  ctx.fillStyle = OUTLINE;
  ctx.fillRect(x + 4, y, 1, 1);
}

// ---------- particles ----------
export interface Particle { x: number; y: number; vx: number; vy: number; life: number; c: string; g: number }

export function burst(list: Particle[], x: number, y: number, colors: string[], n = 8, opts: { up?: number; spread?: number; g?: number } = {}) {
  for (let i = 0; i < n; i++) {
    list.push({
      x,
      y,
      vx: (Math.random() - 0.5) * (opts.spread ?? 1.6),
      vy: -Math.random() * (opts.up ?? 1.3) - 0.2,
      life: 18 + Math.random() * 16,
      c: colors[Math.floor(Math.random() * colors.length)],
      g: opts.g ?? 0.09,
    });
  }
}

export function stepParticles(ctx: CanvasRenderingContext2D, list: Particle[]) {
  for (let i = list.length - 1; i >= 0; i--) {
    const q = list[i];
    q.x += q.vx;
    q.y += q.vy;
    q.vy += q.g;
    if (--q.life <= 0) {
      list.splice(i, 1);
      continue;
    }
    ctx.fillStyle = q.c;
    ctx.fillRect(Math.round(q.x), Math.round(q.y), 1, 1);
  }
}
