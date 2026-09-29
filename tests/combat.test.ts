import { describe, expect, it } from 'vitest';
import { State } from 'ts-fsrs';
import { newCardRow } from '../src/core/srs';
import type { CardRow } from '../src/core/types';
import { ABILITIES, activeDeck, cardPool, combatStats, energyFor, ENERGY_CAP, HAND_SIZE, MIN_DECK, type CardInst } from '../src/game/abilities';
import { AREA_BY_ID, type MonsterDef } from '../src/game/activities';
import { answerTurn, endTurn, newFight, playFromHand, type Fight } from '../src/game/combat';
import { EMPTY_XP, levels, maxHpFor } from '../src/game/skills';
import * as W from '../src/game/world';
import { pickFlashcard } from '../src/ui/tabs/CombatView';

const lvAt = (over: Partial<Record<string, number>> = {}) => ({ ...levels(EMPTY_XP), ...over }) as ReturnType<typeof levels>;
const zero = () => 0;
const monster = (over: Partial<MonsterDef> = {}): MonsterDef => ({ id: 'dummy', name: 'Dummy', sprite: 'rat', hp: 80, atk: 4, pattern: ['attack'], gold: [1, 1], drops: [], ...over });
const stats = { power: 10, guard: 10, reduction: 0, maxHp: 40 };
const hero = () => ({ hp: 40, maxHp: 40 });

/** A fight whose hand is exactly these cards. */
function fightWith(ids: CardInst['id'][], def = monster()): Fight {
  const f = newFight([], W.spawn(def), zero);
  f.hand = ids.map((id, i) => ({ uid: i + 1, id }));
  return f;
}

describe('energy from answers', () => {
  it('Again 0, Hard 1, Good 2, Easy 3, and a mature card adds 1', () => {
    expect([1, 2, 3, 4].map((g) => energyFor(g as 1, 0))).toEqual([0, 1, 2, 3]);
    expect(energyFor(3, 2)).toBe(3);
    expect(energyFor(1, 3)).toBe(0);
  });

  it('unspent energy carries over, up to the cap', () => {
    const f = fightWith([]);
    answerTurn(f, 4, 3);
    f.phase = 'answer';
    answerTurn(f, 4, 3);
    expect(f.energy).toBe(ENERGY_CAP);
  });
});

describe('your deck is your loadout', () => {
  const l = (equip: Record<string, string> = {}, food: string | null = null, bank: Record<string, number> = {}) => ({ equip, food, bank });

  it('bare hands punch; each weapon brings its own cards', () => {
    const ids = (e: Record<string, string>) => cardPool(l(e), lvAt()).map((c) => c.id);
    expect(ids({})).toEqual(['punch', 'punch', 'punch', 'guard', 'guard']);
    expect(ids({ weapon: 'bronze-sword' })).toContain('lunge');
    expect(ids({ weapon: 'bronze-dagger' })).toContain('twinfang');
    expect(ids({ weapon: 'bronze-battleaxe' })).toContain('cleave');
  });

  it('armour, trinkets, food and techniques add cards', () => {
    const pool = cardPool(l({ weapon: 'bronze-sword', shield: 'bronze-shield', amulet: 'relic-ember' }, 'bread', { bread: 3 }), lvAt({ attack: 20 }));
    const ids = pool.map((c) => c.id);
    expect(ids).toContain('shieldbash');
    expect(ids).toContain('starfall');
    expect(ids.filter((i) => i === 'eat')).toHaveLength(2);
    expect(ids).toContain('focus');
    expect(ids).toContain('feint');
    expect(ids).not.toContain('overpower'); // Strength 30
    // no food left in the bank: no Eat cards
    expect(cardPool(l({}, 'bread', {}), lvAt()).some((c) => c.id === 'eat')).toBe(false);
  });

  it('you can switch cards off, but never below the minimum', () => {
    const lo = l({ weapon: 'bronze-sword' });
    const pool = cardPool(lo, lvAt());
    expect(activeDeck(lo, lvAt(), [pool[0].key])).toHaveLength(pool.length - 1);
    expect(activeDeck(lo, lvAt(), pool.map((c) => c.key))).toHaveLength(MIN_DECK);
  });

  it('better metal and combat levels raise power; masterworks upgrade their cards', () => {
    const p = (e: Record<string, string>, lv = lvAt()) => combatStats(l(e), lv, 40).power;
    expect(p({ weapon: 'rune-sword' })).toBeGreaterThan(p({ weapon: 'bronze-sword' }));
    expect(p({ weapon: 'bronze-sword' }, lvAt({ strength: 30 }))).toBeGreaterThan(p({ weapon: 'bronze-sword' }));
    expect(combatStats(l({ body: 'steel-body' }), lvAt(), 40).guard).toBeGreaterThan(combatStats(l({}), lvAt(), 40).guard);
    expect(cardPool(l({ weapon: 'mw-bronze-sword' }), lvAt()).filter((c) => c.plus).map((c) => c.id)).toContain('lunge');
  });
});

