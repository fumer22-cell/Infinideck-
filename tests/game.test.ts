import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { State } from 'ts-fsrs';
import { db } from '../src/core/db';
import { DEFAULT_PROFILE } from '../src/core/profile';
import { DEFAULT_SETTINGS } from '../src/core/settings';
import { newCardRow } from '../src/core/srs';
import type { CardRow } from '../src/core/types';
import { CLASSES } from '../src/game/classes';
import { comboMultiplier, playCard, startCombat, type PlayInput } from '../src/game/combat';
import { intentFor, spawnEnemy, type EnemyState } from '../src/game/enemies';
import { beginFight, fillHand, startRun } from '../src/game/run';
import { levelForXp, XP_TABLE } from '../src/game/skills';
import { tierUpChoices } from '../src/game/effects';

const DAY = 86_400_000;

function enemy(over: Partial<EnemyState> = {}): EnemyState {
  const e: EnemyState = { id: 'rat', name: 'Rat', sprite: 'rat', hp: 50, maxHp: 50, block: 0, atk: 4, poison: 0, patternIdx: 0, pattern: ['attack'], intent: { kind: 'attack', value: 4 }, boss: false, ...over };
  e.intent = intentFor(e);
  return e;
}
const base: PlayInput = { effect: 'attack', tier: 1, grade: 3, wasNew: false, cls: CLASSES.cleric, relics: [], attackLevel: 1, defenceLevel: 1, fast: false };

describe('combat rules', () => {
  it('grades scale power: Easy crits, Hard is weak, Again misses and gives a free hit', () => {
    const s = startCombat({ hp: 40, maxHp: 40, block: 0 }, enemy(), [], 0, false);
    const dmg = (g: 1 | 2 | 3 | 4) => 50 - playCard(s, { ...base, grade: g }).state.enemy.hp;
    expect(dmg(3)).toBe(5);
    expect(dmg(2)).toBeLessThan(dmg(3));
    expect(dmg(4)).toBeGreaterThan(dmg(3));
    const miss = playCard(s, { ...base, grade: 1 });
    expect(miss.state.enemy.hp).toBe(50);
    // free hit (ceil(4*0.5)+1 = 3) plus the enemy's normal attack (4)
    expect(miss.state.player.hp).toBe(40 - 3 - 4);
    expect(miss.events.filter((e) => e.t === 'playerDmg')).toHaveLength(2);
  });

  it('combo builds on correct answers and resets on Again', () => {
    let s = startCombat({ hp: 99, maxHp: 99, block: 0 }, enemy({ hp: 999, maxHp: 999 }), [], 0, false);
    s = playCard(s, base).state;
    s = playCard(s, base).state;
    expect(s.combo).toBe(2);
    expect(comboMultiplier(3, CLASSES.rogue)).toBeGreaterThan(comboMultiplier(3, CLASSES.warrior));
    s = playCard(s, { ...base, grade: 1 }).state;
    expect(s.combo).toBe(0);
  });

  it('block absorbs damage, poison ticks, and relics apply', () => {
    let s = startCombat({ hp: 30, maxHp: 30, block: 0 }, enemy(), ['ironskin'], 0, false);
    expect(s.player.block).toBe(4);
    s = playCard(s, { ...base, effect: 'poison', relics: ['ironskin'] }).state;
    expect(s.enemy.hp).toBeLessThan(50); // poison ticked on the enemy turn
    expect(s.player.hp).toBe(30); // 4 damage fully blocked
    const twin = startCombat({ hp: 30, maxHp: 30, block: 0 }, enemy(), ['twinstrike'], 0, false);
    const first = playCard(twin, { ...base, relics: ['twinstrike'] }).state;
    expect(50 - first.enemy.hp).toBe(10);
    expect(50 - playCard(first, { ...base, relics: ['twinstrike'] }).state.enemy.hp).toBe(10 + Math.round(5 * 1.1)); // second card: single hit with x1.1 combo
  });

  it('death ward saves once', () => {
    const s = startCombat({ hp: 1, maxHp: 30, block: 0 }, enemy({ atk: 10 }), ['deathward'], 0, false);
    const ward: PlayInput = { ...base, relics: ['deathward'] };
    const r = playCard(s, ward);
    expect(r.state.player.hp).toBe(1);
    expect(r.events.some((e) => e.t === 'playerDied')).toBe(false);
    const r2 = playCard(r.state, ward);
    expect(r2.events.some((e) => e.t === 'playerDied')).toBe(true);
  });

  it('tier-up offers three distinct effects featuring the new rarity', () => {
    const c = tierUpChoices(3, 'attack');
    expect(new Set(c).size).toBe(3);
    expect(['meteor', 'phoenix', 'soulrend', 'plague']).toContain(c[0]);
    expect(c).not.toContain('attack');
  });

  it('enemy hp scales with deck power so fights last a handful of cards', () => {
    const e = spawnEnemy('crypt', 1, 5, 4, false, () => 0.5);
    expect(e.hp).toBeGreaterThan(8);
    expect(e.hp).toBeLessThan(30);
  });
});

