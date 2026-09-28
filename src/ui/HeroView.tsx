import { useEffect, useRef } from 'react';
import { drawHero, type HeroLook } from '../art/hero';

const W = 30;
const H = 26;

/** The hero on a transparent canvas: idles, and lunges with a swing when `attackKey` changes. */
export function HeroView({ look, attackKey = 0, size = 90, label = 'Your character' }: { look: HeroLook; attackKey?: number; size?: number; label?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const lookRef = useRef(look);
  lookRef.current = look;
  const start = useRef(-1);
  useEffect(() => {
    if (attackKey) start.current = performance.now();
  }, [attackKey]);

  useEffect(() => {
    const ctx = ref.current!.getContext('2d')!;
    const still = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    const t0 = performance.now();
    const frame = (now: number) => {
      const p = start.current < 0 ? 1 : Math.min(1, (now - start.current) / 380);
      const acting = p < 1;
      const T = still ? 0 : (now - t0) / 1000;
      let arm = -0.9 + Math.sin(T * 2) * 0.05;
      let lunge = 0;
      if (acting) {
        arm = p < 0.4 ? -0.9 - 1.3 * (p / 0.4) : p < 0.55 ? -2.2 + 2.8 * ((p - 0.4) / 0.15) : 0.6 - 1.5 * ((p - 0.55) / 0.45);
        lunge = Math.round(Math.sin(Math.min(1, p / 0.7) * Math.PI) * 4);
      }
      ctx.clearRect(0, 0, W, H);
      drawHero(ctx, 10, H - 2, lookRef.current, { arm, bob: acting ? 0 : Math.floor(T * 1.5) % 2, lunge });
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={ref} width={W} height={H} className="px hero-canvas" style={{ width: size, height: (size * H) / W }} role="img" aria-label={label} />;
}
