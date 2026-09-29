import { useEffect, useRef, useState } from 'react';
import { db } from '../../core/db';
import { isLeech, tierOf } from '../../core/srs';
import type { CardRow } from '../../core/types';
import { ABILITIES, ENERGY_CAP, energyFor } from '../../game/abilities';
import { AREA_BY_ID } from '../../game/activities';
import type { CombatEvent } from '../../game/combat';
import { TRAIT_INFO } from '../../game/enemies';
import { ITEMS } from '../../game/items';
import { bossReady, combatAnswer, combatCard, combatEndTurn, leaveCombat, nextEnemy, pushLog, startTrip, statsFor, type CombatResult, type World } from '../../game/world';
import { checkQueueCleared } from '../actions';
import { Sprite } from '../common';
import { useApp } from '../context';
import { ReviewPanel } from '../ReviewPanel';
import { AbilityCard, AbilityChip } from '../run/AbilityCard';
import { Arena, type Fx } from '../run/Arena';
import { sfx } from '../sfx';
import { answerFlags, pickRandom, practicePool, recordGrade, scaleXp } from '../study';
import { heroLook } from '../heroLook';
import { DoneForNow } from './StudyTab';

let fxSeq = 0;

/** The flashcard for this turn: bosses drag due leeches up first. */
export function pickFlashcard(queue: CardRow[], boss: boolean): CardRow | null {
  if (!queue.length) return null;
  return (boss && queue.find(isLeech)) || queue[0];
}