describe('turns', () => {
  it('a fight starts with a hand and waits for an answer', () => {
    const f = newFight(cardPool({ equip: {}, food: null, bank: {} }, lvAt()), W.spawn(monster()), zero);
    expect(f.hand).toHaveLength(HAND_SIZE);
    expect(f.phase).toBe('answer');
    expect(playFromHand(f, hero(), f.hand[0].uid, stats, { foodHeal: 0 }, zero)).toBeNull();
  });

  it('cards cost energy; attacks hurt and blocks soak the enemy’s hit', () => {
    const f = fightWith(['punch', 'guard', 'lunge']);
    answerTurn(f, 3, 0); // 2 energy
    const h = hero();
    expect(playFromHand(f, h, 1, stats, { foodHeal: 0 }, zero)!.dealt).toBe(10);
    expect(f.enemy.hp).toBe(90);
    playFromHand(f, h, 2, stats, { foodHeal: 0 }, zero);
    expect(f.block).toBe(10);
    expect(playFromHand(f, h, 3, stats, { foodHeal: 0 }, zero)).toBeNull(); // no energy left
    const r = endTurn(f, h, stats, zero);
    expect(h.hp).toBe(40); // 4 damage into 10 block
    expect(r.absorbed).toBe(4);
    expect(f.phase).toBe('answer');
    expect(f.block).toBe(0);
  });

  it('Again gives no energy but the enemy still acts', () => {
    const f = fightWith(['punch']);
    answerTurn(f, 1, 3);
    expect(f.energy).toBe(0);
    const h = hero();
    endTurn(f, h, stats, zero);
    expect(h.hp).toBe(36);
  });

  it('stunning a wind-up cancels the heavy blow; bosses are weakened instead', () => {
    const f = fightWith(['shieldbash'], monster({ pattern: ['windup', 'heavy', 'attack'] }));
    answerTurn(f, 3, 0);
    playFromHand(f, hero(), 1, stats, { foodHeal: 0 }, zero);
    const h = hero();
    endTurn(f, h, stats, zero);
    expect(h.hp).toBe(40);
    expect(f.enemy.intent.kind).toBe('attack');

    const b = fightWith(['shieldbash'], monster({ boss: true }));
    answerTurn(b, 3, 0);
    playFromHand(b, hero(), 1, stats, { foodHeal: 0 }, zero);
    expect(b.enemy.stunned).toBe(false);
    expect(b.enemy.weak).toBe(2);
  });

  it('focus boosts only the next attack', () => {
    const f = fightWith(['focus', 'punch', 'punch']);
    answerTurn(f, 3, 0);
    const h = hero();
    playFromHand(f, h, 1, stats, { foodHeal: 0 }, zero);
    expect(playFromHand(f, h, 2, stats, { foodHeal: 0 }, zero)!.dealt).toBe(15);
    expect(playFromHand(f, h, 3, stats, { foodHeal: 0 }, zero)!.dealt).toBe(10);
  });
});

