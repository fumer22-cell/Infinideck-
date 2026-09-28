import { describe, expect, it } from 'vitest';
import { acceptedAnswers, checkAnswer } from '../src/core/answer';
import { SEEDS } from '../src/game/activities';
import { ITEMS, perfectOf, masterworkOf } from '../src/game/items';
import { addMastery, masteryDouble, masteryLevel, registerAnswer, REST_MS } from '../src/game/rewards';
import { EMPTY_XP, levels } from '../src/game/skills';
import * as W from '../src/game/world';

const lvAt = (over: Partial<Record<string, number>> = {}) => ({ ...levels(EMPTY_XP), ...over }) as ReturnType<typeof levels>;
const good = { grade: 3 as const, tier: 1 as const };
const miss = { grade: 1 as const, tier: 1 as const };
const never = () => 0.999; // no random bonuses
const always = () => 0; // every random bonus fires

function mining() {
  const w = W.newWorld(40, 0);
  w.active = { kind: 'gather', id: 'rock-copper' };
  return w;
}

describe('streaks and bonuses', () => {
  it('a miss gives no resource and no skill xp, and breaks the streak', () => {
    const w = mining();
    W.performAction(w, lvAt(), good, never, 1000);
    W.performAction(w, lvAt(), good, never, 2000);
    expect(w.chain).toBe(2);
    const r = W.performAction(w, lvAt(), miss, never, 3000);
    expect(r.ok).toBe(true);
    expect(r.items).toEqual({});
    expect(r.xp).toEqual({});
    expect(r.answer!.correct).toBe(false);
    expect(w.chain).toBe(0);
    expect(w.bank['ore-copper']).toBe(2);
  });

  it('Hard counts as correct', () => {
    const w = mining();
    const r = W.performAction(w, lvAt(), { grade: 2, tier: 1 }, never, 1000);
    expect(r.answer!.correct).toBe(true);
    expect(r.items['ore-copper']).toBe(1);
  });

  it('the streak adds 5% xp per answer in a row, capped at +50%', () => {
    const w = W.newWorld(40, 0);
    let res = registerAnswer(w, good, 'x', 1);
    expect(res.mult).toBe(1);
    for (let i = 0; i < 4; i++) res = registerAnswer(w, good, 'x', 2 + i);
    expect(res.mult).toBeCloseTo(1.2);
    for (let i = 0; i < 30; i++) res = registerAnswer(w, good, 'x', 10 + i);
    expect(res.mult).toBeCloseTo(1.5 + 0.1); // capped streak + Focused (all correct)
  });

  it('stacks leech, discovery, second wind, verified and Easy bonuses', () => {
    const w = W.newWorld(40, 0);
    const r = registerAnswer(w, { grade: 4, tier: 1, leech: true, discovery: true, secondWind: true, verified: true }, 'x', 1);
    expect(r.mult).toBeCloseTo(1 + 1 + 0.5 + 0.25 + 0.25 + 0.2);
    expect(r.tags).toEqual(expect.arrayContaining(['Leech slain ×2', 'Verified +25%', 'Easy +20%']));
  });

  it('time away earns rested charges worth +50% each', () => {
    const w = W.newWorld(40, 0);
    registerAnswer(w, good, 'x', 1000);
    const r = registerAnswer(w, good, 'x', 1000 + 3 * REST_MS);
    expect(r.tags).toContain('Rested +50%');
    expect(w.rested).toBe(2); // 3 earned, 1 spent
  });

  it('Focused needs 90% of the last 10+ answers right', () => {
    const w = W.newWorld(40, 0);
    for (let i = 0; i < 9; i++) registerAnswer(w, good, 'x', i);
    expect(registerAnswer(w, good, 'x', 10).tags).toContain('Focused +10%');
    registerAnswer(w, miss, 'x', 11);
    registerAnswer(w, miss, 'x', 12);
    expect(registerAnswer(w, good, 'x', 13).tags).not.toContain('Focused +10%');
  });

  it('10 in a row starts a hot streak of guaranteed double yields', () => {
    const w = mining();
    let r!: ReturnType<typeof W.performAction>;
    for (let i = 0; i < 10; i++) r = W.performAction(w, lvAt(), good, never, i);
    expect(r.answer!.milestone?.hot).toBe(5);
    const next = W.performAction(w, lvAt(), good, never, 20);
    expect(next.items['ore-copper']).toBe(2);
    expect(r.items['ore-copper']).toBe(2); // the 10th swing already hits the streak
    expect(w.hot).toBe(3);
  });

  it('25 in a row guarantees a rare find', () => {
    const w = mining();
    let r!: ReturnType<typeof W.performAction>;
    for (let i = 0; i < 25; i++) r = W.performAction(w, lvAt(), good, never, i);
    expect(Object.keys(r.items).some((id) => id.startsWith('gem-'))).toBe(true);
    expect(r.answer!.milestone?.gold).toBe(50);
  });
});

