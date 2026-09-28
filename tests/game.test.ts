import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { AREA_BY_ID, FORGING, SEEDS, SMELTING } from '../src/game/activities';
import { ADVENTURER } from '../src/game/classes';
import { comboMultiplier, playCard, startCombat, type PlayInput } from '../src/game/combat';
import { tierUpChoices } from '../src/game/effects';
import { intentFor, type EnemyState } from '../src/game/enemies';
import { ITEMS } from '../src/game/items';
import { EMPTY_XP, levelForXp, levels, XP_TABLE } from '../src/game/skills';
import * as W from '../src/game/world';
import { metaRefund } from '../src/core/profile';

const seq = (...xs: number[]) => {
  let i = 0;
  return () => xs[i++ % xs.length];
};
const lvAt = (over: Partial<Record<string, number>> = {}) => ({ ...levels(EMPTY_XP), ...over }) as ReturnType<typeof levels>;

function enemy(over: Partial<EnemyState> = {}): EnemyState {
  const e: EnemyState = { id: 'rat', name: 'Rat', sprite: 'rat', hp: 50, maxHp: 50, block: 0, atk: 4, poison: 0, patternIdx: 0, pattern: ['attack'], intent: { kind: 'attack', value: 4 }, boss: false, ...over };
  e.intent = intentFor(e);
  return e;
}
const base: PlayInput = { effect: 'attack', tier: 1, grade: 3, wasNew: false, cls: ADVENTURER, relics: [], dmgMult: 1, reduction: 0, fast: false };

describe('combat rules', () => {
  it('grades scale power: Easy crits, Hard is weak, Again misses and gives a free hit', () => {
    const s = startCombat({ hp: 40, maxHp: 40, block: 0 }, enemy(), [], 0, false);
    const dmg = (g: 1 | 2 | 3 | 4) => 50 - playCard(s, { ...base, grade: g }).state.enemy.hp;
    expect(dmg(3)).toBe(5);
    expect(dmg(2)).toBeLessThan(dmg(3));
    expect(dmg(4)).toBeGreaterThan(dmg(3));
    const miss = playCard(s, { ...base, grade: 1 });
    expect(miss.state.enemy.hp).toBe(50);
    expect(miss.state.player.hp).toBe(40 - 3 - 4);
  });

  it('gear and skills scale damage dealt and taken', () => {
    const s = startCombat({ hp: 40, maxHp: 40, block: 0 }, enemy(), [], 0, false);
    expect(50 - playCard(s, { ...base, dmgMult: 2 }).state.enemy.hp).toBe(10);
    expect(playCard(s, { ...base, reduction: 0.5 }).state.player.hp).toBe(38);
  });

  it('combo builds on correct answers and resets on Again', () => {
    let s = startCombat({ hp: 99, maxHp: 99, block: 0 }, enemy({ hp: 999, maxHp: 999 }), [], 0, false);
    s = playCard(s, base).state;
    s = playCard(s, base).state;
    expect(s.combo).toBe(2);
    expect(comboMultiplier(2, ADVENTURER)).toBeCloseTo(1.1);
    s = playCard(s, { ...base, grade: 1 }).state;
    expect(s.combo).toBe(0);
  });

  it('death ward saves once', () => {
    const s = startCombat({ hp: 1, maxHp: 30, block: 0 }, enemy({ atk: 10 }), [], 0, false);
    const ward: PlayInput = { ...base, relics: ['deathward'] };
    const r = playCard(s, ward);
    expect(r.state.player.hp).toBe(1);
    expect(playCard(r.state, ward).events.some((e) => e.t === 'playerDied')).toBe(true);
  });

  it('tier-up offers three distinct effects featuring the new rarity', () => {
    const c = tierUpChoices(3, 'attack');
    expect(new Set(c).size).toBe(3);
    expect(['meteor', 'phoenix', 'soulrend', 'plague']).toContain(c[0]);
  });
});

