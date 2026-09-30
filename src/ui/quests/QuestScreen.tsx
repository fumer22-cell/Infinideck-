import { useEffect, useMemo, useState } from 'react';
import { echoReward, finishChapter, finishEcho, markPart, progressOf, QUEST_BY_ID, readOutcome, recordMiss, takeHint } from '../../game/quests';
import type { Quest } from '../../game/quests/types';
import { pushLog } from '../../game/world';
import { Sprite, TopBar } from '../common';
import { useApp } from '../context';
import { sfx } from '../sfx';
import { numberBlocks, ProblemCard, RewardList, StoryBlocks, type CheckResult } from './parts';

function scrollTop() {
  document.querySelector('.main > .screen')?.scrollTo({ top: 0 });
  document.querySelector('.main')?.scrollTo({ top: 0 });
}

function Pips({ quest, step, stars, view, onView }: { quest: Quest; step: number; stars: boolean[]; view: number | null; onView: (i: number | null) => void }) {
  return (
    <div className="pips" role="tablist" aria-label="Chapters">
      {quest.chapters.map((c, i) => {
        const done = i < step;
        return (
          <button
            key={c.id}
            role="tab"
            aria-selected={view === i || (view == null && i === step)}
            aria-label={`Chapter ${i + 1}: ${c.title}${done ? (stars[i] ? ', flawless' : ', done') : ''}`}
            className={`pip ${done ? 'done' : ''} ${i === step ? 'current' : ''} ${view === i ? 'viewing' : ''}`}
            disabled={i > step}
            onClick={() => onView(done ? (view === i ? null : i) : null)}
          >
            {done ? (stars[i] ? '★' : '✓') : i + 1}
          </button>
        );
      })}
    </div>
  );
}

export function QuestScreen({ id, echo = false }: { id: string; echo?: boolean }) {
  const quest = QUEST_BY_ID[id];
  return echo ? <EchoRun quest={quest} /> : <QuestRun quest={quest} />;
}

