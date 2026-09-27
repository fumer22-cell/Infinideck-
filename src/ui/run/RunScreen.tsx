import { useCallback, useEffect, useRef, useState } from 'react';
import { db } from '../../core/db';
import { addXp, type LevelUp } from '../../core/profile';
import { isLeech, nextLearningDue, reviewCard, State, TIER_NAMES, tierOf } from '../../core/srs';
import type { CardRow, EffectId, Tier } from '../../core/types';
import { CLASSES } from '../../game/classes';
import { playCard, type CombatEvent } from '../../game/combat';
import { EFFECTS } from '../../game/effects';
import { RELICS, type RelicId } from '../../game/relics';
import { beginFight, clearRun, endOfQueue, FIGHTS_PER_REST, fillHand, loadRun, pushLog, relicChoices, saveRun, type RunState } from '../../game/run';
import { goldMult, levels } from '../../game/skills';
import { SCHOLARSHIP_XP } from '../../core/profile';
import { checkQueueCleared, setCardEffect } from '../actions';
import { Sprite } from '../common';
import { useApp } from '../context';
import { FAST_MS, ReviewPanel } from '../ReviewPanel';
import { sfx } from '../sfx';
import { TierUpModal } from '../TierUp';
import { Arena, type Fx } from './Arena';
import { HandCard } from './HandCard';
import { BossReward, DeathScreen, MenuModal, RestStop, Shop, VictoryScreen, WaitingScreen } from './Phases';

let fxSeq = 0;

