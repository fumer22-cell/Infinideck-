import { useEffect, useRef, useState } from 'react';
import { db } from '../../core/db';
import { isLeech, State, TIER_NAMES, tierOf } from '../../core/srs';
import type { CardRow, EffectId, Tier } from '../../core/types';
import { AREA_BY_ID } from '../../game/activities';
import type { CombatEvent } from '../../game/combat';
import { EFFECTS } from '../../game/effects';
import { ITEMS } from '../../game/items';
import { autoEat, bonuses, bossReady, combatPlay, eat, leaveCombat, nextEnemy, pushLog, startTrip, type World } from '../../game/world';
import { checkQueueCleared, setCardEffect } from '../actions';
import { ItemIcon, Sprite } from '../common';
import { useApp } from '../context';
import { FAST_MS, ReviewPanel } from '../ReviewPanel';
import { Arena, type Fx } from '../run/Arena';
import { HandCard } from '../run/HandCard';
import { sfx } from '../sfx';
import { answerFlags, practicePool, recordGrade, scaleXp } from '../study';
import { TierUpModal } from '../TierUp';
import { heroLook } from '../heroLook';
import { DoneForNow } from './StudyTab';

const HAND = 3;
const MAX_HAND = 5;
let fxSeq = 0;

/**
 * Fill the hand from `pool` (due cards, or practice cards when nothing is due).
 * Bosses pull due leeches first. Synchronous: call it inside updateWorld.
 */
export function topUpHand(w: World, pool: CardRow[], onPractice: boolean) {
  const cs = w.combat;
  if (!cs) return;
  const valid = new Set(pool.map((q) => q.id!));
  if (!onPractice) cs.hand = cs.hand.filter((id) => valid.has(id));
  const target = Math.min(MAX_HAND, Math.max(HAND, cs.hand.length) + (cs.bonusDraw ?? 0));
  cs.bonusDraw = 0;
  const inHand = new Set(cs.hand);
  let pile = pool.filter((q) => !inHand.has(q.id!));
  if (onPractice) pile = [...pile].sort(() => Math.random() - 0.5);
  else if (cs.enemy.boss) pile = [...pile.filter(isLeech), ...pile.filter((q) => !isLeech(q))];
  const drawn = pile.slice(0, Math.max(0, target - cs.hand.length));
  if (cs.enemy.boss && !onPractice) {
    const leeches = drawn.filter(isLeech).map((q) => q.id!);
    if (leeches.length) {
      cs.leeches = [...new Set([...cs.leeches, ...leeches])];
      pushLog(w, `${cs.enemy.name} drags ${leeches.length} leech card${leeches.length > 1 ? 's' : ''} into your hand!`, 'bad');
    }
  }
  cs.hand = [...cs.hand, ...drawn.map((d) => d.id!)];
}

