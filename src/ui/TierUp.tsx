import { useMemo } from 'react';
import { TIER_NAMES } from '../core/srs';
import type { CardRow, EffectId, Tier } from '../core/types';
import { EFFECTS, TIER_POWER, tierUpChoices } from '../game/effects';
import { stripHtml } from '../import/html';
import { Sprite } from './common';

export function TierUpModal({ card, tier, onPick }: { card: CardRow; tier: Tier; onPick: (e: EffectId) => void }) {
  const choices = useMemo(() => tierUpChoices(tier, card.effect), [tier, card.effect]);
  return (
    <div className="modal-back center">
      <div className="modal stone">
        <h2 className="center">{TIER_NAMES[tier]}!</h2>
        <div className="serif center" style={{ fontSize: 15 }}>
          “{stripHtml(card.front).slice(0, 60)}” has grown stronger. Choose its new power:
        </div>
        <div className="choice-cards">
          {choices.map((id) => {
            const e = EFFECTS[id];
            return (
              <button key={id} className="choice parchment" onClick={() => onPick(id)}>
                <Sprite name={e.icon} size={36} />
                <div>
                  <div className={`cname rarity-${e.rarity}`}>{e.name} <span className="small">({e.rarity})</span></div>
                  <div className="cdesc">{e.desc(TIER_POWER[tier])}</div>
                </div>
              </button>
            );
          })}
        </div>
        <button className="btn stone small" onClick={() => onPick(card.effect)}>Keep {EFFECTS[card.effect].name}</button>
      </div>
    </div>
  );
}
