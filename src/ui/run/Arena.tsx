import { backgroundUrl } from '../../art/backgrounds';
import type { CombatState } from '../../game/combat';
import { comboMultiplier } from '../../game/combat';
import { CLASSES, type ClassId } from '../../game/classes';
import type { Biome } from '../../game/enemies';
import { RELICS, type RelicId } from '../../game/relics';
import { Sprite } from '../common';

export interface Fx {
  id: number;
  kind: 'splat' | 'xp';
  target: 'enemy' | 'player';
  text: string;
  cls?: string;
  icon?: string;
  x: number;
  y: number;
  delay: number;
}

export function Arena({ biome, combat, cls, relics, gold, fight, mode, fx, enemyHurt, playerHurt, enemyDead, onMenu, playerHp }: {
  biome: Biome;
  combat: CombatState | null;
  cls: ClassId;
  relics: RelicId[];
  gold: number;
  fight: number;
  mode: 'dungeon' | 'endless';
  fx: Fx[];
  enemyHurt: boolean;
  playerHurt: boolean;
  enemyDead: boolean;
  onMenu: () => void;
  playerHp: { hp: number; maxHp: number; block: number };
}) {
  const e = combat?.enemy;
  const p = combat?.player ?? playerHp;
  const c = CLASSES[cls];
  const combo = combat?.combo ?? 0;
  const mult = comboMultiplier(combo, c);
  return (
    <div className="arena px" style={{ backgroundImage: `url(${backgroundUrl(biome)})` }}>
      <div className="run-hud">
        <button className="back-btn" style={{ minWidth: 40, minHeight: 40, fontSize: 14 }} onClick={onMenu} aria-label="Menu">☰</button>
        <span className="pill">{mode === 'endless' ? 'Depth' : 'Fight'} {fight}</span>
        <span className="pill"><Sprite name="coin" size={14} />{gold}</span>
        <div className="relic-strip grow">
          {relics.map((r) => (
            <Sprite key={r} name={RELICS[r].icon} size={20} title={`${RELICS[r].name}: ${RELICS[r].desc}`} />
          ))}
        </div>
      </div>

      {e && (
        <div className="enemy-wrap" style={{ top: e.boss ? '14%' : '19%' }}>
          {!enemyDead && (
            <div className="intent" aria-label="Enemy intent">
              {e.intent.kind === 'attack' && (<><Sprite name="sword" size={18} /> <span className="red">{e.intent.value}</span></>)}
              {e.intent.kind === 'block' && (<><Sprite name="shield" size={18} /> <span>{e.intent.value}</span></>)}
              {e.intent.kind === 'buff' && (<><Sprite name="up" size={18} /> <span className="gold">Empower</span></>)}
            </div>
          )}
          <Sprite name={e.sprite} size={e.boss ? 168 : 128} className={`enemy-sprite ${e.boss ? 'boss' : ''} ${enemyDead ? 'dead' : enemyHurt ? 'hurt' : 'bob'}`} />
          <div className={`enemy-name ${e.boss ? 'gold' : ''}`}>{e.name}</div>
          <div className="hpbar enemy">
            <i style={{ width: `${Math.max(0, (e.hp / e.maxHp) * 100)}%` }} />
            <span>{Math.max(0, e.hp)}/{e.maxHp}</span>
          </div>
          <div className="status-row">
            {e.block > 0 && <span className="pill"><Sprite name="shield" size={12} />{e.block}</span>}
            {e.poison > 0 && <span className="pill" style={{ color: '#c090ff' }}><Sprite name="skull" size={12} />{e.poison}</span>}
          </div>
        </div>
      )}

      <div className={`player-wrap ${playerHurt ? 'hurt' : ''}`}>
        <Sprite name={cls} size={64} />
        <div className="player-stats">
          <span>{c.name}</span>
          <div className="hpbar">
            <i style={{ width: `${Math.max(0, (p.hp / p.maxHp) * 100)}%` }} />
            <span>{Math.max(0, p.hp)}/{p.maxHp}</span>
          </div>
          {p.block > 0 && <span className="pill" style={{ alignSelf: 'flex-start' }}><Sprite name="shield" size={12} />{p.block}</span>}
        </div>
      </div>

      {combat && (
        <div className="combo">
          Combo
          <b>x{mult.toFixed(1)}</b>
          <div className="meter"><i style={{ width: `${((mult - 1) / (c.comboCap - 1)) * 100}%` }} /></div>
        </div>
      )}

      <div className="splat-layer">
        {fx.map((f) =>
          f.kind === 'splat' ? (
            <div key={f.id} className={`splat ${f.cls ?? ''}`} style={{ left: `${f.x}%`, top: `${f.y}%`, animationDelay: `${f.delay}ms`, opacity: 0, animationFillMode: 'forwards' }}>
              {f.text}
            </div>
          ) : (
            <div key={f.id} className="xpdrop" style={{ top: `${f.y}%`, animationDelay: `${f.delay}ms`, opacity: 0 }}>
              {f.icon && <Sprite name={f.icon} size={16} />} {f.text}
            </div>
          ),
        )}
      </div>
    </div>
  );
}
