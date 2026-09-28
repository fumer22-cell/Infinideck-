import { useEffect, useRef } from 'react';
import type { LevelUp } from '../core/profile';
import { SKILLS } from '../game/skills';
import { Sprite } from './common';

/** Level-up fanfare with chunky pixel fireworks. */
export function Fanfare({ ups, onDone }: { ups: LevelUp[]; onDone: () => void }) {
  const cv = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = cv.current!;
    const W = (c.width = 120);
    const H = (c.height = 200);
    const ctx = c.getContext('2d')!;
    const colors = ['#f0d070', '#e0782a', '#e03a2a', '#8ab04a', '#a0e0ff', '#c090ff'];
    type P = { x: number; y: number; vx: number; vy: number; life: number; c: string };
    let parts: P[] = [];
    const burst = () => {
      const x = 15 + Math.random() * (W - 30);
      const y = 20 + Math.random() * 70;
      const col = colors[Math.floor(Math.random() * colors.length)];
      for (let i = 0; i < 26; i++) {
        const a = (i / 26) * Math.PI * 2;
        const s = 0.6 + Math.random() * 0.9;
        parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 40 + Math.random() * 20, c: col });
      }
    };
    let frame = 0;
    let raf = 0;
    const tick = () => {
      frame++;
      if (frame % 18 === 1 && frame < 120) burst();
      ctx.clearRect(0, 0, W, H);
      parts = parts.filter((p) => p.life-- > 0);
      for (const p of parts) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.03;
        ctx.fillStyle = p.life % 6 < 3 && p.life < 15 ? '#fff' : p.c;
        ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
      }
      if (frame < 200) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const t = setTimeout(onDone, 2400);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [onDone]);

  return (
    <div className="fanfare" aria-live="polite">
      <canvas ref={cv} className="px" />
      <div className="banner stone">
        <h2>Congratulations!</h2>
        {ups.map((u) => {
          const s = SKILLS.find((x) => x.id === u.skill)!;
          return (
            <div key={u.skill} className="row" style={{ justifyContent: 'center', marginTop: 6 }}>
              <Sprite name={s.icon} size={24} />
              <span className="small">{s.name} is now level {u.level}.</span>
            </div>
          );
        })}
        {ups.length === 1 && <div className="lvl">Level {ups[0].level}</div>}
      </div>
    </div>
  );
}
