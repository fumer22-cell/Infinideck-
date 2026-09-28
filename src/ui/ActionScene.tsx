import { useEffect, useRef } from 'react';
import { backgroundUrl, type Scene as SceneId } from '../art/backgrounds';
import { burst, drawAnvil, drawBobber, drawFire, drawFish, drawHero, drawPot, drawRock, drawTree, stepParticles, type HeroLook, type Particle } from '../art/hero';
import { COOKING, FORGING, GATHER } from '../game/activities';
import { ITEMS } from '../game/items';
import type { Active } from '../game/world';
import { useApp } from './context';
import { heroLook } from './heroLook';

const W = 96;
const H = 54;
const GROUND = 47;
const ACTION_MS = 480;

type Kind = 'mining' | 'woodcutting' | 'fishing' | 'cooking' | 'forge';

interface SceneSpec {
  kind: Kind;
  bg: SceneId;
  /** first background row shown (backgrounds are 96×160) */
  cropY: number;
  /** colours of the thing being worked on */
  c1: string;
  c2: string;
  leaves?: string | null;
  leavesLight?: string | null;
}

const TREE_LEAVES: Record<string, [string | null, string | null]> = {
  'tree-normal': [null, null],
  'tree-oak': ['#3a6a2a', '#6aa04a'],
  'tree-willow': ['#6a8a3a', '#a0c060'],
  'tree-maple': ['#a04a1a', '#e08a3a'],
  'tree-yew': ['#1e3a1a', '#3a6a2a'],
  'tree-magic': ['#2a4a8a', '#a0e0ff'],
};

export function sceneSpec(a: Active): SceneSpec | null {
  if (a.kind === 'gather') {
    const n = GATHER.find((g) => g.id === a.id)!;
    const tint = ITEMS[n.item].tint ?? {};
    if (n.skill === 'mining') return { kind: 'mining', bg: 'mine', cropY: 96, c1: tint.y ?? '#c87a3a', c2: tint.Y ?? '#f0b070' };
    if (n.skill === 'woodcutting') {
      const [leaves, leavesLight] = TREE_LEAVES[n.id] ?? [null, null];
      return { kind: 'woodcutting', bg: 'forest', cropY: 80, c1: tint.b ?? '#6a4a2a', c2: '#b08a5a', leaves, leavesLight };
    }
    return { kind: 'fishing', bg: 'river', cropY: 71, c1: tint.y ?? '#8aa0b0', c2: '#f0e8d8' };
  }
  if (a.kind === 'cook') {
    const r = COOKING.find((c) => c.id === a.id)!;
    const t = ITEMS[r.output].tint ?? {};
    return { kind: 'cooking', bg: 'forge', cropY: 70, c1: t.y ?? t.o ?? t.g ?? '#c08a4a', c2: '#d0a060' };
  }
  if (a.kind === 'forge') {
    const r = FORGING.find((f) => f.id === a.id)!;
    const t = ITEMS[r.bar].tint ?? {};
    return { kind: 'forge', bg: 'forge', cropY: 70, c1: t.y ?? '#b8743a', c2: t.Y ?? '#e8a86a' };
  }
  return null;
}

const TOOL: Record<Kind, HeroLook['tool']> = { mining: 'pickaxe', woodcutting: 'axe', fishing: 'rod', cooking: 'spoon', forge: 'hammer' };
const HERO_X: Record<Kind, number> = { mining: 34, woodcutting: 30, fishing: 22, cooking: 31, forge: 29 };

const ease = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Arm angle for a swing: wind up, strike, recover. */
function swing(p: number, rest: number, raised: number, strike: number): number {
  if (p < 0.38) return lerp(rest, raised, ease(p / 0.38));
  if (p < 0.5) return lerp(raised, strike, (p - 0.38) / 0.12);
  return lerp(strike, rest, ease((p - 0.5) / 0.5));
}

const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * The hero at work. Idles between cards and plays one action each time
 * `actionKey` changes: a swing with debris, a catch, a stir, a hammer blow.
 */
