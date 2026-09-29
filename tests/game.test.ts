import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { AREA_BY_ID, FORGING, SEEDS, SMELTING } from '../src/game/activities';
import { ABILITIES } from '../src/game/abilities';
import { EMPTY_XP, levelForXp, levels, XP_TABLE } from '../src/game/skills';
import * as W from '../src/game/world';
import { metaRefund } from '../src/core/profile';

const seq = (...xs: number[]) => {
  let i = 0;
  return () => xs[i++ % xs.length];
};
/** Answer Good, then finish the enemy with an attack card. */
function strikeDown(w: W.World) {
  W.combatAnswer(w, { tier: 1 }, 3);
  w.combat!.enemy.hp = 1;
  const atk = w.combat!.hand.find((c) => ABILITIES[c.id].kind === 'attack')!;
  return W.combatCard(w, lvAt(), 40, atk.uid, () => 0)!;
}
const lvAt = (over: Partial<Record<string, number>> = {}) => ({ ...levels(EMPTY_XP), ...over }) as ReturnType<typeof levels>;

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
    const r = W.performAction(w, lv, { grade: 3, tier: 1 }, seq(0.99, 0.99, 0.99, 0.99, 0.99));
    expect(r.ok).toBe(true);
    expect(r.items).toEqual({ 'ore-copper': 1 });
    expect(r.xp).toEqual({ mining: 25 });
    // Legendary card: 50% + tool 5% double chance
    const d = W.performAction(w, lv, { grade: 3, tier: 3 }, seq(0.5, 0.99, 0.99, 0.99, 0.99));
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
    expect(W.performAction(w, lvAt(), { grade: 3, tier: 0 }, () => 0.99).ok).toBe(true);
    expect(w.bank['raw-shrimp']).toBe(1);
    expect(w.bank['cooked-shrimp']).toBe(1);
    const body = FORGING.find((f) => f.id === 'forge-bronze-body')!;
    w.bank['bar-bronze'] = 2;
    w.active = { kind: 'forge', id: body.id };
    expect(W.performAction(w, lvAt({ smithing: 10 }), { grade: 3, tier: 0 }, () => 0.99).ok).toBe(false);
    w.bank['bar-bronze'] = 3;
    expect(W.performAction(w, lvAt({ smithing: 10 }), { grade: 3, tier: 0 }, () => 0.99).items).toEqual({ 'bronze-body': 1 });
    expect(w.bank['bar-bronze']).toBeUndefined();
  });

  it('the furnace smelts in real time, burning ore and one log per bar', () => {
    const w = W.newWorld(40);
    Object.assign(w.bank, { 'ore-copper': 5, 'ore-tin': 5, 'log-normal': 3 });
    const lv = lvAt();
    expect(W.maxSmeltable(w, 'smelt-bronze', lv)).toBe(3); // limited by logs
    expect(W.startSmelt(w, 'smelt-bronze', 3, lv, 2, 0)).toMatchObject({ total: 3 });
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

describe('hitpoints', () => {
  it('HP regenerates out of combat in real time', () => {
    const w = W.newWorld(40, 0);
    w.hp = 10;
    W.regen(w, 40, W.REGEN_MS * 5);
    expect(w.hp).toBe(15);
  });
});

describe('skills depend on each other', () => {
  it('better rocks need a better pickaxe, which needs smithing, which needs mining', () => {
    const w = W.newWorld(40);
    w.active = { kind: 'gather', id: 'rock-coal' };
    const lv = lvAt({ mining: 25, smithing: 20 });
    expect(W.checkActive(w, lv)).toMatch(/iron pickaxe.*2 iron bars.*Smithing 16/);
    // mine iron → smelt → forge an iron pickaxe → coal opens up
    w.bank['bar-iron'] = 2;
    w.active = { kind: 'forge', id: 'forge-iron-pickaxe' };
    expect(W.performAction(w, lv, { grade: 3, tier: 0 }, () => 0.99).ok).toBe(true);
    w.active = { kind: 'gather', id: 'rock-coal' };
    expect(W.checkActive(w, lv)).toBeNull();
  });

  it('trees and fishing spots are gated by hatchets and rods too', () => {
    const w = W.newWorld(40);
    w.active = { kind: 'gather', id: 'tree-willow' };
    expect(W.checkActive(w, lvAt({ woodcutting: 30 }))).toMatch(/iron hatchet/);
    w.active = { kind: 'gather', id: 'spot-trout' };
    expect(W.checkActive(w, lvAt({ fishing: 20 }))).toMatch(/fly rod.*willow logs/);
    w.active = { kind: 'gather', id: 'spot-lobster' };
    expect(W.checkActive(w, lvAt({ fishing: 45 }))).toMatch(/harpoon.*steel bars/);
  });

  it('better bars need hotter logs', () => {
    const w = W.newWorld(40);
    Object.assign(w.bank, { 'ore-iron': 5, 'ore-coal': 10, 'log-normal': 5 });
    const lv = lvAt({ smithing: 30 });
    expect(W.maxSmeltable(w, 'smelt-steel', lv)).toBe(0);
    w.bank['log-oak'] = 2;
    w.bank['log-willow'] = 1;
    expect(W.maxSmeltable(w, 'smelt-steel', lv)).toBe(3);
    expect(W.startSmelt(w, 'smelt-steel', 3, lv, 0, 0)).toMatchObject({ total: 3 });
    expect(w.bank['log-normal']).toBe(5); // normal logs were not burned
    expect(w.bank['log-oak']).toBeUndefined();
    expect(w.bank['log-willow']).toBeUndefined();
  });

  it('dishes combine fish with crops', () => {
    const w = W.newWorld(40);
    Object.assign(w.bank, { 'raw-trout': 1, 'crop-potato': 1 });
    w.active = { kind: 'cook', id: 'cook-pie' };
    expect(W.checkActive(w, lvAt({ cooking: 30 }))).toMatch(/potato/);
    w.bank['crop-potato'] = 2;
    expect(W.performAction(w, lvAt({ cooking: 30 }), { grade: 3, tier: 0 }, () => 0.99).items).toEqual({ 'dish-pie': 1 });
    expect(w.bank['raw-trout']).toBeUndefined();
  });

  it('bones from combat fertilise crops', () => {
    const w = W.newWorld(40);
    w.bank['big-bones'] = 1;
    W.plant(w, 0, SEEDS[0].id, lvAt(), 0, 0, 'big-bones');
    expect(w.bank['big-bones']).toBeUndefined();
    expect(W.harvest(w, 0, SEEDS[0].growMs, () => 0)!.qty).toBe(8); // 4 × (1 + 100%)
  });

  it('each area needs the key dropped by the previous boss', () => {
    const w = W.newWorld(40);
    const crypt = AREA_BY_ID.crypt;
    expect(W.areaLocked(w, crypt, 12)).toMatch(/crypt key/);
    W.startTrip(w, AREA_BY_ID.graveyard, lvAt(), () => 0);
    W.nextEnemy(w, lvAt(), () => 0, true);
    const r = strikeDown(w);
    expect(r.loot['key-crypt']).toBe(1);
    expect(W.areaLocked(w, crypt, 12)).toBeNull();
    // the key only drops once
    W.nextEnemy(w, lvAt(), () => 0, true);
    expect(strikeDown(w).loot['key-crypt']).toBeUndefined();
  });
});

describe('migration', () => {
  it('refunds gold spent on retired upgrades', () => {
    expect(metaRefund({ vitality: 2, relicseeker: 1 })).toBe(100 + 200 + 500);
  });
});
