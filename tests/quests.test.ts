import { describe, expect, it } from 'vitest';
import { cardPool } from '../src/game/abilities';
import { answerTurn, newFight, playFromHand } from '../src/game/combat';
import { checkNumber, formatAnswer, parseNumber, sigFigs } from '../src/game/quests/check';
import { finishChapter, markPart, progressOf, questPoints, QUESTS, recordMiss, takeHint } from '../src/game/quests';
import type { NumberPart } from '../src/game/quests/types';
import { VITRIOL } from '../src/game/quests/vitriol';
import { EMPTY_XP, levels } from '../src/game/skills';
import * as W from '../src/game/world';

const ch = (id: string) => VITRIOL.chapters.find((c) => c.id === id)!;
const num = (id: string, i = 0) => ch(id).parts.filter((p) => p.kind === 'number')[i] as NumberPart;
const grade = (id: string, raw: string, i = 0) => checkNumber(raw, num(id, i), ch(id).vars).kind;
const lv = levels(EMPTY_XP);

describe('reading answers', () => {
  it('parses plain and scientific notation', () => {
    expect(parseNumber('26.4')).toBe(26.4);
    expect(parseNumber('2.64e1')).toBeCloseTo(26.4);
    expect(parseNumber('2.64 x 10^1')).toBeCloseTo(26.4);
    expect(parseNumber('2.64×10^-1')).toBeCloseTo(0.264);
    expect(parseNumber('abc')).toBeNull();
  });
  it('counts significant figures as typed', () => {
    expect(sigFigs('26.4')).toEqual([3, 3]);
    expect(sigFigs('0.0500')).toEqual([3, 3]);
    expect(sigFigs('300')).toEqual([1, 3]);
    expect(formatAnswer(26.349, { sig: 3 })).toBe('26.3');
    expect(formatAnswer(0.5, { dp: 1 })).toBe('0.5');
  });
});

describe('The Vitriol Blight: the original problems', () => {
  it('ammonium phosphate from 9.03 g of ammonia is 26.3 g (26.4 with rounder molar masses)', () => {
    expect(formatAnswer(num('hartshorn').answer(ch('hartshorn').vars), { sig: 3 })).toBe('26.3');
    expect(grade('hartshorn', '26.3')).toBe('ok');
    expect(grade('hartshorn', '26.4')).toBe('ok');
    expect(grade('hartshorn', '26.35')).toBe('rounding');
    expect(grade('hartshorn', '79.0')).toBe('trap'); // forgot the 3:1 ratio
    expect(grade('hartshorn', '50')).toBe('wrong');
  });
  it('the lamp: hexane runs out first, so none is left', () => {
    const c = ch('adit');
    const choice = c.parts[0];
    expect(choice.kind === 'choice' && choice.answer(c.vars)).toBe(0);
    expect(grade('adit', '0')).toBe('ok');
    expect(grade('adit', '0.0')).toBe('ok');
    expect(grade('adit', '3.9')).toBe('trap');
  });
  it('the most Al2O3 from 1.0 mol Al and 11.0 mol O2 is 0.5 mol', () => {
    expect(grade('sapphire', '0.5')).toBe('ok');
    expect(grade('sapphire', '7.3')).toBe('trap');
    expect(grade('sapphire', '0.50')).toBe('rounding');
  });
  it('the antidote: 1.9 g theoretical, 1.4 g at 73%', () => {
    expect(grade('antidote', '1.9', 0)).toBe('ok');
    expect(grade('antidote', '3.0', 0)).toBe('trap');
    expect(grade('antidote', '1.4', 1)).toBe('ok');
    expect(grade('antidote', '2.6', 1)).toBe('trap');
  });
  it('quenching the vitriol makes 26.3 g of water', () => {
    expect(grade('quench', '26.3')).toBe('ok');
    expect(grade('quench', '39.2')).toBe('trap'); // lye treated as limiting
    expect(grade('quench', '13.2')).toBe('trap'); // forgot the 2 waters
  });
});