export function CombatView({ queue, reload, practice, setPractice, nextLearn }: { queue: CardRow[] | null; reload: () => Promise<void>; practice: boolean; setPractice: (p: boolean) => void; nextLearn: number | null }) {
  const app = useApp();
  const { world, lv, maxHp, settings } = app;
  const area = AREA_BY_ID[(world.active as { id: string }).id];
  const [cards, setCards] = useState<Map<number, CardRow>>(new Map());
  const [active, setActive] = useState<CardRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [fx, setFx] = useState<Fx[]>([]);
  const [enemyHurt, setEnemyHurt] = useState(false);
  const [playerHurt, setPlayerHurt] = useState(false);
  const [enemyDead, setEnemyDead] = useState(false);
  const [tierUp, setTierUp] = useState<{ card: CardRow; tier: Tier } | null>(null);
  const [dead, setDead] = useState<{ lost: number } | null>(null);
  /** a card whose maturity rose (maybe while training another skill): choose its power before playing */
  const [ascending, setAscending] = useState<CardRow | null>(null);
  const [spawnKey, setSpawnKey] = useState(0);
  const [attackKey, setAttackKey] = useState(0);
  /** cards whose maturity rose while training other skills, waiting to choose a new power */
  const [pending, setPending] = useState<CardRow[]>([]);
  const loadPending = async () => setPending(await db.cards.where('state').equals(State.Review).filter((r) => tierOf(r) > r.tierSeen).toArray());
  useEffect(() => {
    void loadPending();
  }, []);
  const logRef = useRef<HTMLDivElement>(null);
  const c = world.combat;
  const onPractice = !queue?.length;

  // start a trip when entering the area
  useEffect(() => {
    if (!world.combat || world.combat.area !== area.id) {
      void app.updateWorld((w) => {
        startTrip(w, area);
        pushLog(w, `You enter ${area.name}. ${area.flavor}`, 'info');
        if (!w.equip.weapon) pushLog(w, 'Tip: forge a sword at the anvil and equip it in Gear to hit harder.', 'info');
      });
    }
  }, [area.id]);

  // Keep the hand topped up. Card lookups happen first; the hand is then changed
  // inside updateWorld on the freshest world, so a play made meanwhile is never overwritten.
  useEffect(() => {
    if (!c || !queue) return;
    let cancelled = false;
    void (async () => {
      const pool = onPractice ? (practice ? await practicePool() : []) : queue;
      if (cancelled) return;
      await app.updateWorld((w) => topUpHand(w, pool, onPractice));
    })();
    return () => {
      cancelled = true;
    };
  }, [queue, practice, c?.enemy.name, c?.enemy.boss, c?.hand.join(',')]);

  useEffect(() => {
    void db.cards.bulkGet(c?.hand ?? []).then((rows) => setCards(new Map(rows.filter((r): r is CardRow => !!r).map((r) => [r.id!, r]))));
  }, [c?.hand.join(',')]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [world.log.length]);

  const addFx = (items: Omit<Fx, 'id'>[]) => {
    const withIds = items.map((f) => ({ ...f, id: ++fxSeq }));
    setFx((cur) => [...cur, ...withIds]);
    setTimeout(() => setFx((cur) => cur.filter((f) => !withIds.includes(f))), 2600);
  };
  const flash = (who: 'enemy' | 'player', delay: number) =>
    setTimeout(() => {
      (who === 'enemy' ? setEnemyHurt : setPlayerHurt)(true);
      setTimeout(() => (who === 'enemy' ? setEnemyHurt : setPlayerHurt)(false), 260);
    }, delay);

  /** Splats, sounds and chat lines for one play. */
  const animate = (events: CombatEvent[], w: World, enemyName: string): number => {
    const items: Omit<Fx, 'id'>[] = [];
    let t = 0;
    const jitter = () => Math.random() * 16 - 8;
    for (const e of events) {
      if (e.t === 'enemyDmg') {
        items.push({ kind: 'splat', target: 'enemy', text: String(e.amount), cls: e.amount === 0 ? 'zero' : e.crit ? 'crit' : '', x: 44 + jitter(), y: 28 + jitter(), delay: t });
        if (e.amount > 0) flash('enemy', t);
        setTimeout(() => (e.amount === 0 ? sfx.miss() : e.crit ? sfx.crit() : sfx.hit()), t);
        pushLog(w, e.amount === 0 ? 'Your blow is turned aside.' : `You hit ${enemyName} for ${e.amount}${e.crit ? ', a critical!' : '.'}`, 'dmg');
        t += 280;
      } else if (e.t === 'playerDmg') {
        items.push({ kind: 'splat', target: 'player', text: String(e.amount), cls: e.amount === 0 ? 'zero' : '', x: 8 + jitter() / 2, y: 70, delay: t });
        if (e.amount > 0) flash('player', t);
        setTimeout(() => (e.amount ? sfx.hurt() : sfx.shield()), t);
        pushLog(w, e.amount ? `You take ${e.amount} damage.` : 'Your guard holds!', e.amount ? 'bad' : 'info');
        t += 280;
      } else if (e.t === 'heal' && e.amount > 0) {
        items.push({ kind: 'splat', target: 'player', text: `+${e.amount}`, cls: 'heal', x: 12, y: 66, delay: t });
        setTimeout(sfx.heal, t);
        pushLog(w, `You recover ${e.amount} HP.`, 'heal');
        t += 200;
      } else if (e.t === 'block') {
        items.push({ kind: 'splat', target: 'player', text: `+${e.amount}`, cls: 'block', x: 16, y: 62, delay: t });
        setTimeout(sfx.shield, t);
        pushLog(w, `You raise a ward of ${e.amount}.`, 'info');
        t += 200;
      } else if (e.t === 'poison') {
        items.push({ kind: 'splat', target: 'enemy', text: `${e.amount}`, cls: 'poison', x: 52 + jitter(), y: 32, delay: t });
        setTimeout(sfx.poison, t);
        pushLog(w, `Venom seeps in (${e.amount}).`, 'dmg');
        t += 200;
      } else if (e.t === 'miss') {
        items.push({ kind: 'splat', target: 'enemy', text: '0', cls: 'zero', x: 44, y: 28, delay: t });
        setTimeout(sfx.miss, t);
        t += 250;
      } else if (e.t === 'draw') pushLog(w, 'Insight: you draw another card.', 'info');
      else if (e.t === 'enemyDied') setTimeout(sfx.kill, t);
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
        .map(([k, v], i) => ({ kind: 'xp' as const, target: 'player' as const, text: `+${Math.round(v!)}`, icon: icons[k], x: 0, y: 44 + i * 7, delay: i * 120 })),
    );
  };

  const onGrade = async (grade: 1 | 2 | 3 | 4, revealMs: number, verified = false) => {
    const card = active;
    if (!card || !c || busy) return;
    setBusy(true);
    setActive(null);
    try {
      const flags = answerFlags(card);
      const rec = await recordGrade(app, card, grade, onPractice);
      const wasNew = card.state === State.New;
      const fast = settings.speedBonus && !wasNew && grade > 1 && revealMs < FAST_MS;
      let animMs = 0;
      let res!: ReturnType<typeof combatPlay>;
      let eaten = 0;
      await app.updateWorld((w) => {
        if (fast) pushLog(w, 'Swift recall! +25% power.', 'gold');
        res = combatPlay(w, lv, maxHp, { effect: card.effect, tier: rec.tier, wasNew }, grade, fast, Math.random, { verified, ...flags });
        if (res.answer?.milestone) pushLog(w, res.answer.milestone.text, 'gold');
        for (const id of res.firsts ?? []) pushLog(w, `New collection log entry: ${ITEMS[id].name}!`, 'gold');
        if (res.events.some((e) => e.t === 'enemyDmg' || e.t === 'miss')) setAttackKey((k) => k + 1);
        animMs = animate(res.events, w, res.enemyName);
        if (w.combat) {
          w.combat.hand = w.combat.hand.filter((id) => id !== card.id);
          const draws = res.events.filter((e) => e.t === 'draw').length;
          if (draws) w.combat.bonusDraw = (w.combat.bonusDraw ?? 0) + draws;
        }
        if (!res.died) {
          eaten = autoEat(w, maxHp);
          if (eaten) pushLog(w, `You eat to recover ${eaten} HP.`, 'heal');
        }
        if (res.killed) {
          pushLog(w, `${res.enemyName} is slain! +${res.gold} gold.`, 'gold');
          for (const [id, n] of Object.entries(res.loot)) pushLog(w, `Loot: ${n > 1 ? `${n}× ` : ''}${ITEMS[id].name}`, 'loot');
        }
        if (res.died) pushLog(w, 'You have fallen.', 'bad');
      });
      xpFx(res.xp as Record<string, number>);
      await app.gainXp({ ...scaleXp(res.xp, onPractice), scholarship: rec.scholarship });
      if (eaten) setTimeout(sfx.heal, animMs);
      if (rec.tierUp) setTierUp(rec.tierUp);
      const milestone = res.answer?.milestone;
      if (milestone) {
        app.toast(milestone.text);
        if (milestone.gold) await app.updateProfile((p) => void (p.gold += milestone.gold));
      }

      if (res.died) {
        const lost = Math.floor(app.profile.gold * 0.1);
        await app.updateProfile((p) => {
          p.gold -= lost;
          p.stats.deaths++;
        });
        setTimeout(sfx.death, animMs);
        setTimeout(() => setDead({ lost }), animMs + 300);
      } else if (res.killed) {
        await app.updateProfile((p) => {
          p.gold += res.gold;
          if (res.boss) p.stats.bosses++;
        });
        setTimeout(sfx.coin, animMs + 200);
        setEnemyDead(true);
        setTimeout(() => addFx([{ kind: 'splat', target: 'enemy', text: 'SLAIN', cls: 'slain', x: 34, y: 34, delay: 0 }]), animMs);
        await new Promise((ok) => setTimeout(ok, Math.max(1100, animMs + 700)));
        if (res.boss) {
          // Beating the boss clears leech status (game flag only; scheduling untouched).
          const ids = world.combat?.leeches ?? [];
          for (const id of ids) {
            const row = await db.cards.get(id);
            if (row && isLeech(row)) await db.cards.update(id, { leechBase: row.lapses });
          }
          sfx.victory();
          app.toast(ids.length ? `Boss slain! ${ids.length} leech${ids.length > 1 ? 'es' : ''} purged.` : 'Boss slain!');
        }
        await app.updateWorld((w) => {
          if (!w.combat) return;
          if (res.boss) w.combat.leeches = [];
          nextEnemy(w);
          pushLog(w, `A new ${w.combat.enemy.name} appears (${w.combat.enemy.hp} HP).`, 'info');
        });
        setSpawnKey((k) => k + 1);
        setEnemyDead(false);
      }
      if (!onPractice) {
        await reload();
        await checkQueueCleared(app);
      }
      void loadPending();
    } finally {
      setBusy(false);
    }
  };

  const doEat = async () => {
    const healed = await app.updateWorld((w) => {
      const h = eat(w, maxHp);
      if (h) pushLog(w, `You eat and recover ${h} HP.`, 'heal');
      return h;
    });
    if (healed) sfx.heal();
    else app.toast(world.food && world.bank[world.food] ? 'Already at full health.' : 'No food. Set food in Gear.');
  };

  const fightBoss = async () => {
    if (!(await app.ask(`Challenge ${area.boss.name}?`, 'Fight'))) return;
    sfx.boss();
    await app.updateWorld((w) => {
      nextEnemy(w, Math.random, true);
      pushLog(w, `${w.combat!.enemy.name} rises before you!`, 'bad');
    });
  };

  const leave = async () => {
    await app.updateWorld((w) => {
      leaveCombat(w);
      pushLog(w, 'You leave the battlefield.', 'info');
    });
    app.go({ name: 'skills' });
  };

  const pickEffect = async (e: EffectId) => {
    if (!tierUp) return;
    await setCardEffect(tierUp.card.id!, e, tierUp.tier);
    app.toast(`${TIER_NAMES[tierUp.tier]} card empowered.`);
    setTierUp(null);
  };

  const b = bonuses(world, lv);
  const handRows = (c?.hand ?? []).map((id) => cards.get(id)).filter((r): r is CardRow => !!r);
  const food = world.food ? world.bank[world.food] ?? 0 : 0;

  return (
    <div className="run">
      <Arena
        spawnKey={spawnKey}
        biome={area.biome}
        enemy={c?.enemy ?? null}
        combo={c?.combo ?? 0}
        relics={b.relics}
        player={{ hp: world.hp, maxHp, block: c?.block ?? 0 }}
        look={heroLook(world, lv, 'sword')}
        attackKey={attackKey}
        fx={fx}
        enemyHurt={enemyHurt}
        playerHurt={playerHurt}
        enemyDead={enemyDead}
        hud={
          <>
            <button className="back-btn" style={{ minWidth: 40, minHeight: 40, fontSize: 12 }} onClick={leave} aria-label="Leave combat">✕</button>
            <button className="pill" onClick={doEat} aria-label="Eat" style={{ minHeight: 36 }}>
              {world.food ? <ItemIcon id={world.food} size={16} /> : <Sprite name="heart" size={14} />} Eat ×{food}
            </button>
            {bossReady(world, area) && !c?.enemy.boss && (
              <button className="pill red" onClick={fightBoss} style={{ minHeight: 36 }}><Sprite name="skull" size={14} /> Boss</button>
            )}
            {!bossReady(world, area) && <span className="pill small">Boss {world.bossProgress[area.id] ?? 0}/{area.bossAfter}</span>}
            {pending.length > 0 && (
              <button className="pill ascend-pill" onClick={() => setAscending(pending[0])} style={{ minHeight: 36 }} aria-label={`${pending.length} cards ready to ascend`}>↑{pending.length}</button>
            )}
          </>
        }
      />
      <div className="hand-area">
        {handRows.length ? (
          <div className="hand">
            {handRows.map((r) => (
              <HandCard key={r.id} card={r} relics={b.relics} boss={!!c?.enemy.boss} disabled={busy || enemyDead} onPlay={() => { sfx.tap(); if (tierOf(r) > r.tierSeen) setAscending(r); else setActive(r); }} />
            ))}
          </div>
        ) : queue && !queue.length && !practice ? (
          <DoneForNow nextLearn={nextLearn} onPractice={() => setPractice(true)} />
        ) : (
          <div className="hand muted center small" style={{ alignItems: 'center' }}>Drawing cards…</div>
        )}
      </div>
      <div className="chatlog" ref={logRef} aria-live="polite">
        {world.log.map((l, i) => (
          <div key={i} className={l.tone}>{l.text}</div>
        ))}
      </div>

      {active && (
        <div className="modal-back">
          <div className="modal">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="pill"><Sprite name={EFFECTS[active.effect].icon} size={16} /> {EFFECTS[active.effect].name} · {TIER_NAMES[tierOf(active)]}</span>
              {!busy && <button className="btn small stone" onClick={() => setActive(null)}>Back</button>}
            </div>
            {onPractice && <div className="small muted center">Practice card: your schedule isn’t touched.</div>}
            <ReviewPanel card={active} onGrade={onGrade} busy={busy} showIntervals={!onPractice} />
          </div>
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
      {tierUp && <TierUpModal card={tierUp.card} tier={tierUp.tier} onPick={pickEffect} />}
      {ascending && (
        <TierUpModal
          card={ascending}
          tier={tierOf(ascending)}
          onPick={async (e) => {
            const tier = tierOf(ascending);
            await setCardEffect(ascending.id!, e, tier);
            app.toast(`${TIER_NAMES[tier]} card empowered.`);
            const fresh = { ...ascending, effect: e, tierSeen: tier };
            const inHand = cards.has(fresh.id!);
            if (inHand) setCards((m) => new Map(m).set(fresh.id!, fresh));
            const rest = pending.filter((p) => p.id !== fresh.id);
            setPending(rest);
            // from the hand: go straight on to playing it; from the Ascend button: offer the next card
            setAscending(inHand ? null : rest[0] ?? null);
            if (inHand) setActive(fresh);
          }}
        />
      )}
    </div>
  );
}
