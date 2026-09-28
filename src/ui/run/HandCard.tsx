import { isLeech, TIER_NAMES, tierOf } from '../../core/srs';
import type { CardRow } from '../../core/types';
import { effectivePower } from '../../game/combat';
import { EFFECTS } from '../../game/effects';
import type { RelicId } from '../../game/relics';
import { State } from '../../core/srs';
import { Sprite } from '../common';

export function HandCard({ card, relics, boss, disabled, onPlay }: { card: CardRow; relics: RelicId[]; boss: boolean; disabled: boolean; onPlay: () => void }) {
  const tier = tierOf(card);
  const e = EFFECTS[card.effect];
  const p = effectivePower(tier, card.state === State.New, relics);
  const label = card.state === State.New ? 'NEW' : TIER_NAMES[tier].toUpperCase();
  return (
    <button className={`hand-card parchment t${tier}`} disabled={disabled} onClick={onPlay} aria-label={`${e.name} card`}>
      <span className="pow">{p}</span>
      <span className="tier">{label}</span>
      <Sprite name={e.icon} size={36} />
      <span className={`ename rarity-${e.rarity}`}>{e.name}</span>
      <span className="edesc">{e.desc(p)}</span>
      {boss && isLeech(card) && <span className="leech-tag">LEECH</span>}
      {!(boss && isLeech(card)) && tierOf(card) > card.tierSeen && <span className="ascend">ASCEND ↑</span>}
    </button>
  );
}