export function RunScreen() {
  const app = useApp();
  const { settings } = app;
  const [run, setRunState] = useState<RunState | null>(null);
  const runRef = useRef<RunState | null>(null);
  const [cards, setCards] = useState<Map<number, CardRow>>(new Map());
  const [active, setActive] = useState<CardRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [fx, setFx] = useState<Fx[]>([]);
  const [enemyHurt, setEnemyHurt] = useState(false);
  const [playerHurt, setPlayerHurt] = useState(false);
  const [enemyDead, setEnemyDead] = useState(false);
  const [tierUp, setTierUp] = useState<{ card: CardRow; tier: Tier } | null>(null);
  const [menu, setMenu] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  const setRun = useCallback(async (r: RunState) => {
    runRef.current = r;
    setRunState(r);
    await saveRun(r);
    const rows = await db.cards.bulkGet(r.hand);
    setCards(new Map(rows.filter((c): c is CardRow => !!c).map((c) => [c.id!, c])));
  }, []);

  // load / resume
  useEffect(() => {
    void (async () => {
      const r = await loadRun();
      if (!r) {
        app.go({ name: 'town' });
        return;
      }
      if (r.phase === 'fight' && !r.combat) {
        const started = await beginFight(r, settings, app.profile);
        if (started.combat?.enemy.boss) sfx.boss();
        await setRun(started);
      } else await setRun(r);
    })();
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [run?.log.length]);

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

  /** Turn combat events into splats, sounds and chat lines. */
  const animate = (events: CombatEvent[], r: RunState): number => {
    const items: Omit<Fx, 'id'>[] = [];
    let t = 0;
    const jitter = () => Math.random() * 16 - 8;
    for (const e of events) {
      switch (e.t) {
        case 'enemyDmg':
          items.push({ kind: 'splat', target: 'enemy', text: String(e.amount), cls: e.amount === 0 ? 'zero' : e.crit ? 'crit' : '', x: 44 + jitter(), y: 28 + jitter(), delay: t });
          if (e.amount > 0) flash('enemy', t);
          setTimeout(() => (e.amount === 0 ? sfx.miss() : e.crit ? sfx.crit() : sfx.hit()), t);
          pushLog(r, e.amount === 0 ? 'Your blow is turned aside.' : `You hit ${r.combat!.enemy.name} for ${e.amount}${e.crit ? ' — critical!' : '.'}`, 'dmg');
          t += 280;
          break;
        case 'playerDmg':
          items.push({ kind: 'splat', target: 'player', text: String(e.amount), cls: e.amount === 0 ? 'zero' : '', x: 8 + jitter() / 2, y: 70, delay: t });
          if (e.amount > 0) flash('player', t);
          setTimeout(() => (e.amount ? sfx.hurt() : sfx.shield()), t);
          pushLog(r, e.amount ? `You take ${e.amount} damage.` : 'Your guard holds!', e.amount ? 'bad' : 'info');
          t += 280;
          break;
        case 'heal':
          if (e.amount > 0) {
            items.push({ kind: 'splat', target: 'player', text: `+${e.amount}`, cls: 'heal', x: 12, y: 66, delay: t });
            setTimeout(sfx.heal, t);
            pushLog(r, `You recover ${e.amount} HP.`, 'heal');
            t += 200;
          }
          break;
        case 'block':
          items.push({ kind: 'splat', target: 'player', text: `+${e.amount}`, cls: 'block', x: 16, y: 62, delay: t });
          setTimeout(sfx.shield, t);
          pushLog(r, `You raise a ward of ${e.amount}.`, 'info');
          t += 200;
          break;
        case 'poison':
          items.push({ kind: 'splat', target: 'enemy', text: `${e.amount}`, cls: 'poison', x: 52 + jitter(), y: 32, delay: t });
          setTimeout(sfx.poison, t);
          pushLog(r, `Venom seeps in (${e.amount}).`, 'dmg');
          t += 200;
          break;
        case 'draw':
          pushLog(r, 'Insight: you draw another card.', 'info');
          break;
        case 'enemyBlock':
          setTimeout(sfx.shield, t);
          break;
        case 'enemyBuff':
          break;
        case 'miss':
          items.push({ kind: 'splat', target: 'enemy', text: '0', cls: 'zero', x: 44, y: 28, delay: t });
          setTimeout(sfx.miss, t);
          t += 250;
          break;
        case 'deathWard':
          setTimeout(sfx.heal, t);
          break;
        case 'enemyDied':
          setTimeout(sfx.kill, t);
          break;
        case 'playerDied':
          break;
        case 'log':
          pushLog(r, e.text, e.tone);
          break;
      }
    }
    addFx(items);
    return t;
  };

  const xpFx = (gains: Record<string, number>) => {
    const icons: Record<string, string> = { attack: 'sword', defence: 'shield', hitpoints: 'heart', scholarship: 'book' };
    const items: Omit<Fx, 'id'>[] = [];
    let i = 0;
    for (const [k, v] of Object.entries(gains)) {
      if (v < 1) continue;
      items.push({ kind: 'xp', target: 'player', text: `+${Math.round(v)}`, icon: icons[k], x: 0, y: 44 + i * 7, delay: i * 120 });
      i++;
    }
    addFx(items);
  };

  const grantXp = async (gains: { attack?: number; defence?: number; hitpoints?: number; scholarship?: number }, r: RunState): Promise<LevelUp[]> => {
    xpFx(gains);
    const ups = await app.updateProfile((p) => addXp(p, gains));
    const hpUps = ups.filter((u) => u.skill === 'hitpoints').length;
    if (hpUps && r.combat) {
      r.combat.player.maxHp += 2 * hpUps;
      r.combat.player.hp += 2 * hpUps;
    }
    for (const u of ups) {
      const name = u.skill[0].toUpperCase() + u.skill.slice(1);
      pushLog(r, `Congratulations, you just advanced ${/^[AEIOU]/.test(name) ? 'an' : 'a'} ${name} level! (${u.level})`, 'xp');
    }
    if (ups.length) app.celebrate(ups);
    return ups;
  };

  const killGold = (r: RunState, boss: boolean) => {
    const lv = levels(app.profile.xp);
    const base = boss ? 40 + r.fight * 4 : 6 + r.fight;
    const mult = goldMult(lv.scholarship) * (1 + (app.profile.meta.treasure ?? 0) * 0.1) * (r.relics.includes('goldtooth') ? 1.25 : 1) * (r.mode === 'endless' ? 0.5 : 1);
    return Math.max(1, Math.round(base * mult));
  };

  const onGrade = async (grade: 1 | 2 | 3 | 4, revealMs: number) => {
    const r0 = runRef.current;
    const card = active;
    if (!r0 || !r0.combat || !card || busy) return;
    setBusy(true);
    try {
      let r: RunState = structuredClone(r0);
      const tier = tierOf(card);
      const wasNew = card.state === State.New;
      let tierAfter: Tier | null = null;
      let after: CardRow | null = null;

      if (r.mode === 'dungeon') {
        try {
          const out = await reviewCard(card.id!, grade, Date.now(), { dayStartHour: settings.dayStartHour, retention: settings.retention });
          tierAfter = out.tierAfter;
          after = out.after;
        } catch (err) {
          // Card stopped being due (e.g. the study day rolled over). Drop it, never grade early.
          console.warn(err);
          r.hand = r.hand.filter((id) => id !== card.id);
          pushLog(r, 'That memory fades back into the dark (no longer due).', 'info');
          setActive(null);
          await setRun(await fillHand(r, settings));
          return;
        }
      }
      setActive(null);
      r.stats.reviews++;
      if (grade > 1) r.stats.correct++;

      const lv = levels(app.profile.xp);
      const fast = settings.speedBonus && !wasNew && grade > 1 && revealMs < FAST_MS;
      if (fast) pushLog(r, 'Swift recall! +25% power.', 'gold');
      const res = playCard(r.combat!, { effect: card.effect, tier, grade, wasNew, cls: CLASSES[r.cls], relics: r.relics, attackLevel: lv.attack, defenceLevel: lv.defence, fast });
      r.combat = res.state;
      r.deathWardUsed = res.state.deathWardUsed;
      r.hand = r.hand.filter((id) => id !== card.id);
      const animMs = animate(res.events, r);

      const scholarship = r.mode === 'dungeon' ? SCHOLARSHIP_XP[grade] * (1 + tier * 0.25) : 0;
      await grantXp({ ...res.xp, scholarship }, r);
      if (r.mode === 'dungeon') await app.updateProfile((p) => void p.stats.reviews++);
      r.player = { ...r.combat.player };

      if (after && tierAfter != null && tierAfter > card.tierSeen) setTierUp({ card: after, tier: tierAfter });

      const died = res.events.some((e) => e.t === 'playerDied');
      const killed = res.events.some((e) => e.t === 'enemyDied');

      if (died) {
        r.phase = 'dead';
        const kept = Math.floor(r.gold / 2);
        await app.updateProfile((p) => {
          p.gold += kept;
          p.stats.deaths++;
        });
        pushLog(r, `You have fallen. ${kept} gold is salvaged from your corpse.`, 'bad');
        setTimeout(sfx.death, animMs);
        await setRun(r);
        return;
      }

      if (killed) {
        const enemy = r.combat.enemy;
        const gold = killGold(r, enemy.boss);
        r.gold += gold;
        r.stats.kills++;
        pushLog(r, `${enemy.name} is slain! +${gold} gold.`, 'gold');
        setTimeout(sfx.coin, animMs + 200);
        if (r.relics.includes('bloodvial')) {
          r.player.hp = Math.min(r.player.maxHp, r.player.hp + 3);
          pushLog(r, 'The Blood Vial restores 3 HP.', 'heal');
        }
        setEnemyDead(true);
        await new Promise((ok) => setTimeout(ok, Math.max(700, animMs + 300)));
        setEnemyDead(false);
        r.player.block = 0;
        if (enemy.boss) {
          r.bossBeaten = true;
          await app.updateProfile((p) => void p.stats.bosses++);
          // Beating the boss clears leech status (game flag only; scheduling untouched).
          for (const id of r.leechesFaced) {
            const c = await db.cards.get(id);
            if (c && isLeech(c)) await db.cards.update(id, { leechBase: c.lapses });
          }
          if (r.leechesFaced.length) pushLog(r, `${r.leechesFaced.length} leech${r.leechesFaced.length > 1 ? 'es are' : ' is'} purged from your mind.`, 'heal');
          r.leechesFaced = [];
          r.combat = null;
          r.phase = 'bossReward';
          r.choices = relicChoices(r.relics);
          sfx.victory();
          await setRun(r);
          return;
        }
        r.combat = null;
        r.fightsSinceRest++;
        if (r.fightsSinceRest >= FIGHTS_PER_REST) {
          r.fightsSinceRest = 0;
          r.phase = 'rest';
          pushLog(r, 'You find a quiet alcove with a guttering fire.', 'info');
          await setRun(r);
          return;
        }
        const next = await beginFight(r, settings, app.profile);
        if (next.combat?.enemy.boss) sfx.boss();
        await setRun(next);
        return;
      }

      // both still standing: draw
      const draws = res.events.filter((e) => e.t === 'draw').length;
      r = await fillHand(r, settings, draws);
      if (!r.hand.length && r.combat) {
        const foe = r.combat.enemy;
        r = await endOfQueue(r);
        if (r.phase === 'waiting') pushLog(r, `Your hand is empty. ${foe.name} circles, waiting...`, 'info');
        else pushLog(r, foe.boss ? `${foe.name} retreats into the shadows...` : `${foe.name} flees into the darkness.`, 'info');
      }
      await setRun(r);
    } finally {
      setBusy(false);
    }
  };

  const pickTierEffect = async (e: EffectId) => {
    if (!tierUp) return;
    await setCardEffect(tierUp.card.id!, e, tierUp.tier);
    setTierUp(null);
    const r = runRef.current;
    if (r) {
      pushLog(r, `A card ascends to ${TIER_NAMES[tierUp.tier]}: ${EFFECTS[e].name}!`, 'gold');
      await setRun({ ...r });
    }
  };

  // ---------- phase actions ----------
  const continueDelve = async (r: RunState) => {
    const next = await beginFight({ ...r, phase: 'fight' }, settings, app.profile);
    if (next.combat?.enemy.boss) sfx.boss();
    await setRun(next);
  };

  const rest = async () => {
    const r = structuredClone(runRef.current!);
    const pct = 0.35 + (app.profile.meta.campfire ?? 0) * 0.1;
    const heal = Math.round(r.player.maxHp * pct);
    r.player.hp = Math.min(r.player.maxHp, r.player.hp + heal);
    pushLog(r, `You rest by the fire and recover ${heal} HP.`, 'heal');
    sfx.heal();
    await continueDelve(r);
  };

  const openShop = async () => {
    const r = structuredClone(runRef.current!);
    r.phase = 'shop';
    r.choices = relicChoices(r.relics);
    r.potionBought = false;
    await setRun(r);
  };

  const discount = 1 - (app.profile.meta.bargain ?? 0) * 0.1;
  const buyRelic = async (id: RelicId) => {
    const r = structuredClone(runRef.current!);
    const cost = Math.round(RELICS[id].cost * discount);
    if (r.gold < cost) return;
    r.gold -= cost;
    r.relics.push(id);
    r.choices = r.choices.filter((x) => x !== id);
    pushLog(r, `You acquire the ${RELICS[id].name}.`, 'gold');
    sfx.coin();
    await setRun(r);
  };
  const buyPotion = async () => {
    const r = structuredClone(runRef.current!);
    const cost = Math.round(20 * discount);
    if (r.gold < cost || r.potionBought) return;
    r.gold -= cost;
    r.potionBought = true;
    r.player.hp = Math.min(r.player.maxHp, r.player.hp + 15);
    pushLog(r, 'You quaff a bitter red draught. +15 HP.', 'heal');
    sfx.heal();
    await setRun(r);
  };

  const takeBossRelic = async (id: RelicId | null) => {
    const r = structuredClone(runRef.current!);
    if (id) {
      r.relics.push(id);
      pushLog(r, `From the boss's hoard you claim the ${RELICS[id].name}.`, 'gold');
    }
    r.choices = [];
    await continueDelve(r);
  };

  const finishRun = async () => {
    const r = runRef.current!;
    if (r.phase === 'victory') {
      await app.updateProfile((p) => {
        p.gold += r.gold;
        if (!r.retreated) p.stats.victories++;
      });
      if (r.mode === 'dungeon') await checkQueueCleared(app);
    }
    await clearRun();
    app.go({ name: 'town' });
  };

  const retreat = async () => {
    const r = structuredClone(runRef.current!);
    setMenu(false);
    if (r.mode === 'endless') {
      r.phase = 'victory';
      r.retreated = true;
      pushLog(r, 'You climb back toward the light with your spoils.', 'info');
    } else {
      r.gold = Math.floor(r.gold / 2);
      r.phase = 'victory';
      r.retreated = true;
      pushLog(r, 'You flee the dungeon, dropping half your gold. Your due cards remain due.', 'bad');
    }
    await setRun(r);
  };

  const waitResume = async () => {
    const r = runRef.current!;
    const next = await nextLearningDue(Date.now());
    if (next && next > Date.now()) return;
    if (r.combat) {
      // resume the same fight with the returning learning cards
      const refilled = await fillHand({ ...r, phase: 'fight' }, settings);
      await setRun(refilled.hand.length ? refilled : await endOfQueue(refilled));
    } else await continueDelve({ ...r, phase: 'fight', combat: null });
  };

  const leaveWhileWaiting = async () => {
    const r = structuredClone(runRef.current!);
    r.phase = 'victory';
    pushLog(r, 'You leave while your freshest memories settle. They will be waiting.', 'info');
    await setRun(r);
  };

  if (!run) return <div className="screen" />;

  const handRows = run.hand.map((id) => cards.get(id)).filter((c): c is CardRow => !!c);

  return (
    <div className="run">
      <Arena
        biome={run.biome}
        combat={run.combat}
        cls={run.cls}
        relics={run.relics}
        gold={run.gold}
        fight={run.fight}
        mode={run.mode}
        fx={fx}
        enemyHurt={enemyHurt}
        playerHurt={playerHurt}
        enemyDead={enemyDead}
        onMenu={() => setMenu(true)}
        playerHp={run.player}
      />
      <div className="hand-area">
        <div className="hand">
          {run.phase === 'fight' &&
            handRows.map((c) => (
              <HandCard key={c.id} card={c} relics={run.relics} boss={!!run.combat?.enemy.boss} disabled={busy || enemyDead} onPlay={() => { sfx.tap(); setActive(c); }} />
            ))}
        </div>
      </div>
      <div className="chatlog" ref={logRef} aria-live="polite">
        {run.log.map((l, i) => (
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
            <ReviewPanel card={active} onGrade={onGrade} busy={busy} showIntervals={run.mode === 'dungeon'} />
            {run.mode === 'endless' && <div className="small muted center">Endless: grades fuel combat only — your schedule is untouched.</div>}
          </div>
        </div>
      )}

      {run.phase === 'rest' && <RestStop onRest={rest} onShop={openShop} healPct={35 + (app.profile.meta.campfire ?? 0) * 10} run={run} />}
      {run.phase === 'shop' && <Shop run={run} discount={discount} onBuy={buyRelic} onPotion={buyPotion} onLeave={() => continueDelve(structuredClone(run))} />}
      {run.phase === 'bossReward' && <BossReward choices={run.choices} onPick={takeBossRelic} />}
      {run.phase === 'waiting' && <WaitingScreen onResume={waitResume} onLeave={leaveWhileWaiting} />}
      {run.phase === 'victory' && <VictoryScreen run={run} onDone={finishRun} />}
      {run.phase === 'dead' && <DeathScreen run={run} onDone={finishRun} />}
      {menu && <MenuModal run={run} onClose={() => setMenu(false)} onRetreat={retreat} />}
      {tierUp && <TierUpModal card={tierUp.card} tier={tierUp.tier} onPick={pickTierEffect} />}
    </div>
  );
}

