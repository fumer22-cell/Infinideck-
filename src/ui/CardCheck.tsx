import { useEffect, useState } from 'react';
import type { CardRow, EffectId, Tier } from '../core/types';
import { TIER_NAMES } from '../core/srs';
import { checkQueueCleared, setCardEffect } from './actions';
import { useApp } from './context';
import { ReviewPanel } from './ReviewPanel';
import { dueQueue, pickRandom, practicePool, recordGrade } from './study';
import { TierUpModal } from './TierUp';

/**
 * A skill check: answer one card to start a real-time task (light the furnace,
 * plant a seed). Uses the next due card if there is one, otherwise a practice
 * card. The card's maturity is passed back as the task's bonus.
 */
export function CardCheck({ title, onDone, onCancel }: { title: string; onDone: (tier: Tier) => void; onCancel: () => void }) {
  const app = useApp();
  const [card, setCard] = useState<CardRow | null>(null);
  const [practice, setPractice] = useState(false);
  const [empty, setEmpty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tierUp, setTierUp] = useState<{ card: CardRow; tier: Tier; result: Tier } | null>(null);

  useEffect(() => {
    void (async () => {
      const q = await dueQueue(app);
      if (q.length) return setCard(q[0]);
      const pool = await practicePool();
      const pick = pickRandom(pool);
      if (pick) {
        setPractice(true);
        setCard(pick);
      } else setEmpty(true);
    })();
  }, []);

  const grade = async (g: 1 | 2 | 3 | 4) => {
    if (!card || busy) return;
    setBusy(true);
    const rec = await recordGrade(app, card, g, practice);
    if (rec.scholarship) await app.gainXp({ scholarship: rec.scholarship });
    if (!practice) await checkQueueCleared(app);
    if (rec.tierUp) setTierUp({ ...rec.tierUp, result: rec.tier });
    else onDone(rec.tier);
  };

  const pickEffect = async (e: EffectId) => {
    if (!tierUp) return;
    await setCardEffect(tierUp.card.id!, e, tierUp.tier);
    app.toast(`${TIER_NAMES[tierUp.tier]} card empowered.`);
    onDone(tierUp.result);
  };

  return (
    <div className="modal-back">
      <div className="modal">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="pill">Card check · {title}</span>
          {!busy && <button className="btn small stone" onClick={onCancel}>Cancel</button>}
        </div>
        {practice && <div className="small muted center">Nothing is due, so this is a practice card. It won’t change your schedule.</div>}
        {card && <ReviewPanel card={card} onGrade={grade} busy={busy} showIntervals={!practice} />}
        {empty && (
          <div className="stone col center">
            <div className="serif" style={{ fontSize: 16 }}>No cards to check with yet, so this one’s free.</div>
            <button className="btn block" onClick={() => onDone(0)}>Continue</button>
          </div>
        )}
      </div>
      {tierUp && <TierUpModal card={tierUp.card} tier={tierUp.tier} onPick={pickEffect} />}
    </div>
  );
}