export function ActionScene({ active, actionKey }: { active: Active; actionKey: number }) {
  const { world, lv } = useApp();
  const spec = sceneSpec(active);
  const ref = useRef<HTMLCanvasElement>(null);
  const specRef = useRef(spec);
  specRef.current = spec;
  const lookRef = useRef<HeroLook | null>(null);
  lookRef.current = spec ? heroLook(world, lv, TOOL[spec.kind]) : null;
  const anim = useRef({ start: -1, impacted: false, particles: [] as Particle[], shake: 0 });

  useEffect(() => {
    if (!actionKey) return;
    anim.current.start = performance.now();
    anim.current.impacted = false;
  }, [actionKey]);

  useEffect(() => {
    const cv = ref.current;
    if (!cv || !spec) return;
    const ctx = cv.getContext('2d')!;
    const bg = new Image();
    bg.src = backgroundUrl(spec.bg);
    const still = reducedMotion();
    let raf = 0;
    const t0 = performance.now();

    const frame = (now: number) => {
      const s = specRef.current;
      const look = lookRef.current;
      if (!s || !look) return;
      const a = anim.current;
      const T = still ? 0 : (now - t0) / 1000;
      const p = a.start < 0 ? 1 : Math.min(1, (now - a.start) / ACTION_MS);
      const acting = p < 1;
      const bob = acting ? 0 : Math.floor(T * 1.5) % 2;
      const cx = HERO_X[s.kind];

      ctx.clearRect(0, 0, W, H);
      if (bg.complete) ctx.drawImage(bg, 0, s.cropY, W, H, 0, 0, W, H);
      a.shake = acting && p > 0.5 && p < 0.7 ? (Math.floor(now / 40) % 2 ? 1 : -1) : 0;

      let arm = -0.6;
      if (s.kind === 'mining') {
        arm = acting ? swing(p, -0.55, -2.4, 0.55) : -0.55 + Math.sin(T * 2) * 0.04;
        drawRock(ctx, 44, GROUND, s.c1, s.c2, a.shake);
      } else if (s.kind === 'woodcutting') {
        arm = acting ? swing(p, -0.25, -2.1, 0.05) : -0.25 + Math.sin(T * 2) * 0.04;
        drawTree(ctx, 36, GROUND, s.c1, s.leaves ?? null, s.leavesLight ?? null, a.shake, T);
      } else if (s.kind === 'forge') {
        arm = acting ? swing(p, -0.9, -2.3, 0.7) : -0.9 + Math.sin(T * 2) * 0.04;
        drawAnvil(ctx, 36, GROUND, s.c1, acting ? 1 - p : 0.3 + Math.sin(T * 3) * 0.2);
      } else if (s.kind === 'cooking') {
        arm = 0.35 + Math.sin(T * 5 + (acting ? p * 12 : 0)) * 0.25;
        drawFire(ctx, 40, GROUND, T);
        drawPot(ctx, 39, GROUND, s.c1, T);
        if (!still && Math.random() < 0.08) burst(a.particles, 42 + Math.random() * 8, GROUND - 18, ['#d8d0c0', '#a8a29a'], 1, { up: 0.4, spread: 0.3, g: -0.01 });
      } else if (s.kind === 'fishing') {
        arm = acting ? (p < 0.25 ? lerp(-1.0, -1.6, ease(p / 0.25)) : lerp(-1.6, -1.0, ease((p - 0.25) / 0.75))) : -1.0 + Math.sin(T * 1.5) * 0.05;
      }

      const { tip } = drawHero(ctx, cx, GROUND, look, { arm, bob });

      // impacts and catches
      if (acting && !a.impacted && p >= 0.5) {
        a.impacted = true;
        if (!still) {
          if (s.kind === 'mining') burst(a.particles, tip[0], tip[1], [s.c1, s.c2, '#8a847c', '#6e6964'], 10);
          if (s.kind === 'woodcutting') {
            burst(a.particles, tip[0], tip[1], [s.c1, '#b08a5a', '#d0b080'], 8);
            if (s.leaves) burst(a.particles, 44, GROUND - 26, [s.leaves, s.leavesLight ?? s.leaves], 5, { up: 0.3, spread: 1.2, g: 0.02 });
          }
          if (s.kind === 'forge') burst(a.particles, tip[0], tip[1], ['#fff0a0', '#f0b040', '#e0782a'], 12, { up: 1.6, spread: 2.2 });
        }
      }
      if (s.kind === 'fishing') {
        const bx = 66;
        const by = 44 + (acting ? 0 : Math.floor(T * 2) % 2);
        if (!acting || p > 0.2) {
          ctx.fillStyle = '#e8e0cc88';
          const n = 24;
          for (let i = 0; i <= n; i++) {
            const k = i / n;
            ctx.fillRect(Math.round(lerp(tip[0], bx, k)), Math.round(lerp(tip[1], by, k) + Math.sin(k * Math.PI) * 4), 1, 1);
          }
          drawBobber(ctx, bx, by);
        }
        if (acting && p > 0.15 && p < 0.85) {
          // the catch arcs out of the water towards the hero
          const k = (p - 0.15) / 0.7;
          drawFish(ctx, Math.round(lerp(bx, cx + 6, k)), Math.round(lerp(by, GROUND - 14, k) - Math.sin(k * Math.PI) * 16), s.c1);
        }
        if (acting && !still && p < 0.2 && a.particles.length < 6) burst(a.particles, bx, by, ['#a0e0ff', '#5a8aaa', '#f0f8ff'], 6, { up: 1.2 });
      }
      if (s.kind === 'cooking' && acting && p < 0.8) {
        const k = p / 0.8;
        const fx = Math.round(lerp(44, 50, k));
        const fy = Math.round(GROUND - 18 - Math.sin(k * Math.PI) * 14);
        ctx.fillStyle = '#0d0b0a';
        ctx.fillRect(fx - 1, fy - 1, 5, 4);
        ctx.fillStyle = s.c1;
        ctx.fillRect(fx, fy, 3, 2);
      }
      stepParticles(ctx, a.particles);
      if (!still || acting) raf = requestAnimationFrame(frame);
      else raf = 0;
    };
    raf = requestAnimationFrame(frame);
    // with reduced motion we only redraw when something happens
    const kick = setInterval(() => {
      if (still && !raf) raf = requestAnimationFrame(frame);
    }, 250);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(kick);
    };
  }, [spec?.kind, spec?.bg]);

  if (!spec) return null;
  return <canvas ref={ref} width={W} height={H} className="action-canvas px" aria-label={`Your character is ${spec.kind === 'forge' ? 'forging' : spec.kind}`} role="img" />;
}