function QuestRun({ quest }: { quest: Quest }) {
  const app = useApp();
  const { world } = app;
  const p = progressOf(world, quest.id);
  const [view, setView] = useState<number | null>(null);
  const giver = quest.giver;
  // each new page of the story starts at the top
  useEffect(() => scrollTop(), [p.step, p.outcome, view, !!p.done]);

  const onResult = async (r: CheckResult) => {
    const pay = await app.updateWorld((w) => {
      for (const i of r.newlySolved) markPart(w, quest.id, i);
      if (r.miss) recordMiss(w, quest.id);
      if (!r.done) return null;
      const title = quest.chapters[progressOf(w, quest.id).step].title;
      const out = finishChapter(w, quest);
      pushLog(w, out.completed ? `Quest complete: ${quest.title}!` : `Quest chapter complete: ${title}.`, 'gold');
      return out;
    });
    if (pay) await payOut(pay);
  };
  const payOut = async (pay: NonNullable<Awaited<ReturnType<typeof finishChapter>>>) => {
    if (pay.gold) await app.updateProfile((pr) => void (pr.gold += pay.gold));
    await app.gainXp(pay.xp);
    sfx.victory();
    if (pay.completed) app.toast(pay.flawless ? 'Quest complete, flawless!' : 'Quest complete!');
  };
  const giveUp = async () => {
    const pay = await app.updateWorld((w) => finishChapter(w, quest));
    await payOut(pay);
  };

  // re-reading a finished chapter
  if (view != null) {
    const ch = quest.chapters[view];
    return (
      <>
        <TopBar title={quest.title} />
        <div className="screen quest">
          <Pips quest={quest} step={p.step} stars={p.stars} view={view} onView={setView} />
          <h2 className="chapter-title">Chapter {view + 1} · {ch.title}</h2>
          <StoryBlocks blocks={ch.story(ch.vars)} giver={giver} />
          <div className="solution parchment col">
            <b>How it was solved</b>
            {ch.solution(ch.vars).map((l) => <div key={l} className="sol-line">{l}</div>)}
          </div>
          <StoryBlocks blocks={ch.outcome} giver={giver} />
          <button className="btn block stone" onClick={() => setView(null)}>Back</button>
        </div>
      </>
    );
  }

  // the outcome of a chapter you just solved
  if (p.outcome != null) {
    const idx = p.outcome;
    const ch = quest.chapters[idx];
    const finished = idx === quest.chapters.length - 1 && !!p.done;
    return (
      <>
        <TopBar title={quest.title} />
        <div className="screen quest">
          <Pips quest={quest} step={p.step} stars={p.stars} view={null} onView={setView} />
          <div className={`solved-banner ${p.stars[idx] ? 'star' : ''}`}>{p.stars[idx] ? '★ Solved flawlessly' : '✓ Solved'}</div>
          <h2 className="chapter-title">Chapter {idx + 1} · {ch.title}</h2>
          <StoryBlocks blocks={ch.outcome} giver={giver} />
          <div className="stone col">
            <h3>Reward</h3>
            <RewardList reward={ch.reward} />
          </div>
          <button className="btn big block primary" onClick={() => app.updateWorld((w) => readOutcome(w, quest.id))}>
            {finished ? 'Finish the quest' : `Chapter ${idx + 2}`}
          </button>
        </div>
      </>
    );
  }

  if (p.done) return <Completion quest={quest} onView={setView} />;

  const ch = quest.chapters[p.step];
  return (
    <>
      <TopBar title={quest.title} />
      <div className="screen quest">
        <Pips quest={quest} step={p.step} stars={p.stars} view={null} onView={setView} />
        <h2 className="chapter-title">Chapter {p.step + 1} · {ch.title}</h2>
        <StoryBlocks blocks={ch.story(ch.vars)} giver={giver} />
        <ProblemCard
          key={ch.id}
          chapter={ch}
          v={ch.vars}
          solved={p.solved}
          misses={p.wrong}
          hintsTaken={p.hints}
          giver={giver.name}
          onResult={onResult}
          onHint={() => void app.updateWorld((w) => takeHint(w, quest.id))}
          onGiveUp={giveUp}
        />
        <div className="stone col">
          <h3>For solving it</h3>
          <RewardList reward={ch.reward} />
        </div>
      </div>
    </>
  );
}

function Completion({ quest, onView }: { quest: Quest; onView: (i: number) => void }) {
  const app = useApp();
  const p = progressOf(app.world, quest.id);
  const flawless = quest.chapters.every((_, i) => p.stars[i]);
  const allSpells = quest.chapters.flatMap((c) => c.reward.spells ?? []);
  return (
    <>
      <TopBar title={quest.title} />
      <div className="screen quest">
        <Pips quest={quest} step={p.step} stars={p.stars} view={null} onView={(i) => i != null && onView(i)} />
        <div className="stone gilded col center quest-complete">
          <Sprite name={quest.giver.sprite} size={72} className="bob" />
          <h1>Quest complete</h1>
          <div className="stars num" aria-label={`${p.stars.filter(Boolean).length} of ${quest.chapters.length} chapters flawless`}>
            {quest.chapters.map((_, i) => <span key={i} className={p.stars[i] ? 'on' : ''}>★</span>)}
          </div>
          {flawless ? <div className="desc gold">{quest.flawless.text}</div> : <div className="desc">Not flawless this time. A perfect run would have earned: {quest.flawless.text.replace(/^Flawless: [^.]*\. /, '')}</div>}
        </div>
        <StoryBlocks blocks={quest.epilogue} giver={quest.giver} />
        <div className="stone col">
          <h3>Quest reward</h3>
          <RewardList reward={{ ...quest.reward, spells: allSpells }} />
        </div>
        <div className="stone col">
          <h3>Practise with new numbers</h3>
          <div className="desc small">Run every chapter again with fresh numbers. It’s the same reasoning with different sums. Pays {echoReward(true).gold} gold and {echoReward(true).xp?.scholarship} Scholarship xp per chapter solved on the first try.{p.echoes ? ` You’ve done ${p.echoes}.` : ''}</div>
          <button className="btn block primary" onClick={() => app.go({ name: 'quest', id: quest.id, echo: true })}>Start a practice run</button>
        </div>
        <div className="small muted center">Tap a chapter above to re-read it.</div>
      </div>
    </>
  );
}

