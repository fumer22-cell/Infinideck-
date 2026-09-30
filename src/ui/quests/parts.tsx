import { useState } from 'react';
import { ABILITIES } from '../../game/abilities';
import { ITEMS } from '../../game/items';
import { SKILL_BY_ID } from '../../game/skills';
import { checkNumber, formatAnswer } from '../../game/quests/check';
import { MAX_MISSES } from '../../game/quests';
import type { Block, Chapter, Reward, Vars } from '../../game/quests/types';
import { statsFor } from '../../game/world';
import { ItemIcon, Sprite } from '../common';
import { useApp } from '../context';
import { AbilityCard } from '../run/AbilityCard';
import { sfx } from '../sfx';

export function StoryBlocks({ blocks, giver }: { blocks: Block[]; giver: { name: string; sprite: string } }) {
  return (
    <div className="story">
      {blocks.map((b, i) => {
        if (b.kind === 'p') return <p key={i} className="narration">{b.text}</p>;
        if (b.kind === 'eq') return <div key={i} className="eq">{b.text}</div>;
        if (b.kind === 'table')
          return (
            <table key={i} className="chem-table">
              <thead><tr>{b.head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>{b.rows.map((r, j) => <tr key={j}>{r.map((c, k) => <td key={k}>{c}</td>)}</tr>)}</tbody>
            </table>
          );
        return (
          <div key={i} className="say">
            <Sprite name={giver.sprite} size={40} className="portrait" />
            <div className="bubble parchment"><b>{b.who ?? giver.name}</b> {b.text}</div>
          </div>
        );
      })}
    </div>
  );
}

export function RewardList({ reward, compact = false }: { reward: Reward; compact?: boolean }) {
  const { world, lv, maxHp } = useApp();
  const stats = statsFor(world, lv, maxHp);
  return (
    <div className="reward-list">
      {reward.gold ? <span className="pill gold num"><Sprite name="coin" size={14} /> {reward.gold} gold</span> : null}
      {Object.entries(reward.items ?? {}).map(([id, n]) => (
        <span key={id} className="pill"><ItemIcon id={id} size={16} /> {n > 1 ? `${n}× ` : ''}{ITEMS[id].name}</span>
      ))}
      {Object.entries(reward.xp ?? {}).map(([s, n]) => (
        <span key={s} className="pill xp num"><Sprite name={SKILL_BY_ID[s as keyof typeof SKILL_BY_ID].icon} size={14} /> {n} {SKILL_BY_ID[s as keyof typeof SKILL_BY_ID].name} xp</span>
      ))}
      {reward.qp ? <span className="pill gold"><Sprite name="scroll" size={14} /> {reward.qp} quest point</span> : null}
      {compact && reward.spells?.map((s) => <span key={s} className="pill spell"><Sprite name={ABILITIES[s].icon} size={14} /> {ABILITIES[s].name} spell</span>)}
      {!compact && reward.spells?.length ? (
        <div className="spell-row">
          {reward.spells.map((s) => {
            const learned = world.spells?.find((x) => x.id === s);
            return <AbilityCard key={s} id={s} plus={learned?.plus} stats={stats} note="Spell · joins your deck" />;
          })}
        </div>
      ) : null}
    </div>
  );
}

export interface CheckResult {
  /** every part is now right */
  done: boolean;
  /** parts answered right on this check */
  newlySolved: number[];
  /** counts against the chapter (a real mistake, not a rounding slip) */
  miss: boolean;
}

const MISS_LINES = ['Mireille squints at your slate. “Not quite.”', '“Hm. Run it again.”', '“That’s not what my scales say.”'];

/**
 * The problem card: one input per part, graded on Check. Hints unlock after
 * misses (or on request), and the worked solution after three misses.
 */
export function ProblemCard({ chapter, v, solved, misses, hintsTaken, onResult, onHint, onGiveUp, giver }: {
  chapter: Chapter;
  v: Vars;
  solved: number[];
  misses: number;
  hintsTaken: number;
  onResult: (r: CheckResult) => Promise<void>;
  onHint: () => void;
  onGiveUp: () => void;
  giver: string;
}) {
  const [inputs, setInputs] = useState<Record<number, string>>({});
  const [choice, setChoice] = useState<Record<number, number>>({});
  const [feedback, setFeedback] = useState<{ tone: 'ok' | 'bad' | 'warn'; msg: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const hints = chapter.hints(v);
  const shown = Math.min(hints.length, misses + hintsTaken);
  const stuck = misses >= MAX_MISSES;

  const check = async () => {
    if (busy) return;
    const newly: number[] = [];
    let miss = false;
    let msg: { tone: 'ok' | 'bad' | 'warn'; msg: string } | null = null;
    chapter.parts.forEach((part, i) => {
      if (solved.includes(i)) return;
      if (part.kind === 'choice') {
        if (choice[i] == null) {
          msg ??= { tone: 'warn', msg: 'Pick an answer first.' };
          return;
        }
        if (choice[i] === part.answer(v)) newly.push(i);
        else {
          miss = true;
          msg = { tone: 'bad', msg: `${giver}: “${part.wrongMsg ?? 'Not that one.'}”` };
        }
        return;
      }
      const raw = inputs[i] ?? '';
      if (!raw.trim()) {
        msg ??= { tone: 'warn', msg: 'Fill in every answer first.' };
        return;
      }
      const verdict = checkNumber(raw, part, v);
      if (verdict.kind === 'ok') newly.push(i);
      else if (verdict.kind === 'rounding' || verdict.kind === 'invalid') msg ??= { tone: 'warn', msg: verdict.msg };
      else {
        miss = true;
        if (verdict.kind === 'trap' || verdict.kind === 'close') msg = { tone: 'bad', msg: `${giver}: “${verdict.msg}”` };
      }
    });
    const done = chapter.parts.every((_, i) => solved.includes(i) || newly.includes(i));
    if (miss && !msg) msg = { tone: 'bad', msg: MISS_LINES[misses % MISS_LINES.length] };
    if (miss) {
      sfx.miss();
      if (misses + 1 < MAX_MISSES && shown < hints.length) msg = { ...msg!, msg: `${msg!.msg} A hint has appeared.` };
    } else if (newly.length && !done) sfx.flip();
    setFeedback(done ? null : msg ?? (newly.length ? { tone: 'ok', msg: 'That part is right. Keep going.' } : null));
    if (!newly.length && !miss) return;
    setBusy(true);
    try {
      await onResult({ done, newlySolved: newly, miss });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="problem parchment col">
      <div className="problem-title"><Sprite name="scroll" size={16} /> Problem</div>
      {chapter.parts.map((part, i) => {
        const ok = solved.includes(i);
        return (
          <div key={i} className={`part ${ok ? 'ok' : ''}`}>
            <label className="part-label" htmlFor={`part-${i}`}>{part.label(v)}</label>
            {part.kind === 'number' ? (
              <div className="answer-row">
                <input
                  id={`part-${i}`}
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={ok ? '' : 'Your answer'}
                  value={ok && !inputs[i] ? formatAnswer(part.answer(v), part.round) : inputs[i] ?? ''}
                  disabled={ok || stuck}
                  onChange={(e) => setInputs((s) => ({ ...s, [i]: e.target.value }))}
                  onKeyDown={(e) => e.key === 'Enter' && check()}
                />
                <span className="unit">{part.unit}</span>
                {ok && <span className="tick">✓</span>}
              </div>
            ) : (
              <div className="choice-row">
                {part.options.map((o, j) => (
                  <button key={o} type="button" className={`btn small ${(ok ? part.answer(v) === j : choice[i] === j) ? 'green' : 'stone'}`} disabled={ok || stuck} onClick={() => setChoice((s) => ({ ...s, [i]: j }))}>{o}</button>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {feedback && <div className={`feedback ${feedback.tone}`} role="status">{feedback.msg}</div>}
      {shown > 0 && (
        <ol className="hints">
          {hints.slice(0, shown).map((h) => <li key={h}>{h}</li>)}
        </ol>
      )}
      {stuck ? (
        <div className="solution col">
          <b>Worked solution</b>
          {chapter.solution(v).map((l) => <div key={l} className="sol-line">{l}</div>)}
          <button className="btn block primary" onClick={onGiveUp}>Carry on (no star this chapter)</button>
        </div>
      ) : (
        <div className="grid2">
          <button className="btn stone" disabled={shown >= hints.length || busy} onClick={onHint}>{shown < hints.length ? `Hint · ${hints.length - shown}` : 'No hints left'}</button>
          <button className="btn primary" disabled={busy} onClick={check}>Check</button>
        </div>
      )}
      <div className="small muted center">
        {stuck ? 'Read it through, then carry on.' : `${misses}/${MAX_MISSES} misses. You’re shown the worked solution after ${MAX_MISSES}. A hint or a miss costs the chapter’s star.`}
      </div>
    </div>
  );
}

/** Just the blocks that carry the numbers, for a practice run. */
export const numberBlocks = (blocks: Block[]) => blocks.filter((b) => b.kind !== 'p' && (b.kind !== 'say' || /\d/.test(b.text)));