describe('skill twists', () => {
  it('fishing: a right answer can land the next fish up', () => {
    const w = W.newWorld(40, 0);
    w.active = { kind: 'gather', id: 'spot-shrimp' };
    const r = W.performAction(w, lvAt({ fishing: 5 }), good, always, 1);
    expect(r.items['raw-sardine']).toBeGreaterThan(0);
    expect(r.tags).toContain('Bigger catch!');
  });

  it('woodcutting: every 5th right answer in a row on one tree fells it', () => {
    const w = W.newWorld(40, 0);
    w.active = { kind: 'gather', id: 'tree-normal' };
    let r!: ReturnType<typeof W.performAction>;
    for (let i = 0; i < 5; i++) r = W.performAction(w, lvAt(), good, never, i);
    expect(r.tags).toContain('Timber!');
    expect(r.items['log-normal']).toBeGreaterThanOrEqual(3);
  });

  it('cooking: a miss burns the food; mastery 50 saves it', () => {
    const w = W.newWorld(40, 0);
    w.bank['raw-shrimp'] = 3;
    w.active = { kind: 'cook', id: 'cook-shrimp' };
    const r = W.performAction(w, lvAt(), miss, never, 1);
    expect(r.items).toEqual({ 'burnt-food': 1 });
    expect(w.bank['raw-shrimp']).toBe(2);
    addMastery(w, 'cook-shrimp', 40_000);
    expect(masteryLevel(w, 'cook-shrimp')).toBeGreaterThanOrEqual(50);
    W.performAction(w, lvAt(), miss, never, 2);
    expect(w.bank['raw-shrimp']).toBe(2);
  });

  it('cooking: right answers can make perfect food that heals more', () => {
    const w = W.newWorld(40, 0);
    w.bank['raw-shrimp'] = 1;
    w.active = { kind: 'cook', id: 'cook-shrimp' };
    const r = W.performAction(w, lvAt(), good, always, 1);
    expect(r.items[perfectOf('cooked-shrimp')]).toBe(1);
    expect(ITEMS[perfectOf('cooked-shrimp')].heal).toBeGreaterThan(ITEMS['cooked-shrimp'].heal!);
  });

  it('smithing: a miss cracks one bar; a right answer can forge a masterwork', () => {
    const w = W.newWorld(40, 0);
    w.bank['bar-bronze'] = 3;
    w.active = { kind: 'forge', id: 'forge-bronze-sword' };
    W.performAction(w, lvAt(), miss, never, 1);
    expect(w.bank['bar-bronze']).toBe(2);
    const r = W.performAction(w, lvAt(), good, always, 2);
    expect(r.items[masterworkOf('bronze-sword')]).toBe(1);
    expect(ITEMS[masterworkOf('bronze-sword')].equip!.dmg).toBeCloseTo(0.15);
  });

  it('smelting: a missed check turns one bar to slag; a Legendary card adds one', () => {
    const w = W.newWorld(40, 0);
    Object.assign(w.bank, { 'ore-copper': 10, 'ore-tin': 10, 'log-normal': 10 });
    expect(W.startSmelt(w, 'smelt-bronze', 4, lvAt(), 1, 0, 1)).toMatchObject({ total: 3 });
    w.furnace = null;
    expect(W.startSmelt(w, 'smelt-bronze', 4, lvAt(), 3, 0, 3)).toMatchObject({ total: 5 });
  });

  it('farming: a missed check lets weeds in', () => {
    const w = W.newWorld(40, 0);
    W.plant(w, 0, SEEDS[0].id, lvAt(), 0, 0, null, 1);
    expect(W.harvest(w, 0, SEEDS[0].growMs, () => 0.999)!.qty).toBe(Math.round(8 * 0.75));
  });

  it('mastery grows with right answers and unlocks double-yield perks', () => {
    const w = mining();
    W.performAction(w, lvAt(), good, never, 1);
    expect(w.mastery!['rock-copper']).toBe(75);
    expect(masteryDouble(25)).toBe(0.05);
    expect(masteryDouble(99)).toBe(0.25);
  });
});

describe('collection log', () => {
  it('records legendary finds and pets the first time they drop', () => {
    const w = mining();
    const r = W.performAction(w, lvAt(), good, always, 1);
    expect(r.items['leg-starmetal']).toBe(1);
    expect(r.items['pet-golem']).toBe(1);
    expect(r.firsts).toEqual(expect.arrayContaining(['leg-starmetal', 'pet-golem']));
    expect(w.collection!['leg-starmetal']).toBe(1);
  });
});

describe('typed answers', () => {
  it('accepts alternatives, ignores case, accents and punctuation', () => {
    expect(acceptedAnswers('gladius, ensis')).toEqual(expect.arrayContaining(['gladius', 'ensis']));
    expect(checkAnswer('Gladius!', 'gladius').correct).toBe(true);
    expect(checkAnswer('ensis', 'gladius; ensis').correct).toBe(true);
    expect(checkAnswer('cafe', 'Café').correct).toBe(true);
    expect(checkAnswer('to love', '<b>to love</b> (infinitive)').correct).toBe(true);
  });
  it('allows one typo on longer answers only', () => {
    expect(checkAnswer('sanguiss', 'sanguis')).toMatchObject({ correct: true, close: true });
    expect(checkAnswer('nix', 'nox').correct).toBe(false);
    expect(checkAnswer('', 'nox').correct).toBe(false);
  });
});