/** A practice run: every chapter with fresh numbers. Nothing here changes the quest's record except its practice count. */
function EchoRun({ quest }: { quest: Quest }) {
  const app = useApp();
  const vars = useMemo(() => quest.chapters.map((c) => c.echo(Math.random)), [quest.id]);
  const [idx, setIdx] = useState(0);
  const [solved, setSolved] = useState<number[]>([]);
  const [misses, setMisses] = useState(0);
  const [hints, setHints] = useState(0);
  const [result, setResult] = useState<'first' | 'solved' | 'shown' | null>(null);
  const [firsts, setFirsts] = useState(0);
  const done = idx >= quest.chapters.length;
  useEffect(() => scrollTop(), [idx]);

  const onResult = async (r: CheckResult) => {
    setSolved((s) => [...s, ...r.newlySolved]);
    if (r.miss) setMisses((m) => m + 1);
    if (!r.done) return;
    const first = misses === 0 && hints === 0 && !r.miss;
    const rw = echoReward(first);
    if (rw.gold) await app.updateProfile((pr) => void (pr.gold += rw.gold!));
    await app.gainXp(rw.xp ?? {});
    if (first) setFirsts((n) => n + 1);
    sfx.victory();
    setResult(first ? 'first' : 'solved');
  };
  const next = async () => {
    setIdx((i) => i + 1);
    setSolved([]);
    setMisses(0);
    setHints(0);
    setResult(null);
    if (idx + 1 >= quest.chapters.length) await app.updateWorld((w) => finishEcho(w, quest.id));
  };

  if (done)
    return (
      <>
        <TopBar title="Practice run" />
        <div className="screen quest">
          <div className="stone gilded col center quest-complete">
            <Sprite name={quest.giver.sprite} size={64} className="bob" />
            <h1>Run complete</h1>
            <div className="serif">{firsts} of {quest.chapters.length} on the first try.</div>
          </div>
          <button className="btn big block primary" onClick={() => app.back()}>Back to the quest</button>
        </div>
      </>
    );

  const ch = quest.chapters[idx];
  const v = vars[idx];
  return (
    <>
      <TopBar title={`Practice · ${idx + 1}/${quest.chapters.length}`} />
      <div className="screen quest">
        <h2 className="chapter-title">{ch.title}</h2>
        <div className="small muted">Same problem, new numbers.</div>
        <StoryBlocks blocks={numberBlocks(ch.story(v))} giver={quest.giver} />
        {result ? (
          <div className="col" style={{ gap: 10 }}>
            <div className={`solved-banner ${result === 'first' ? 'star' : ''}`}>{result === 'first' ? '★ First try' : result === 'shown' ? 'Solution shown' : '✓ Solved'}</div>
            {result !== 'shown' && <RewardList reward={echoReward(result === 'first')} />}
            <button className="btn big block primary" onClick={next}>{idx + 1 < quest.chapters.length ? 'Next problem' : 'Finish'}</button>
          </div>
        ) : (
          <ProblemCard
            key={`${ch.id}-${idx}`}
            chapter={ch}
            v={v}
            solved={solved}
            misses={misses}
            hintsTaken={hints}
            giver={quest.giver.name}
            onResult={onResult}
            onHint={() => setHints((h) => h + 1)}
            onGiveUp={() => setResult('shown')}
          />
        )}
      </div>
    </>
  );
}