describe('enemy traits', () => {
  it('armoured foes gain block that Cleave ignores', () => {
    const f = fightWith(['punch', 'cleave'], monster({ traits: ['armoured'] }));
    answerTurn(f, 4, 3); // 4 energy
    endTurn(f, hero(), stats, zero);
    expect(f.enemy.block).toBeGreaterThan(0);
    f.hand = [{ uid: 1, id: 'punch' }, { uid: 2, id: 'cleave' }];
    answerTurn(f, 3, 2);
    const hp = f.enemy.hp;
    playFromHand(f, hero(), 1, stats, { foodHeal: 0 }, zero);
    expect(f.enemy.hp).toBeGreaterThan(hp - 10); // block soaked some
    const before = f.enemy.hp;
    playFromHand(f, hero(), 2, stats, { foodHeal: 0 }, zero);
    expect(before - f.enemy.hp).toBe(24);
  });

  it('enrage punishes Again; regen heals; venom poisons you', () => {
    const e = fightWith([], monster({ traits: ['enrage'] }));
    answerTurn(e, 1, 0);
    expect(e.enemy.str).toBe(1);
    const r = fightWith(['punch'], monster({ traits: ['regen'] }));
    answerTurn(r, 3, 0);
    playFromHand(r, hero(), 1, stats, { foodHeal: 0 }, zero);
    endTurn(r, hero(), stats, zero);
    expect(r.enemy.hp).toBe(90 + 4);
    const v = fightWith([], monster({ traits: ['venomous'] }));
    answerTurn(v, 3, 0);
    const h = hero();
    endTurn(v, h, stats, zero);
    expect(h.hp).toBe(40 - 4 - 1); // the hit, then 1 poison at the start of your turn
  });

  it('bosses change tactics below half health', () => {
    const f = fightWith(['punch'], monster({ boss: true, pattern: ['block'], phase2: ['multi'] }));
    f.enemy.hp = 40;
    answerTurn(f, 3, 0);
    endTurn(f, hero(), stats, zero);
    expect(f.enemy.enraged).toBe(true);
    expect(f.enemy.intent.kind).toBe('multi');
  });
});

describe('combat trips', () => {
  const setup = (over: Partial<W.World> = {}) => {
    const w = { ...W.newWorld(40), ...over };
    w.active = { kind: 'combat', id: 'graveyard' };
    W.startTrip(w, AREA_BY_ID.graveyard, lvAt(), zero);
    return w;
  };
  const attackUid = (w: W.World) => w.combat!.hand.find((c) => ABILITIES[c.id].kind === 'attack')!.uid;

  it('kills drop loot and gold, count toward the boss, and train your style', () => {
    const w = setup();
    w.style = 'strength';
    W.combatAnswer(w, { tier: 1 }, 3);
    w.combat!.enemy.hp = 1;
    const r = W.combatCard(w, lvAt(), 40, attackUid(w), zero)!;
    expect(r.killed).toBe(true);
    expect(r.gold).toBeGreaterThan(0);
    expect(w.bossProgress.graveyard).toBe(1);
    expect(r.xp.strength).toBeGreaterThan(0);
    expect(r.xp.attack).toBeUndefined();
  });

  it('streak bonuses multiply combat xp', () => {
    const w = setup({ chain: 20 });
    W.combatAnswer(w, { tier: 1 }, 3);
    expect(w.combat!.mult).toBeCloseTo(1.5); // the +50% streak cap
  });

  it('eating uses up food from your bank', () => {
    const w = setup();
    w.hp = 10;
    w.combat!.hand = [{ uid: 99, id: 'eat', food: 'bread' }];
    W.combatAnswer(w, { tier: 1 }, 3);
    W.combatCard(w, lvAt(), 40, 99, zero);
    expect(w.hp).toBe(13);
    expect(w.bank.bread).toBe(4);
  });

  it('dying ends the trip and wakes you at half health', () => {
    const w = setup();
    w.hp = 1;
    W.combatAnswer(w, { tier: 1 }, 1);
    const r = W.combatEndTurn(w, lvAt(), 40, zero);
    expect(r.died).toBe(true);
    expect(w.combat).toBeNull();
    expect(w.active).toBeNull();
    expect(w.hp).toBe(20);
  });

  it('bosses pull due leeches up first and remember them', () => {
    const card = (id: number, over: Partial<CardRow> = {}): CardRow => ({ ...newCardRow(1, `q${id}`, 'a', 'attack', 0), id, state: State.Review, ...over });
    const q = [card(1), card(2, { lapses: 6 })];
    expect(pickFlashcard(q, false)!.id).toBe(1);
    expect(pickFlashcard(q, true)!.id).toBe(2);
    const w = setup();
    W.nextEnemy(w, lvAt(), zero, true);
    W.combatAnswer(w, { id: 2, tier: 1 }, 3, { leech: true });
    expect(w.combat!.leeches).toEqual([2]);
  });

  it('old saves drop their card-effect trip', () => {
    const w = W.newWorld(maxHpFor(10));
    w.combat = { area: 'graveyard', hand: [1, 2], combo: 2 } as unknown as W.CombatSession;
    expect(W.migrateWorld(w).combat).toBeNull();
  });
});
