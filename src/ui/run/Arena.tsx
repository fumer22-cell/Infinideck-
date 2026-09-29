import { backgroundUrl } from '../../art/backgrounds';
import { intentFor, intentLabel, TRAIT_INFO, type Biome, type EnemyState, type Trait } from '../../game/enemies';
import { Sprite } from '../common';
import type { HeroLook } from '../../art/hero';
import { HeroView } from '../HeroView';

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

const INTENT_ICON: Record<string, string> = { attack: 'sword', multi: 'daggers', heavy: 'skull', windup: 'hourglass', block: 'shield', buff: 'up', poison: 'fang' };

export function Arena({ biome, enemy, hud, fx, enemyHurt, playerHurt, enemyDead, look, attackKey = 0, spawnKey = 0, onTrait, compact = false }: {
  /** a shorter arena while you answer the flashcard */
  compact?: boolean;
  spawnKey?: number;
  look: HeroLook;
  attackKey?: number;
  biome: Biome;
  enemy: EnemyState | null;
  hud: React.ReactNode;
  fx: Fx[];
  enemyHurt: boolean;
  playerHurt: boolean;
  enemyDead: boolean;
  onTrait?: (t: Trait) => void;
}) {
  const e = enemy;
  // a wind-up shows what's coming next
  const next = e && e.intent.kind === 'windup' ? intentFor({ ...e, patternIdx: e.patternIdx + 1 }) : null;
  return (
    <div className="arena px" style={{ backgroundImage: `url(${backgroundUrl(biome)})` }}>
      <div className="run-hud">{hud}</div>

      {e && (
        <div key={spawnKey} className={`enemy-wrap ${spawnKey ? 'spawn' : ''}`} style={{ top: compact ? '15%' : e.boss ? '13%' : '17%' }}>
          {!enemyDead && (
            <div className={`intent i-${e.intent.kind} ${e.stunned ? 'stunned' : ''}`} aria-label={`Enemy intends: ${e.stunned ? 'stunned' : intentLabel(e.intent)}`}>
              <Sprite name={e.stunned ? 'star' : INTENT_ICON[e.intent.kind]} size={16} />
              <span>{e.stunned ? 'Stunned' : intentLabel(e.intent)}</span>
              {next && !e.stunned && <span className="red">→ {next.value}</span>}
            </div>
          )}
          <Sprite name={e.sprite} size={compact ? (e.boss ? 104 : 80) : e.boss ? 140 : 104} className={`enemy-sprite ${e.boss ? 'boss' : ''} ${enemyDead ? 'dead' : enemyHurt ? 'hurt' : 'bob'}`} />
          <div className={`enemy-name ${e.boss ? 'gold' : ''}`}>{e.name}</div>
          <div className="hpbar enemy">
            <i style={{ width: `${Math.max(0, (e.hp / e.maxHp) * 100)}%` }} />
            <span>{Math.max(0, e.hp)}/{e.maxHp}</span>
          </div>
          <div className="status-row">
            {e.traits.map((t) => (
              <button key={t} className="pill trait" onClick={() => onTrait?.(t)} aria-label={`${TRAIT_INFO[t].name}: ${TRAIT_INFO[t].desc}`}>
                <Sprite name={TRAIT_INFO[t].icon} size={10} /> {TRAIT_INFO[t].name}
              </button>
            ))}
            {e.block > 0 && <span className="pill"><Sprite name="shield" size={12} />{e.block}</span>}
            {e.poison > 0 && <span className="pill st-poison"><Sprite name="skull" size={12} />{e.poison}</span>}
            {e.str > 0 && <span className="pill st-str">+{e.str} dmg</span>}
            {e.weak > 0 && <span className="pill st-weak">Weak {e.weak}</span>}
            {e.vuln > 0 && <span className="pill st-vuln">Vulnerable {e.vuln}</span>}
          </div>
        </div>
      )}

      <div className={`player-wrap ${playerHurt ? 'hurt' : ''}`}>
        <HeroView look={look} attackKey={attackKey} size={88} />
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
