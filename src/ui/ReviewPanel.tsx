import { useEffect, useMemo, useRef, useState } from 'react';
import { formatInterval, previewIntervals } from '../core/srs';
import type { CardRow } from '../core/types';
import { GRADE_LABEL } from '../game/effects';
import { CardFace } from './common';
import { useApp } from './context';
import { sfx } from './sfx';

export const FAST_MS = 6000;

/** Front → reveal → Again/Hard/Good/Easy. Reports how long the reveal took. */
export function ReviewPanel({ card, onGrade, showIntervals = true, busy = false }: { card: CardRow; onGrade: (g: 1 | 2 | 3 | 4, revealMs: number) => void; showIntervals?: boolean; busy?: boolean }) {
  const { settings } = useApp();
  const [revealed, setRevealed] = useState(false);
  const shownAt = useRef(Date.now());
  const revealMs = useRef(0);
  useEffect(() => {
    setRevealed(false);
    shownAt.current = Date.now();
  }, [card.id]);
  const ivls = useMemo(() => (showIntervals ? previewIntervals(card, Date.now(), settings.retention) : null), [card, showIntervals, settings.retention]);

  const reveal = () => {
    revealMs.current = Date.now() - shownAt.current;
    sfx.flip();
    setRevealed(true);
  };

  return (
    <div className="col review-panel">
      <div onClick={() => !revealed && reveal()}>
        <CardFace front={card.front} back={card.back} image={card.image} revealed={revealed} />
      </div>
      <div className="review-actions">
      {!revealed ? (
        <button className="btn big block" onClick={reveal}>Show answer</button>
      ) : (
        <div className="grades">
          {([1, 2, 3, 4] as const).map((g) => (
            <button key={g} disabled={busy} className={`btn grade ${GRADE_LABEL[g].toLowerCase()}`} onClick={() => onGrade(g, revealMs.current)}>
              {GRADE_LABEL[g]}
              {ivls && <span className="ivl">{formatInterval(ivls[g])}</span>}
            </button>
          ))}
        </div>
      )}
      </div>
    </div>
  );
}