describe('skills', () => {
  it('uses the classic exponential xp curve', () => {
    expect(XP_TABLE[2]).toBe(83);
    expect(XP_TABLE[99]).toBe(13_034_431);
    expect(levelForXp(1154)).toBe(10);
  });
});

describe('gathering and crafting', () => {
  it('each card gathers one resource with the right tool; mature cards can double it', () => {
    const w = W.newWorld(40);
    w.active = { kind: 'gather', id: 'rock-copper' };
    const lv = lvAt();
    const r = W.performAction(w, lv, 1, seq(0.99, 0.99, 0.99, 0.99, 0.99));
    expect(r.ok).toBe(true);
    expect(r.items).toEqual({ 'ore-copper': 1 });
    expect(r.xp).toEqual({ mining: 25 });
    // Legendary card: 50% + tool 5% double chance
    const d = W.performAction(w, lv, 3, seq(0.5, 0.99, 0.99, 0.99, 0.99));
    expect(d.items['ore-copper']).toBe(2);
    expect(w.bank['ore-copper']).toBe(3);
  });

  it('gathering is blocked without a tool or the level', () => {
    const w = W.newWorld(40);
    delete w.bank['bronze-pickaxe'];
    w.active = { kind: 'gather', id: 'rock-copper' };
    expect(W.checkActive(w, lvAt())).toMatch(/pickaxe/);
    w.bank['bronze-pickaxe'] = 1;
    w.active = { kind: 'gather', id: 'rock-iron' };
    expect(W.checkActive(w, lvAt())).toMatch(/level 10/);
  });

  it('better tools only count once you have the level to use them', () => {
    const w = W.newWorld(40);
    w.bank['rune-pickaxe'] = 1;
    expect(W.bestTool(w, 'pickaxe', lvAt())!.id).toBe('bronze-pickaxe');
    expect(W.bestTool(w, 'pickaxe', lvAt({ mining: 45 }))!.id).toBe('rune-pickaxe');
  });

  it('cooking and forging consume their inputs', () => {
    const w = W.newWorld(40);
    w.bank['raw-shrimp'] = 2;
    w.active = { kind: 'cook', id: 'cook-shrimp' };
    expect(W.performAction(w, lvAt(), 0).ok).toBe(true);
    expect(w.bank['raw-shrimp']).toBe(1);
    expect(w.bank['cooked-shrimp']).toBe(1);
    const body = FORGING.find((f) => f.id === 'forge-bronze-body')!;
    w.bank['bar-bronze'] = 2;
    w.active = { kind: 'forge', id: body.id };
    expect(W.performAction(w, lvAt({ smithing: 10 }), 0).ok).toBe(false);
    w.bank['bar-bronze'] = 3;
    expect(W.performAction(w, lvAt({ smithing: 10 }), 0).items).toEqual({ 'bronze-body': 1 });
    expect(w.bank['bar-bronze']).toBeUndefined();
  });

  it('the furnace smelts in real time, burning ore and one log per bar', () => {
    const w = W.newWorld(40);
    Object.assign(w.bank, { 'ore-copper': 5, 'ore-tin': 5, 'log-normal': 3 });
    const lv = lvAt();
    expect(W.maxSmeltable(w, 'smelt-bronze', lv)).toBe(3); // limited by logs
    expect(W.startSmelt(w, 'smelt-bronze', 3, lv, 2, 0)).toBe(true);
    expect(w.bank['log-normal']).toBeUndefined();
    expect(w.bank['ore-copper']).toBe(2);
    const each = w.furnace!.msEach;
    expect(each).toBe(SMELTING[0].msEach * 0.8); // mature card: 20% faster
    expect(W.tickFurnace(w, each - 1)).toBeNull();
    expect(W.tickFurnace(w, each * 2)).toMatchObject({ bars: 2 });
    expect(W.tickFurnace(w, each * 10)).toMatchObject({ bars: 1 });
    expect(w.bank['bar-bronze']).toBe(3);
    expect(w.furnace).toBeNull();
  });

  it('crops grow in real time and a mature planting card boosts the harvest', () => {
    const w = W.newWorld(40);
    const s = SEEDS[0];
    expect(W.plant(w, 0, s.id, lvAt(), 3, 0)).toBe(true);
    expect(W.harvest(w, 0, s.growMs - 1)).toBeNull();
    const h = W.harvest(w, 0, s.growMs, () => 0)!;
    expect(h.qty).toBe(Math.round(4 * 1.75));
    expect(w.bank[s.crop]).toBe(h.qty);
    expect(w.plots[0]).toBeNull();
  });
});