export function CombatView({ queue, reload, practice, setPractice, nextLearn }: { queue: CardRow[] | null; reload: () => Promise<void>; practice: boolean; setPractice: (p: boolean) => void; nextLearn: number | null }) {
  const app = useApp();
  const { world, lv, maxHp } = app;
  const area = AREA_BY_ID[(world.active as { id: string }).id];
  const [busy, setBusy] = useState(false);
  const [fx, setFx] = useState<Fx[]>([]);
  const [enemyHurt, setEnemyHurt] = useState(false);
  const [playerHurt, setPlayerHurt] = useState(false);
  const [enemyDead, setEnemyDead] = useState(false);
  const [dead, setDead] = useState<{ lost: number } | null>(null);
  const [spawnKey, setSpawnKey] = useState(0);
  const [attackKey, setAttackKey] = useState(0);
  const [practiceCard, setPracticeCard] = useState<CardRow | null>(null);
  const [showLog, setShowLog] = useState(false);
  /** whether this turn's energy came from a practice card (half xp) */
  const practiceTurn = useRef(false);
  const lastPractice = useRef<number | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const c = world.combat;
  const stats = statsFor(world, lv, maxHp);

  // start a trip when entering the area (or after an old save's trip was dropped)
  useEffect(() => {
    if (!world.combat || world.combat.area !== area.id) {
      void app.updateWorld((w) => {
        startTrip(w, area, lv);
        pushLog(w, `You enter ${area.name}. ${area.flavor}`, 'info');
        if (!w.equip.weapon) pushLog(w, 'Tip: forge a weapon at the anvil. Your weapon decides your attack cards.', 'info');
      });
    }
  }, [area.id, !!world.combat]);

  const drawPractice = async () => {
    const pick = pickRandom(await practicePool(), (x) => x.id === lastPractice.current);
    lastPractice.current = pick?.id ?? null;
    setPracticeCard(pick);
  };
  useEffect(() => {
    if (practice && !practiceCard) void drawPractice();
  }, [practice]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [world.log.length, showLog]);

  const flash = pickFlashcard(queue ?? [], !!c?.enemy.boss) ?? (practice ? practiceCard : null);
  const onPractice = !queue?.length;

  const addFx = (items: Omit<Fx, 'id'>[]) => {
    const withIds = items.map((f) => ({ ...f, id: ++fxSeq }));
    setFx((cur) => [...cur, ...withIds]);
    setTimeout(() => setFx((cur) => cur.filter((f) => !withIds.includes(f))), 2600);
  };
  const hurt = (who: 'enemy' | 'player', delay: number) =>
    setTimeout(() => {
      (who === 'enemy' ? setEnemyHurt : setPlayerHurt)(true);
      setTimeout(() => (who === 'enemy' ? setEnemyHurt : setPlayerHurt)(false), 260);
    }, delay);

  /** Splats, sounds and log lines for one step. Returns how long the animation runs. */
  const animate = (events: CombatEvent[], w: World, enemyName: string): number => {
    const items: Omit<Fx, 'id'>[] = [];
    let t = 0;
    const jitter = () => Math.random() * 16 - 8;
    for (const e of events) {
      if (e.t === 'enemyDmg') {
        const text = e.amount === 0 && e.blocked ? 'Blocked' : String(e.amount);
        items.push({ kind: 'splat', target: 'enemy', text, cls: e.amount === 0 ? 'zero' : e.amount >= stats.power * 2 ? 'crit' : '', x: 44 + jitter(), y: 28 + jitter(), delay: t });
        if (e.amount > 0) hurt('enemy', t);
        setTimeout(() => (e.amount === 0 ? sfx.shield() : e.amount >= stats.power * 2 ? sfx.crit() : sfx.hit()), t);
        pushLog(w, e.amount === 0 ? `${enemyName}'s guard absorbs the blow.` : `You hit ${enemyName} for ${e.amount}${e.blocked ? ` (${e.blocked} blocked)` : ''}.`, 'dmg');
        t += 240;
      } else if (e.t === 'playerDmg') {
        items.push({ kind: 'splat', target: 'player', text: e.amount === 0 && e.blocked ? 'Blocked' : String(e.amount), cls: e.amount === 0 ? 'zero' : '', x: 8 + jitter() / 2, y: 70, delay: t });
        if (e.amount > 0) hurt('player', t);
        setTimeout(() => (e.amount ? sfx.hurt() : sfx.shield()), t);
        pushLog(w, e.amount ? `You take ${e.amount} damage${e.blocked ? ` (${e.blocked} blocked)` : ''}.` : 'Your guard holds!', e.amount ? 'bad' : 'info');
        t += 260;
      } else if (e.t === 'heal' && e.amount > 0) {
        items.push({ kind: 'splat', target: 'player', text: `+${e.amount}`, cls: 'heal', x: 12, y: 64, delay: t });
        setTimeout(sfx.heal, t);
        pushLog(w, `You recover ${e.amount} HP.`, 'heal');
        t += 180;
      } else if (e.t === 'block') {
        items.push({ kind: 'splat', target: 'player', text: `+${e.amount}`, cls: 'block', x: 16, y: 60, delay: t });
        setTimeout(sfx.shield, t);
        t += 160;
      } else if (e.t === 'poison') {
        items.push({ kind: 'splat', target: 'enemy', text: `+${e.amount}`, cls: 'poison', x: 54 + jitter(), y: 32, delay: t });
        setTimeout(sfx.poison, t);
        pushLog(w, `Venom seeps in (${e.amount}).`, 'dmg');
        t += 180;
      } else if (e.t === 'playerPoison' && e.amount > 0) {
        items.push({ kind: 'splat', target: 'player', text: `+${e.amount}`, cls: 'poison', x: 14, y: 58, delay: t });
        t += 120;
      } else if (e.t === 'energy' && e.amount > 0) {
        items.push({ kind: 'splat', target: 'player', text: `+${e.amount} energy`, cls: 'energy', x: 10, y: 50, delay: t });
      } else if (e.t === 'enemyBlock') {
        items.push({ kind: 'splat', target: 'enemy', text: `+${e.amount}`, cls: 'block', x: 60, y: 22, delay: t });
      } else if (e.t === 'enemyHeal') {
        items.push({ kind: 'splat', target: 'enemy', text: `+${e.amount}`, cls: 'heal', x: 58, y: 24, delay: t });
        pushLog(w, `${enemyName} regenerates ${e.amount} HP.`, 'bad');
      } else if (e.t === 'status' || e.t === 'stun') {
        items.push({ kind: 'splat', target: 'enemy', text: e.t === 'stun' ? 'Stunned!' : e.text, cls: 'status', x: 38, y: 20, delay: t });
      } else if (e.t === 'enemyDied') setTimeout(sfx.kill, t);
      else if (e.t === 'log') pushLog(w, e.text, e.tone);
    }
    addFx(items);
    return t;
  };

  const xpFx = (gains: Record<string, number | undefined>) => {
    const icons: Record<string, string> = { attack: 'sword', strength: 'fist', defence: 'shield', hitpoints: 'heart', scholarship: 'book' };
    addFx(
      Object.entries(gains)
        .filter(([, v]) => (v ?? 0) >= 1)
        .map(([k, v], i) => ({ kind: 'xp' as const, target: 'player' as const, text: `+${Math.round(v!)}`, icon: icons[k], x: 0, y: 40 + i * 7, delay: i * 120 })),
    );
  };

  /** Loot, gold and the next enemy after a kill; the death screen after a loss. */
  const settle = async (res: CombatResult, animMs: number) => {
    if (res.died) {
      const lost = Math.floor(app.profile.gold * 0.1);
      await app.updateProfile((p) => {
        p.gold -= lost;
        p.stats.deaths++;
      });
      setTimeout(sfx.death, animMs);
      setTimeout(() => setDead({ lost }), animMs + 300);
      return;
    }
    if (!res.killed) return;
    await app.updateWorld((w) => {
      pushLog(w, `${res.enemyName} is slain! +${res.gold} gold.`, 'gold');
      for (const [id, n] of Object.entries(res.loot)) pushLog(w, `Loot: ${n > 1 ? `${n}× ` : ''}${ITEMS[id].name}`, 'loot');
      for (const id of res.firsts ?? []) pushLog(w, `New collection log entry: ${ITEMS[id].name}!`, 'gold');
    });
    await app.updateProfile((p) => {
      p.gold += res.gold;
      if (res.boss) p.stats.bosses++;
    });
    setTimeout(sfx.coin, animMs + 200);
    setEnemyDead(true);
    setTimeout(() => addFx([{ kind: 'splat', target: 'enemy', text: 'SLAIN', cls: 'slain', x: 34, y: 34, delay: 0 }]), animMs);
    await new Promise((ok) => setTimeout(ok, Math.max(1100, animMs + 700)));
    if (res.boss) {
      // beating the boss clears leech status (a game flag only; scheduling untouched)
      const ids = world.combat?.leeches ?? [];
      for (const id of ids) {
        const row = await db.cards.get(id);
        if (row && isLeech(row)) await db.cards.update(id, { leechBase: row.lapses });
      }
      sfx.victory();
      app.toast(ids.length ? `Boss slain! ${ids.length} leech${ids.length > 1 ? 'es' : ''} purged.` : 'Boss slain!');
    } else if (res.firsts?.length) app.toast(`New in your collection log: ${res.firsts.map((id) => ITEMS[id].name).join(', ')}!`);
    await app.updateWorld((w) => {
      if (!w.combat) return;
      if (res.boss) w.combat.leeches = [];
      nextEnemy(w, lv);
      pushLog(w, `A ${w.combat.enemy.name} appears (${w.combat.enemy.hp} HP).`, 'info');
    });
    setSpawnKey((k) => k + 1);
    setEnemyDead(false);
  };

  // ---- step 1: answer the flashcard for energy ----
  const onGrade = async (grade: 1 | 2 | 3 | 4, _revealMs: number, verified = false) => {
    const card = flash;
    if (!card || !c || busy || c.phase !== 'answer') return;
    setBusy(true);
    try {
      const flags = answerFlags(card);
      const isPractice = onPractice;
      const rec = await recordGrade(app, card, grade, isPractice);
      practiceTurn.current = isPractice;
      const res = await app.updateWorld((w) => {
        const r = combatAnswer(w, { id: card.id, tier: rec.tier }, grade, { verified, ...flags });
        if (r.answer?.milestone) pushLog(w, r.answer.milestone.text, 'gold');
        animate(r.events, w, r.enemyName);
        return r;
      });
      if (grade === 1) sfx.miss();
      else sfx.flip();
      await app.gainXp({ scholarship: rec.scholarship });
      const milestone = res.answer?.milestone;
      if (milestone) {
        sfx.victory();
        app.toast(milestone.text);
        if (milestone.gold) await app.updateProfile((p) => void (p.gold += milestone.gold));
      }
      if (isPractice) await drawPractice();
      else {
        await reload();
        await checkQueueCleared(app);
      }
    } finally {
      setBusy(false);
    }
  };

  // ---- step 2: play ability cards ----
  const play = async (uid: number) => {
    if (!c || busy || enemyDead) return;
    setBusy(true);
    try {
      sfx.tap();
      let animMs = 0;
      const res = await app.updateWorld((w) => {
        const r = combatCard(w, lv, maxHp, uid);
        if (!r) return null;
        if (r.events.some((e) => e.t === 'enemyDmg')) setAttackKey((k) => k + 1);
        animMs = animate(r.events, w, r.enemyName);
        return r;
      });
      if (!res) return;
      const xp = scaleXp(res.xp, practiceTurn.current);
      xpFx(xp);
      await app.gainXp(xp);
      await settle(res, animMs);
    } finally {
      setBusy(false);
    }
  };

  // ---- step 3: the enemy acts ----
  const endTurn = async () => {
    if (!c || busy || enemyDead || c.phase !== 'play') return;
    setBusy(true);
    try {
      let animMs = 0;
      const res = await app.updateWorld((w) => {
        const r = combatEndTurn(w, lv, maxHp);
        animMs = animate(r.events, w, r.enemyName);
        if (r.died) pushLog(w, 'You have fallen.', 'bad');
        return r;
      });
      const xp = scaleXp(res.xp, practiceTurn.current);
      xpFx(xp);
      await app.gainXp(xp);
      await settle(res, animMs);
    } finally {
      setBusy(false);
    }
  };

  const fightBoss = async () => {
    if (!(await app.ask(`Challenge ${area.boss.name}? Your deck is reshuffled for the fight.`, 'Fight'))) return;
    sfx.boss();
    await app.updateWorld((w) => {
      nextEnemy(w, lv, Math.random, true);
      pushLog(w, `${w.combat!.enemy.name} rises before you!`, 'bad');
    });
    setSpawnKey((k) => k + 1);
  };

  const leave = async () => {
    await app.updateWorld((w) => {
      leaveCombat(w);
      pushLog(w, 'You leave the battlefield.', 'info');
    });
    app.go({ name: 'skills' });
  };

  const energy = c?.energy ?? 0;
  const playable = (c?.hand ?? []).some((h) => ABILITIES[h.id].cost <= energy && (h.id !== 'eat' || (h.food && world.bank[h.food])));
  const kills = world.bossProgress[area.id] ?? 0;

  return (
    <div className={`run ${c?.phase === 'play' ? '' : 'answering'}`}>
      <Arena
        compact={c?.phase !== 'play'}
        spawnKey={spawnKey}
        biome={area.biome}
        enemy={c?.enemy ?? null}
        look={heroLook(world, lv, 'sword')}
        attackKey={attackKey}
        fx={fx}
        enemyHurt={enemyHurt}
        playerHurt={playerHurt}
        enemyDead={enemyDead}
        onTrait={(t) => app.toast(`${TRAIT_INFO[t].name}: ${TRAIT_INFO[t].desc}`)}
        hud={
          <>
            <button className="back-btn" style={{ minWidth: 40, minHeight: 40, fontSize: 12 }} onClick={leave} aria-label="Leave combat">✕</button>
            <div className="grow" />
            {bossReady(world, area) && !c?.enemy.boss && (
              <button className="pill red" onClick={fightBoss} style={{ minHeight: 36 }}><Sprite name="skull" size={14} /> Boss</button>
            )}
            <button className="pill" onClick={() => setShowLog((s) => !s)} style={{ minHeight: 36 }} aria-pressed={showLog}>Log</button>
          </>
        }
      />

      <div className="combat-bar">
        <div className="hero-hp" aria-label={`Your health ${Math.max(0, world.hp)} of ${maxHp}`}>
          <Sprite name="heart" size={14} />
          <div className="hpbar grow">
            <i style={{ width: `${Math.max(0, (world.hp / maxHp) * 100)}%` }} />
            <span>{Math.max(0, world.hp)}/{maxHp}</span>
          </div>
          {(c?.block ?? 0) > 0 && <span className="pill"><Sprite name="shield" size={12} />{c!.block}</span>}
          {(c?.poison ?? 0) > 0 && <span className="pill st-poison"><Sprite name="skull" size={12} />{c!.poison}</span>}
        </div>
        <div className="energy" aria-label={`${energy} of ${ENERGY_CAP} energy`}>
          {Array.from({ length: ENERGY_CAP }, (_, i) => <i key={i} className={i < energy ? 'on' : ''} />)}
          <span className="num">{energy}</span>
        </div>
        <span className="small muted num grow">
          Turn {c?.turn ?? 1} · Deck {c?.draw.length ?? 0}
          {!c?.enemy.boss && <> · {bossReady(world, area) ? <span className="gold">Boss ready</span> : `Boss in ${area.bossAfter - kills}`}</>}
        </span>
        {c?.phase === 'play' && (
          <button className={`btn small ${playable ? 'stone' : 'primary pulse'}`} disabled={busy || enemyDead} onClick={endTurn}>End turn</button>
        )}
      </div>

      {showLog && (
        <div className="chatlog" ref={logRef} aria-live="polite">
          {world.log.map((l, i) => (
            <div key={i} className={l.tone}>{l.text}</div>
          ))}
        </div>
      )}

      {c?.phase === 'play' ? (
        <div className="hand-area">
          <div className="hand">
            {c.hand.map((h) => {
              const noFood = h.id === 'eat' && !(h.food && world.bank[h.food]);
              return (
                <AbilityCard key={h.uid} id={h.id} plus={h.plus} food={h.food} stats={stats} disabled={busy || enemyDead || ABILITIES[h.id].cost > energy || noFood} onPlay={() => play(h.uid)} note={noFood ? 'Out of food' : undefined} />
              );
            })}
            {!c.hand.length && <div className="small muted center" style={{ alignSelf: 'center' }}>No cards left this turn.</div>}
          </div>
          <div className="small muted center">Tap a card to play it. Unspent energy carries over (up to {ENERGY_CAP}).</div>
        </div>
      ) : (
        <div className="combat-answer">
          {c && (
            <div className="hand-preview" aria-label="Your hand">
              {c.hand.map((h) => <AbilityChip key={h.uid} id={h.id} plus={h.plus} food={h.food} />)}
            </div>
          )}
          {flash ? (
            <>
              <div className="energy-hint small center">
                Energy: <b>Hard {energyFor(2, 0)}</b> · <b>Good {energyFor(3, 0)}</b> · <b>Easy {energyFor(4, 0)}</b>{tierOf(flash) >= 2 ? <> · <b>+1</b> mature card</> : ''}
                {c?.enemy.boss && isLeech(flash) ? <span className="red"> · the boss drags up a leech</span> : null}
              </div>
              {onPractice && <div className="small muted center">Practice card: your schedule isn’t touched.</div>}
              <ReviewPanel card={flash} onGrade={onGrade} busy={busy} showIntervals={!onPractice} />
            </>
          ) : queue && !queue.length && !practice ? (
            <DoneForNow nextLearn={nextLearn} onPractice={() => setPractice(true)} />
          ) : (
            <div className="small muted center">Drawing a card…</div>
          )}
        </div>
      )}

      {dead && (
        <div className="death">
          <Sprite name="tomb" size={96} />
          <h1>You have fallen.</h1>
          <div className="serif muted center" style={{ fontSize: 16 }}>Your reviews were recorded. You wake at half health.{dead.lost ? ` ${dead.lost} gold was lost in the dark.` : ''}</div>
          <button className="btn big red block" onClick={() => { setDead(null); app.go({ name: 'skills' }); }}>Rise again</button>
        </div>
      )}
    </div>
  );
}
