import { backgroundUrl } from '../../art/backgrounds';
import { ADVENTURER } from '../../game/classes';
import { comboMultiplier } from '../../game/combat';
import type { Biome, EnemyState } from '../../game/enemies';
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

export function Arena({ biome, enemy, combo, relics, hud, fx, enemyHurt, playerHurt, enemyDead, player, playerSprite, spawnKey = 0 }: {
  spawnKey?: number;
  biome: Biome;
  enemy: EnemyState | null;
  combo: number;
  relics: RelicId[];
  hud: React.ReactNode;
  fx: Fx[];
  enemyHurt: boolean;
  playerHurt: boolean;
  enemyDead: boolean;
  player: { hp: number; maxHp: number; block: number };
  playerSprite: string;
}) {
  const e = enemy;
  const p = player;
  const mult = comboMultiplier(combo, ADVENTURER);
  return (
    <div className="arena px" style={{ backgroundImage: `url(${backgroundUrl(biome)})` }}>
      <div className="run-hud">
        {hud}
        <div className="relic-strip grow">
          {relics.map((r) => (
            <Sprite key={r} name={RELICS[r].icon} size={20} title={`${RELICS[r].name}: ${RELICS[r].desc}`} />
          ))}
        </div>
      </div>

      {e && (
        <div key={spawnKey} className={`enemy-wrap ${spawnKey ? 'spawn' : ''}`} style={{ top: e.boss ? '14%' : '19%' }}>
          {!enemyDead && (
            <div className="intent" aria-label="Enemy intent">
              {e.intent.kind === 'attack' && (<><Sprite name="sword" size={18} /> <span className="red">{e.intent.value}</span></>)}
              {e.intent.kind === 'block' && (<><Sprite name="shield" size={18} /> <span>{e.intent.value}</span></>)}
              {e.intent.kind === 'buff' && (<><Sprite name="up" size={18} /> <span className="gold">Empower</span></>)}
            </div>
          )}
          <Sprite name={e.sprite} size={e.boss ? 150 : 112} className={`enemy-sprite ${e.boss ? 'boss' : ''} ${enemyDead ? 'dead' : enemyHurt ? 'hurt' : 'bob'}`} />
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
        <Sprite name={playerSprite} size={64} />
        <div className="player-stats">
          <div className="hpbar">
            <i style={{ width: `${Math.max(0, (p.hp / p.maxHp) * 100)}%` }} />
            <span>{Math.max(0, p.hp)}/{p.maxHp}</span>
          </div>
          {p.block > 0 && <span className="pill" style={{ alignSelf: 'flex-start' }}><Sprite name="shield" size={12} />{p.block}</span>}
        </div>
      </div>

      <div className="combo">
        Combo
        <b>x{mult.toFixed(1)}</b>
        <div className="meter"><i style={{ width: `${((mult - 1) / (ADVENTURER.comboCap - 1)) * 100}%` }} /></div>
      </div>

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
