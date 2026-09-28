import { useEffect, useRef, useState } from 'react';
import { formatInterval, nextLearningDue } from '../../core/srs';
import type { CardRow } from '../../core/types';
import { ITEMS } from '../../game/items';
import { checkActive, performAction, pushLog } from '../../game/world';
import { checkQueueCleared } from '../actions';
import { EmptyState, Sprite, XpBar } from '../common';
import { useApp } from '../context';
import { ReviewPanel } from '../ReviewPanel';
import { sfx } from '../sfx';
import { answerFlags, dueQueue, pickRandom, practicePool, recordGrade, scaleXp } from '../study';
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
  const [pops, setPops] = useState<Pop[]>([]);
  const [actionKey, setActionKey] = useState(0);
  const [done, setDone] = useState(0);
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
      ...extra.map((e, i) => ({ id: ++popSeq, text: e.text, tone: e.tone, x: 52 + (i % 2) * 6, y: i * 9 })),
    ];
    setPops((p) => [...p, ...fresh]);
    setTimeout(() => setPops((p) => p.filter((x) => !fresh.includes(x))), 1600);
  };

  const active = world.active;
  if (!active) {
    return (
      <div className="screen" style={{ justifyContent: 'center' }}>
        <div className="title-logo" style={{ fontSize: 26 }}>GRIMRECALL</div>
        <div className="stone gilded col center">
          <EmptyState icon="pickaxe" title="What will you train?">
            Pick an activity in Skills. Then every card you study mines, chops, fishes, cooks, forges or fights.
          </EmptyState>
          <button className="btn big block primary" onClick={() => app.go({ name: 'skills' })}>Choose a skill</button>
        </div>
        {queue && <div className="small muted center num">{queue.length} cards due today</div>}
      </div>
    );
  }
  if (active.kind === 'combat') return <CombatView queue={queue} reload={load} practice={practice} setPractice={setPractice} nextLearn={nextLearn} />;

  const blocked = checkActive(world, lv);
  const card = queue?.[0] ?? (practice ? practiceCard : null);
  const isPractice = !queue?.[0];
  const info = activityInfo(active);

  const grade = async (g: 1 | 2 | 3 | 4, _revealMs = 0, verified = false) => {
    if (!card || busy) return;
    setBusy(true);
    try {
      const flags = answerFlags(card);
      const rec = await recordGrade(app, card, g, isPractice);
      const res = await app.updateWorld((w) => {
        const r = performAction(w, lv, { grade: g, tier: rec.tier, verified, ...flags });
        r.msgs.forEach((m) => pushLog(w, m.text, m.tone));
        if (r.answer?.milestone) pushLog(w, r.answer.milestone.text, 'gold');
        return r;
      });
      if (!res.ok) app.toast(res.reason ?? 'Nothing happens.');
      const hit = !!res.answer?.correct;
      if (res.ok && hit) setActionKey((k) => k + 1);
      const skillXp = scaleXp(res.xp, isPractice);
      const xp = { ...skillXp, scholarship: rec.scholarship };
      if (res.ok && !hit) {
        addPops({}, [{ text: 'Miss', tone: 'miss' }]);
        sfx.miss();
      } else if (res.ok) {
        addPops(res.items, [
          ...Object.values(skillXp).map((v) => ({ text: `+${Math.round(v ?? 0)} xp`, tone: 'xp' })),
          ...(res.tags ?? []).slice(0, 3).map((t) => ({ text: t, tone: 'bonus' })),
        ]);
        if (Object.keys(res.items).some((id) => ['gem', 'misc', 'legendary', 'pet'].includes(ITEMS[id].kind))) sfx.coin();
        else if (info.skill === 'mining' || info.skill === 'smithing') sfx.hit();
        else if (info.skill === 'woodcutting') sfx.hurt();
        else sfx.flip();
      }
      const milestone = res.answer?.milestone;
      if (milestone) {
        sfx.victory();
        app.toast(milestone.text);
        if (milestone.gold) await app.updateProfile((p) => void (p.gold += milestone.gold));
      } else if (res.firsts?.length) app.toast(`New in your collection log: ${res.firsts.map((id) => ITEMS[id].name).join(', ')}!`);
      await app.gainXp(xp);
      // tier-up choices wait for combat: the card shows ASCEND in your hand there
      if (isPractice) await drawPractice();
      else {
        setDone((d) => d + 1);
        await load();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen study">
      <Scene active={active} pops={pops} status={blocked} actionKey={actionKey} />
      {queue && !blocked && (
        <div className="session num" aria-label={`${queue.length} cards left, ${done} done this session`}>
          {isPractice && practice ? (
            <span className="gold">Practice · half xp · schedule untouched</span>
          ) : (
            <>
              <span>{queue.length} left</span>
              <XpBar into={done} span={done + queue.length} tone="gold" />
              <span>{done} done</span>
            </>
          )}
        </div>
      )}
      {blocked ? (
        <div className="stone col center">
          <div className="desc">{blocked}</div>
          <button className="btn block primary" onClick={() => app.go({ name: 'skill', skill: info.skill })}>Open {info.skill}</button>
        </div>
      ) : card ? (
        <ReviewPanel card={card} onGrade={grade} busy={busy} showIntervals={!isPractice} />
      ) : queue ? (
        <DoneForNow nextLearn={nextLearn} onPractice={() => setPractice(true)} />
      ) : null}
    </div>
  );
}

export function DoneForNow({ nextLearn, onPractice }: { nextLearn: number | null; onPractice: () => void }) {
  return (
    <div className="stone col center">
      <EmptyState icon={nextLearn ? 'hourglass' : 'star'} title={nextLearn ? 'Cards still settling' : 'All caught up'}>
        {nextLearn ? `Learning cards return in ${formatInterval(nextLearn - Date.now())}.` : 'Your queue is clear for today.'} You can keep training with practice cards: half xp, and your schedule isn’t touched.
      </EmptyState>
      <button className="btn block" onClick={onPractice}><Sprite name="hourglass" size={18} /> Practice</button>
    </div>
  );
}