describe('combat trips', () => {
  it('kills drop loot and gold and count toward the boss', () => {
    const w = W.newWorld(40);
    const area = AREA_BY_ID.graveyard;
    W.startTrip(w, area, () => 0);
    w.combat!.enemy.hp = 1;
    const r = W.combatPlay(w, lvAt(), 40, { effect: 'attack', tier: 1, wasNew: false }, 3, false, () => 0);
    expect(r.killed).toBe(true);
    expect(r.gold).toBeGreaterThan(0);
    expect(r.loot.bones).toBe(1);
    expect(w.bank.bones).toBe(1);
    expect(w.bossProgress.graveyard).toBe(1);
    expect(r.xp.attack).toBeGreaterThan(0);
  });

  it('style decides which skill gets damage xp', () => {
    const w = W.newWorld(40);
    w.style = 'strength';
    W.startTrip(w, AREA_BY_ID.graveyard, () => 0);
    const r = W.combatPlay(w, lvAt(), 40, { effect: 'attack', tier: 1, wasNew: false }, 3, false, () => 0.99);
    expect(r.xp.strength).toBeGreaterThan(0);
    expect(r.xp.attack).toBeUndefined();
  });

  it('dying ends the trip and wakes you at half health', () => {
    const w = W.newWorld(40);
    w.active = { kind: 'combat', id: 'graveyard' };
    W.startTrip(w, AREA_BY_ID.graveyard, () => 0);
    w.hp = 1;
    const r = W.combatPlay(w, lvAt(), 40, { effect: 'heal', tier: 0, wasNew: false }, 1, false, () => 0.99);
    expect(r.died).toBe(true);
    expect(w.combat).toBeNull();
    expect(w.active).toBeNull();
    expect(w.hp).toBe(20);
  });

  it('equipment needs the level, and gear feeds combat bonuses', () => {
    const w = W.newWorld(40);
    w.bank['rune-sword'] = 1;
    expect(W.equip(w, 'rune-sword', lvAt())).toBe(false);
    expect(W.equip(w, 'rune-sword', lvAt({ attack: 45 }))).toBe(true);
    w.bank['relic-goldtooth'] = 1;
    W.equip(w, 'relic-goldtooth', lvAt());
    const b = W.bonuses(w, lvAt({ attack: 45 }));
    expect(b.weaponDmg).toBe(ITEMS['rune-sword'].equip!.dmg);
    expect(b.relics).toContain('goldtooth');
  });

  it('auto-eats below a third of max HP', () => {
    const w = W.newWorld(40);
    w.hp = 10;
    expect(W.autoEat(w, 40)).toBeGreaterThan(0);
    expect(w.hp).toBeGreaterThanOrEqual(13);
  });

  it('HP regenerates out of combat in real time', () => {
    const w = W.newWorld(40, 0);
    w.hp = 10;
    W.regen(w, 40, W.REGEN_MS * 5);
    expect(w.hp).toBe(15);
  });
});

describe('migration', () => {
  it('refunds gold spent on retired upgrades', () => {
    expect(metaRefund({ vitality: 2, relicseeker: 1 })).toBe(100 + 200 + 500);
  });
});
