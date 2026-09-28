import { useEffect, useMemo, useRef, useState } from 'react';
import { checkAnswer, type AnswerCheck } from '../core/answer';
import { db } from '../core/db';
import { formatInterval, previewIntervals } from '../core/srs';
import type { CardRow } from '../core/types';
import { GRADE_LABEL } from '../game/effects';
import { CardFace } from './common';
import { useApp } from './context';
import { sfx } from './sfx';

export const FAST_MS = 6000;

/** Remember which decks use typed answers, so each card doesn't hit the database. */
const typedDecks = new Map<number, boolean>();
export function forgetTypedDeck(deckId: number) {
  typedDecks.delete(deckId);
}

/**
 * Front → reveal → Again/Hard/Good/Easy. In decks with "type your answer" on, you type
 * first and the app checks it; a correct typed answer is "verified" and earns extra.
 */
export function ReviewPanel({ card, onGrade, showIntervals = true, busy = false }: { card: CardRow; onGrade: (g: 1 | 2 | 3 | 4, revealMs: number, verified: boolean) => void; showIntervals?: boolean; busy?: boolean }) {
  const { settings } = useApp();
  const [revealed, setRevealed] = useState(false);
  const [typed, setTyped] = useState('');
  const [check, setCheck] = useState<AnswerCheck | null>(null);
  const [typeMode, setTypeMode] = useState(typedDecks.get(card.deckId) ?? false);
  const shownAt = useRef(Date.now());
  const revealMs = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setRevealed(false);
    setTyped('');
    setCheck(null);
    shownAt.current = Date.now();
    if (!typedDecks.has(card.deckId)) {
      void db.decks.get(card.deckId).then((d) => {
        typedDecks.set(card.deckId, !!d?.typeAnswers);
        setTypeMode(!!d?.typeAnswers);
      });
    } else setTypeMode(typedDecks.get(card.deckId)!);
  }, [card.id]);
  useEffect(() => {
    if (typeMode && !revealed) inputRef.current?.focus();
  }, [typeMode, card.id, revealed]);

  const ivls = useMemo(() => (showIntervals ? previewIntervals(card, Date.now(), settings.retention) : null), [card, showIntervals, settings.retention]);

  const reveal = () => {
    revealMs.current = Date.now() - shownAt.current;
    sfx.flip();
    setRevealed(true);
  };
  const submitTyped = () => {
    const c = checkAnswer(typed, card.back);
    setCheck(c);
    if (c.correct) sfx.coin();
    else sfx.miss();
    reveal();
  };
  // with a checked answer, suggest the grade it implies
  const suggested = check ? (check.correct ? 3 : 1) : null;

  return (
    <div className="col review-panel">
      <div onClick={() => !revealed && !typeMode && reveal()}>
        <CardFace front={card.front} back={card.back} image={card.image} revealed={revealed} />
      </div>
      {check && (
        <div className={`verdict ${check.correct ? 'ok' : 'bad'}`} role="status">
          {check.correct ? (check.close ? '✓ Close enough (small typo): verified' : '✓ Correct: verified') : `✗ You typed “${typed.trim() || '…'}”`}
        </div>
      )}
      <div className="review-actions">
        {!revealed ? (
          typeMode ? (
            <form
              className="col"
              onSubmit={(e) => {
                e.preventDefault();
                submitTyped();
              }}
            >
              <input ref={inputRef} id="typed-answer" type="text" autoComplete="off" autoCapitalize="off" spellCheck={false} placeholder="Type your answer…" value={typed} onChange={(e) => setTyped(e.target.value)} aria-label="Your answer" />
              <div className="grid2">
                <button type="button" className="btn stone" onClick={reveal}>Just show it</button>
                <button type="submit" className="btn primary">Check</button>
              </div>
            </form>
          ) : (
            <button className="btn big block" onClick={reveal}>Show answer</button>
          )
        ) : (
          <div className="grades">
            {([1, 2, 3, 4] as const).map((g) => (
              <button
                key={g}
                disabled={busy}
                className={`btn grade ${GRADE_LABEL[g].toLowerCase()} ${suggested === g ? 'suggested' : ''}`}
                onClick={() => onGrade(g, revealMs.current, !!check?.correct && g > 1)}
              >
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