describe('practice numbers', () => {
  it('every chapter makes sensible fresh numbers', () => {
    let seed = 1;
    const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let n = 0; n < 200; n++)
      for (const c of VITRIOL.chapters) {
        const v = c.echo(rng);
        for (const p of c.parts) {
          const a = p.answer(v);
          expect(Number.isFinite(a)).toBe(true);
          expect(a).toBeGreaterThanOrEqual(0);
        }
        expect(c.solution(v).length).toBeGreaterThan(0);
      }
  });
  it('when the air runs out first, some hexane is left', () => {
    const c = ch('adit');
    const v = { hex: 5.0, o2: 6.0 };
    expect(c.parts[0].answer(v)).toBe(1);
    expect(num('adit').answer(v)).toBeGreaterThan(0);
  });
});

describe('quest progress', () => {
  it('chapters pay out, stars need no misses or hints, and the finale completes the quest', () => {
    const w = W.newWorld(40);
    expect(questPoints(w)).toBe(0);
    const pay1 = finishChapter(w, VITRIOL);
    expect(pay1.star).toBe(true);
    expect(pay1.gold).toBe(40);
    expect(w.bank['fert-phosphate']).toBe(6);
    recordMiss(w, VITRIOL.id);
    expect(finishChapter(w, VITRIOL).star).toBe(false);
    takeHint(w, VITRIOL.id);
    expect(finishChapter(w, VITRIOL).star).toBe(false);
    markPart(w, VITRIOL.id, 0);
    finishChapter(w, VITRIOL); // antidote spell
    expect(w.spells?.map((s) => s.id)).toEqual(['antidote']);
    const last = finishChapter(w, VITRIOL);
    expect(last.completed).toBe(true);
    expect(last.flawless).toBe(false);
    expect(w.spells?.some((s) => s.plus)).toBe(false);
    expect(w.bank.alembic).toBe(1);
    expect(questPoints(w)).toBe(1);
    expect(progressOf(w, VITRIOL.id).done).toBeTruthy();
  });
  it('a flawless run upgrades the spells', () => {
    const w = W.newWorld(40);
    let out;
    for (let i = 0; i < VITRIOL.chapters.length; i++) out = finishChapter(w, VITRIOL);
    expect(out!.flawless).toBe(true);
    expect(w.spells).toEqual([{ id: 'antidote', plus: true }, { id: 'vitriol', plus: true }]);
  });
  it('every quest is registered once', () => {
    expect(new Set(QUESTS.map((q) => q.id)).size).toBe(QUESTS.length);
  });
});

describe('quest spells in combat', () => {
  const stats = { power: 10, guard: 10, reduction: 0, maxHp: 40 };
  it('learned spells join your deck pool', () => {
    const pool = cardPool({ equip: {}, food: null, bank: {}, spells: [{ id: 'vitriol', plus: true }] }, lv);
    expect(pool.find((c) => c.id === 'vitriol')?.plus).toBe(true);
  });
  it('Vitriol Flask dissolves block before it hits; Antidote cures poison', () => {
    const f = newFight([], W.spawn({ id: 'x', name: 'X', sprite: 'rat', hp: 80, atk: 4, pattern: ['attack'], gold: [1, 1], drops: [] }), () => 0);
    f.enemy.block = 20;
    f.poison = 5;
    f.hand = [{ uid: 1, id: 'vitriol' }, { uid: 2, id: 'antidote' }];
    answerTurn(f, 3, 0);
    const hero = { hp: 30, maxHp: 40 };
    const r = playFromHand(f, hero, 1, stats, { foodHeal: 0 }, () => 0)!;
    expect(r.dealt).toBe(8);
    expect(f.enemy.block).toBe(0);
    expect(f.enemy.poison).toBe(4);
    playFromHand(f, hero, 2, stats, { foodHeal: 0 }, () => 0);
    expect(f.poison).toBe(0);
    expect(hero.hp).toBe(34);
  });
});
