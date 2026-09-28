import { useEffect, useRef, useState } from 'react';
import { formatInterval, nextLearningDue, TIER_NAMES } from '../../core/srs';
import type { CardRow, EffectId, Tier } from '../../core/types';
import { ITEMS } from '../../game/items';
import { checkActive, performAction, pushLog } from '../../game/world';
import { checkQueueCleared, setCardEffect } from '../actions';
import { Sprite } from '../common';
import { useApp } from '../context';
import { ReviewPanel } from '../ReviewPanel';
import { sfx } from '../sfx';
import { dueQueue, pickRandom, practicePool, recordGrade, scaleXp } from '../study';
import { TierUpModal } from '../TierUp';
import { CombatView } from './CombatView';
import { Scene, activityInfo, type Pop } from './Scene';

let popSeq = 0;

export function StudyTab() {
  const app = useApp();
  const { world, lv } = app;
  const [queue, setQueue] = useState<CardRow[] | null>(null);
  const [nextLearn, setNextLearn] = useState<number | null>(null);
  const [practice, setPractice] = useState(false);
  const [practiceCard, setPracticeCard] = useState<CardRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [tierUp, setTierUp] = useState<{ card: CardRow; tier: Tier } | null>(null);
  const [pops, setPops] = useState<Pop[]>([]);
  const lastPractice = useRef<number | null>(null);

  const load = async () => {
    const q = await dueQueue(app);
    setQueue(q);
    if (!q.length) {
      setNextLearn(await nextLearningDue(Date.now()));
      await checkQueueCleared(app);
    }
  };
  useEffect(() => {
    void load();
  }, []);

  // learning cards come back on their own
  useEffect(() => {
    if (!nextLearn || queue?.length) return;
    const t = setTimeout(() => void load(), Math.max(1000, nextLearn - Date.now() + 500));
    return () => clearTimeout(t);
  }, [nextLearn, queue]);

  const drawPractice = async () => {
    const pick = pickRandom(await practicePool(), (c) => c.id === lastPractice.current);
    lastPractice.current = pick?.id ?? null;
    setPracticeCard(pick);
    return pick;
  };
  useEffect(() => {
    if (practice && !practiceCard) void drawPractice();
  }, [practice]);

  const addPops = (items: Record<string, number>, extra: { text: string; tone?: string }[] = []) => {
    const fresh: Pop[] = [
      ...Object.entries(items).map(([id, n], i) => ({ id: ++popSeq, item: id, text: `+${n}`, x: 30 + i * 18, tone: ITEMS[id].kind === 'gem' || id === 'bird-nest' || id === 'casket' ? 'rare' : '' })),
      ...extra.map((e, i) => ({ id: ++popSeq, text: e.text, tone: e.tone, x: 55 + i * 10 })),
    ];
    setPops((p) => [...p, ...fresh]);
    setTimeout(() => setPops((p) => p.filter((x) => !fresh.includes(x))), 1600);
  };

  const active = world.active;
  if (!active) {
    return (
      <div className="screen">
        <div className="title-logo" style={{ fontSize: 26, marginTop: 12 }}>GRIMRECALL</div>
        <div className="stone col center">
          <h2>What will you train?</h2>
          <div className="serif" style={{ fontSize: 16 }}>Pick an activity in Skills. Then every card you study mines, chops, fishes, cooks, forges or fights.</div>
          <button className="btn big block" onClick={() => app.go({ name: 'skills' })}>Choose a skill</button>
        </div>
        {queue && <div className="small muted center">{queue.length} cards due</div>}
      </div>
    );
  }
  if (active.kind === 'combat') return <CombatView queue={queue} reload={load} practice={practice} setPractice={setPractice} nextLearn={nextLearn} />;

  const blocked = checkActive(world, lv);
  const card = queue?.[0] ?? (practice ? practiceCard : null);
  const isPractice = !queue?.[0];
  const info = activityInfo(active);

  const grade = async (g: 1 | 2 | 3 | 4) => {
    if (!card || busy) return;
    setBusy(true);
    try {
      const rec = await recordGrade(app, card, g, isPractice);
      const res = await app.updateWorld((w) => {
        const r = performAction(w, lv, rec.tier);
        r.msgs.forEach((m) => pushLog(w, m.text, m.tone));
        return r;
      });
      if (!res.ok) app.toast(res.reason ?? 'Nothing happens.');
      const xp = { ...scaleXp(res.xp, isPractice), scholarship: rec.scholarship };
      addPops(res.items, Object.entries(res.xp).map(([, v]) => ({ text: `+${Math.round(isPractice ? (v ?? 0) / 2 : v ?? 0)} xp`, tone: 'xp' })));
      if (Object.keys(res.items).some((id) => ['gem', 'misc'].includes(ITEMS[id].kind))) sfx.coin();
      else if (info.skill === 'mining' || info.skill === 'smithing') sfx.hit();
      else if (info.skill === 'woodcutting') sfx.hurt();
      else sfx.flip();
      await app.gainXp(xp);
      if (rec.tierUp) setTierUp(rec.tierUp);
      if (isPractice) await drawPractice();
      else await load();
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

  return (
    <div className="screen study">
      <Scene active={active} pops={pops} status={blocked} />
      {blocked ? (
        <div className="stone col center">
          <div className="serif" style={{ fontSize: 16 }}>{blocked}</div>
          <button className="btn block" onClick={() => app.go({ name: 'skill', skill: info.skill })}>Open {info.skill}</button>
        </div>
      ) : card ? (
        <>
          {isPractice && <div className="small muted center">Practice: half xp, no scholarship, schedule untouched.</div>}
          <ReviewPanel card={card} onGrade={grade} busy={busy} showIntervals={!isPractice} />
        </>
      ) : queue ? (
        <DoneForNow nextLearn={nextLearn} onPractice={() => setPractice(true)} />
      ) : null}
      {tierUp && <TierUpModal card={tierUp.card} tier={tierUp.tier} onPick={pickEffect} />}
    </div>
  );
}

export function DoneForNow({ nextLearn, onPractice }: { nextLearn: number | null; onPractice: () => void }) {
  return (
    <div className="stone col center">
      <h3>No cards due</h3>
      <div className="serif" style={{ fontSize: 16 }}>
        {nextLearn ? `Learning cards return in ${formatInterval(nextLearn - Date.now())}.` : 'Your queue is clear for today.'} You can keep training with practice cards: half xp, and your schedule isn’t touched.
      </div>
      <button className="btn block" onClick={onPractice}><Sprite name="hourglass" size={18} /> Practice</button>
    </div>
  );
}
