import { backgroundUrl, type Scene as SceneId } from '../../art/backgrounds';
import { AREA_BY_ID, COOKING, FORGING, GATHER } from '../../game/activities';
import { SKILL_BY_ID, xpProgress, type SkillId } from '../../game/skills';
import type { Active } from '../../game/world';
import { isFocused, REST_CAP, REST_MS } from '../../game/rewards';
import { ActionScene } from '../ActionScene';
import { ItemIcon, Sprite, XpBar } from '../common';
import { useApp } from '../context';

export interface Pop { id: number; item?: string; text: string; tone?: string; x: number; y?: number }

export function activityInfo(a: Active): { skill: SkillId; name: string; icon: string; item?: string; scene: SceneId } {
  if (a.kind === 'gather') {
    const n = GATHER.find((g) => g.id === a.id)!;
    return { skill: n.skill, name: n.name, icon: SKILL_BY_ID[n.skill].icon, item: n.item, scene: n.skill === 'mining' ? 'mine' : n.skill === 'woodcutting' ? 'forest' : 'river' };
  }
  if (a.kind === 'cook') {
    const r = COOKING.find((c) => c.id === a.id)!;
    return { skill: 'cooking', name: `Cooking ${r.name.toLowerCase()}`, icon: 'pot', item: r.output, scene: 'forge' };
  }
  if (a.kind === 'forge') {
    const r = FORGING.find((f) => f.id === a.id)!;
    return { skill: 'smithing', name: `Forging ${r.name.toLowerCase()}`, icon: 'anvil', item: r.output, scene: 'forge' };
  }
  const area = AREA_BY_ID[a.id];
  return { skill: 'attack', name: area.name, icon: 'sword', scene: area.biome };
}

/** The top panel of the Study tab: where you are, what you're making, and your progress. */
export function Scene({ active, pops, status, actionKey = 0 }: { active: Active; pops: Pop[]; status?: string | null; actionKey?: number }) {
  const { profile, world } = useApp();
  const info = activityInfo(active);
  const pr = xpProgress(profile.xp[info.skill]);
  const have = info.item ? world.bank[info.item] ?? 0 : 0;
  const restedNow = Math.min(REST_CAP, (world.rested ?? 0) + (world.lastActive && Date.now() - world.lastActive >= REST_MS ? Math.floor((Date.now() - world.lastActive) / REST_MS) : 0));
  const readyPlots = world.plots.filter((p) => p && Date.now() - p.planted >= p.growMs).length;
  return (
    <div className="scene px" style={{ backgroundImage: `url(${backgroundUrl(info.scene)})` }}>
      <ActionScene active={active} actionKey={actionKey} />
      <div className="scene-top">
        <Sprite name={SKILL_BY_ID[info.skill].icon} size={22} />
        <div className="grow">
          <div className="scene-title">{info.name}</div>
          <div className="small">{SKILL_BY_ID[info.skill].name} lvl {pr.level}</div>
          <XpBar into={pr.into} span={pr.span} />
        </div>
        <div className="scene-pills">
          {info.item && <span className="pill"><ItemIcon id={info.item} size={16} /> ×{have}</span>}
          {world.furnace && <span className="pill"><Sprite name="flame" size={14} /> {world.furnace.done}/{world.furnace.total}</span>}
          {readyPlots > 0 && <span className="pill green"><Sprite name="sprout" size={14} /> {readyPlots}</span>}
        </div>
      </div>
      <div className="scene-bonuses">
        {(world.chain ?? 0) > 0 && (
          <span className="pill chain num" title="Correct answers in a row">
            <Sprite name="flame" size={14} /> <b>{world.chain}</b> ×{(1 + Math.min(0.5, 0.05 * ((world.chain ?? 1) - 1))).toFixed(2)}
          </span>
        )}
        {(world.hot ?? 0) > 0 && <span className="pill hot num">Double ×{world.hot}</span>}
        {restedNow > 0 && <span className="pill rested num" title="Rested: +50% xp per right answer">Rested {restedNow}</span>}
        {isFocused(world) && <span className="pill green">Focused</span>}
      </div>
      {status && <div className="scene-status">{status}</div>}
      <div className="splat-layer">
        {pops.map((p) => (
          <div key={p.id} className={`pop ${p.tone ?? ''}`} style={{ left: `${p.x}%`, bottom: `${30 + (p.y ?? 0)}%` }}>
            {p.item && <ItemIcon id={p.item} size={20} />} {p.text}
          </div>
        ))}
      </div>
    </div>
  );
}