describe('skills', () => {
  it('uses the classic exponential xp curve', () => {
    expect(XP_TABLE[2]).toBe(83);
    expect(XP_TABLE[10]).toBe(1154);
    expect(XP_TABLE[99]).toBe(13_034_431);
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(1154)).toBe(10);
    expect(levelForXp(99_999_999)).toBe(99);
  });
});

describe('runs never touch scheduling', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  async function add(over: Partial<CardRow>) {
    const row = { ...newCardRow(1, 'q', 'a', 'attack', Date.now() - DAY), ...over };
    row.id = (await db.cards.add(row)) as number;
    return row;
  }

  it('dungeon hands contain only due cards, and bosses pull due leeches first', async () => {
    const now = Date.now();
    const notDue = await add({ state: State.Review, due: now + 5 * DAY, scheduled_days: 10, stability: 10, difficulty: 5 });
    const leech = await add({ state: State.Review, due: now - DAY, scheduled_days: 2, stability: 2, difficulty: 8, lapses: 6 });
    for (let i = 0; i < 4; i++) await add({ state: State.Review, due: now - DAY - i, scheduled_days: 3, stability: 3, difficulty: 5 });
    const snapshot = JSON.stringify(await db.cards.toArray());

    let run = await startRun('dungeon', 'warrior', DEFAULT_PROFILE);
    run = await beginFight(run, DEFAULT_SETTINGS, DEFAULT_PROFILE);
    expect(run.combat?.enemy.boss).toBe(true); // only 5 due → boss
    expect(run.hand[0]).toBe(leech.id);
    expect(run.leechesFaced).toContain(leech.id);
    expect(run.hand).not.toContain(notDue.id);
    run = await fillHand({ ...run, hand: [] }, DEFAULT_SETTINGS, 5);
    expect(run.hand).not.toContain(notDue.id);
    expect(JSON.stringify(await db.cards.toArray())).toBe(snapshot);
  });

  it('endless mode draws only Mature+ cards and changes nothing', async () => {
    const now = Date.now();
    const mature = await add({ state: State.Review, due: now + 20 * DAY, scheduled_days: 30, stability: 30, difficulty: 5 });
    await add({ state: State.Review, due: now + 3 * DAY, scheduled_days: 5, stability: 5, difficulty: 5 });
    await add({});
    const snapshot = JSON.stringify(await db.cards.toArray());
    let run = await startRun('endless', 'rogue', DEFAULT_PROFILE);
    run = await beginFight(run, DEFAULT_SETTINGS, DEFAULT_PROFILE);
    expect(run.hand).toEqual([mature.id]);
    expect(JSON.stringify(await db.cards.toArray())).toBe(snapshot);
  });
});
