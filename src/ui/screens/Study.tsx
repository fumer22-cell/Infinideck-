import { useEffect, useState } from 'react';
import { formatInterval, getDueQueue, nextLearningDue, reviewCard, TIER_NAMES } from '../../core/srs';
import type { CardRow, EffectId, Tier } from '../../core/types';
import { checkQueueCleared, rewardReview, setCardEffect } from '../actions';
import { TopBar } from '../common';
import { useApp } from '../context';
import { ReviewPanel } from '../ReviewPanel';
import { TierUpModal } from '../TierUp';

/** Plain, no-frills study mode: exactly Anki's review loop. */
export function Study({ deckId }: { deckId?: number }) {
  const app = useApp();
  const { settings } = app;
  const [queue, setQueue] = useState<CardRow[] | null>(null);
  const [nextLearn, setNextLearn] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [tierUp, setTierUp] = useState<{ card: CardRow; tier: Tier } | null>(null);
  const [done, setDone] = useState(0);

  const load = async () => {
    const now = Date.now();
    const q = await getDueQueue({ now, deckIds: deckId != null ? [deckId] : undefined, ...settings });
    setQueue(q);
    if (!q.length) {
      setNextLearn(await nextLearningDue(now, deckId != null ? [deckId] : undefined));
      await checkQueueCleared(app);
    }
  };
  useEffect(() => {
    void load();
  }, [deckId]);

  // re-check while waiting on learning cards
  useEffect(() => {
    if (!nextLearn || queue?.length) return;
    const t = setTimeout(() => void load(), Math.max(1000, nextLearn - Date.now() + 500));
    return () => clearTimeout(t);
  }, [nextLearn, queue]);

  const grade = async (g: 1 | 2 | 3 | 4) => {
    const card = queue![0];
    setBusy(true);
    try {
      const out = await reviewCard(card.id!, g, Date.now(), { dayStartHour: settings.dayStartHour, retention: settings.retention });
      setDone((d) => d + 1);
      await rewardReview(app, g, out.tierAfter);
      if (out.tierAfter > card.tierSeen) setTierUp({ card: out.after, tier: out.tierAfter });
      await load();
    } finally {
      setBusy(false);
    }
  };

  const pickEffect = async (e: EffectId) => {
    if (!tierUp) return;
    await setCardEffect(tierUp.card.id!, e, tierUp.tier);
    app.toast(`${TIER_NAMES[tierUp.tier]} card empowered.`);
    setTierUp(null);
  };

  const card = queue?.[0];
  return (
    <>
      <TopBar title="Study" right={<span className="small muted">{queue ? `${queue.length} left` : ''}</span>} />
      <div className="screen">
        {queue && !card && (
          <div className="stone col center">
            <h2>All done for now</h2>
            <div className="serif" style={{ fontSize: 16 }}>You reviewed {done} card{done === 1 ? '' : 's'} this session.</div>
            {nextLearn && <div className="small muted">Learning cards return in {formatInterval(nextLearn - Date.now())}.</div>}
            <button className="btn block" onClick={app.back}>Return</button>
          </div>
        )}
        {card && <ReviewPanel card={card} onGrade={grade} busy={busy} />}
      </div>
      {tierUp && <TierUpModal card={tierUp.card} tier={tierUp.tier} onPick={pickEffect} />}
    </>
  );
}
