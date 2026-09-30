/**
 * The combat engine. Each turn:
 *  1. answer a flashcard: its grade gives energy (Again gives none)
 *  2. spend energy on ability cards from your hand
 *  3. end the turn: the enemy does what it telegraphed, then you draw a new hand
 * Everything here is pure game state: scheduling never depends on it.
 */
import { ABILITIES, ENERGY_CAP, HAND_SIZE, energyFor, num, type CardApi, type CardInst, type CombatStats, type PoolCard } from './abilities';
import { armourOf, intentFor, type EnemyState } from './enemies';
import type { Rng } from './rng';

export interface Fight {
  enemy: EnemyState;
  phase: 'answer' | 'play';
  energy: number;
  block: number;
  /** poison on you: deals its amount at the start of your turn, then drops by 1 */
  poison: number;
  hand: CardInst[];
  draw: CardInst[];
  discard: CardInst[];
  exhausted: CardInst[];
  /** multiplier for your next attack (Focus, Clarity) */
  focus: number;
  /** bonus damage on every hit (War Cry) */
  str: number;
  turn: number;
  uid: number;
  /** the killing blow came from Gilded Strike */
  goldBonus?: boolean;
}

export interface Hero { hp: number; maxHp: number }

export type CombatEvent =
  | { t: 'enemyDmg'; amount: number; blocked?: number }
  | { t: 'playerDmg'; amount: number; blocked?: number }
  | { t: 'heal'; amount: number }
  | { t: 'block'; amount: number }
  | { t: 'poison'; amount: number }
  | { t: 'playerPoison'; amount: number }
  | { t: 'energy'; amount: number }
  | { t: 'enemyBlock'; amount: number }
  | { t: 'enemyHeal'; amount: number }
  | { t: 'enemyBuff'; amount: number }
  | { t: 'status'; text: string }
  | { t: 'stun' }
  | { t: 'enemyDied' }
  | { t: 'playerDied' }
  | { t: 'log'; text: string; tone?: 'dmg' | 'heal' | 'info' | 'bad' | 'gold' | 'xp' };

export interface StepResult {
  events: CombatEvent[];
  /** damage you dealt and damage your block absorbed, for xp */
  dealt: number;
  absorbed: number;
  killed: boolean;
  died: boolean;
}

const MAX_HAND = 7;

function shuffle<T>(xs: T[], rng: Rng): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function drawCards(f: Fight, n: number, rng: Rng) {
  for (let i = 0; i < n && f.hand.length < MAX_HAND; i++) {
    if (!f.draw.length) {
      if (!f.discard.length) return;
      f.draw = shuffle(f.discard, rng);
      f.discard = [];
    }
    f.hand.push(f.draw.shift()!);
  }
}

export function newFight(deck: PoolCard[], enemy: EnemyState, rng: Rng): Fight {
  let uid = 0;
  const cards: CardInst[] = deck.map((c) => ({ uid: ++uid, id: c.id, plus: c.plus || undefined, food: c.food }));
  const f: Fight = { enemy, phase: 'answer', energy: 0, block: 0, poison: 0, hand: [], draw: shuffle(cards, rng), discard: [], exhausted: [], focus: 1, str: 0, turn: 1, uid };
  drawCards(f, HAND_SIZE, rng);
  return f;
}

const empty = (): StepResult => ({ events: [], dealt: 0, absorbed: 0, killed: false, died: false });

/** Step 1: the flashcard's grade becomes energy. */
export function answerTurn(f: Fight, grade: 1 | 2 | 3 | 4, tier: number): StepResult {
  const r = empty();
  const gain = energyFor(grade, tier);
  f.energy = Math.min(ENERGY_CAP, f.energy + gain);
  f.phase = 'play';
  r.events.push({ t: 'energy', amount: gain });
  if (grade === 1) {
    r.events.push({ t: 'log', text: 'Your memory falters: no energy this turn.', tone: 'bad' });
    if (f.enemy.traits.includes('enrage')) {
      f.enemy.str += 1;
      f.enemy.intent = intentFor(f.enemy);
      r.events.push({ t: 'enemyBuff', amount: 1 }, { t: 'log', text: `${f.enemy.name} smells weakness and grows stronger.`, tone: 'bad' });
    }
  } else r.events.push({ t: 'log', text: `+${gain} energy${tier >= 2 ? ' (mature card +1)' : ''}.`, tone: 'xp' });
  return r;
}

export function cardCost(c: CardInst) {
  return ABILITIES[c.id].cost;
}

/** Step 2: play one card from your hand. Returns null if it can't be played. */
export function playFromHand(f: Fight, hero: Hero, uid: number, stats: CombatStats, extra: { foodHeal: number }, rng: Rng): StepResult | null {
  const idx = f.hand.findIndex((c) => c.uid === uid);
  if (idx < 0 || f.phase !== 'play') return null;
  const card = f.hand[idx];
  const def = ABILITIES[card.id];
  if (def.cost > f.energy) return null;
  if (card.id === 'eat' && extra.foodHeal <= 0) return null;
  f.energy -= def.cost;
  f.hand.splice(idx, 1);
  (def.exhaust ? f.exhausted : f.discard).push(card);

  const r = empty();
  const e = f.enemy;
  f.goldBonus = false;
  let attacked = false;
  const api: CardApi = {
    hit(amount, opts = {}) {
      if (e.hp <= 0) return 0;
      attacked = true;
      let amt = Math.round((amount + f.str) * f.focus * (e.vuln > 0 ? 1.5 : 1));
      let blocked = 0;
      if (!opts.pierce && e.block > 0) {
        blocked = Math.min(e.block, amt);
        e.block -= blocked;
        amt -= blocked;
      }
      const dealt = Math.min(amt, e.hp);
      e.hp -= amt;
      r.dealt += dealt;
      r.events.push({ t: 'enemyDmg', amount: amt, blocked });
      return dealt;
    },
    block(amount) {
      f.block += amount;
      r.events.push({ t: 'block', amount });
    },
    heal(amount) {
      const amt = Math.max(0, Math.min(hero.maxHp - hero.hp, amount));
      hero.hp += amt;
      r.events.push({ t: 'heal', amount: amt });
      return amt;
    },
    poison(amount) {
      e.poison += amount;
      r.events.push({ t: 'poison', amount });
    },
    weak(turns) {
      e.weak = Math.max(e.weak, turns);
      r.events.push({ t: 'status', text: `Weak ${turns}` });
    },
    vuln(turns) {
      e.vuln = Math.max(e.vuln, turns);
      r.events.push({ t: 'status', text: `Vulnerable ${turns}` });
    },
    stun() {
      if (e.hp <= 0) return;
      if (e.boss) {
        e.weak = Math.max(e.weak, 2);
        r.events.push({ t: 'status', text: 'Weak 2' }, { t: 'log', text: `${e.name} shrugs off the stun but reels (Weak 2).`, tone: 'info' });
      } else {
        e.stunned = true;
        r.events.push({ t: 'stun' }, { t: 'log', text: `${e.name} is stunned and will lose its next move.`, tone: 'info' });
      }
    },
    draw(n) {
      drawCards(f, n, rng);
    },
    energy(n) {
      f.energy = Math.min(ENERGY_CAP, f.energy + n);
      r.events.push({ t: 'energy', amount: n });
    },
    focus(mult) {
      f.focus = Math.max(f.focus, mult);
    },
    strength(n) {
      f.str += n;
      r.events.push({ t: 'status', text: `+${n} damage` });
    },
    goldOnKill() {
      f.goldBonus = true;
    },
    cleanse() {
      if (f.poison > 0) r.events.push({ t: 'status', text: 'Cured' }, { t: 'log', text: 'The antidote burns the poison out of your blood.', tone: 'heal' });
      f.poison = 0;
    },
    strip() {
      if (e.block > 0) r.events.push({ t: 'status', text: `-${e.block} block` }, { t: 'log', text: `Vitriol eats through ${e.name}'s guard.`, tone: 'dmg' });
      e.block = 0;
    },
  };
  const before = e.hp;
  def.play(api, num(stats, card.plus, card.food), extra);
  // focus is spent by the first attack it boosts
  if (attacked && def.id !== 'focus' && def.id !== 'clarity') f.focus = 1;
  if (e.hp <= 0 && before > 0) {
    r.killed = true;
    r.events.push({ t: 'enemyDied' });
  } else f.goldBonus = false;
  return r;
}

function hurtHero(f: Fight, hero: Hero, raw: number, stats: CombatStats, r: StepResult) {
  let amt = Math.max(0, Math.round(raw * (1 - stats.reduction) * (f.enemy.weak > 0 ? 0.75 : 1)));
  let blocked = 0;
  if (f.block > 0) {
    blocked = Math.min(f.block, amt);
    f.block -= blocked;
    amt -= blocked;
    r.absorbed += blocked;
  }
  hero.hp -= amt;
  r.events.push({ t: 'playerDmg', amount: amt, blocked });
  if (amt > 0 && f.enemy.traits.includes('venomous')) {
    f.poison += 1;
    r.events.push({ t: 'playerPoison', amount: 1 });
  }
  if (hero.hp <= 0 && !r.died) {
    r.died = true;
    r.events.push({ t: 'playerDied' });
  }
}

/** Step 3: the enemy acts on its intent, then a new turn begins. */
export function endTurn(f: Fight, hero: Hero, stats: CombatStats, rng: Rng): StepResult {
  const r = empty();
  const e = f.enemy;
  if (e.hp <= 0) return r;

  // the enemy's turn: its old block falls away, poison ticks, then it acts
  e.block = 0;
  if (e.poison > 0) {
    const tick = Math.min(e.poison, e.hp);
    e.hp -= e.poison;
    r.dealt += tick;
    r.events.push({ t: 'enemyDmg', amount: e.poison }, { t: 'log', text: `Poison eats at ${e.name} for ${e.poison}.`, tone: 'dmg' });
    e.poison -= 1;
    if (e.hp <= 0) {
      r.killed = true;
      r.events.push({ t: 'enemyDied' });
      return r;
    }
  }
  const it = e.intent;
  if (e.stunned) {
    e.stunned = false;
    r.events.push({ t: 'log', text: `${e.name} is stunned and loses its move.`, tone: 'info' });
    // a stunned wind-up never lands
    if (it.kind === 'windup') e.patternIdx += 1;
  } else {
    switch (it.kind) {
      case 'attack':
        r.events.push({ t: 'log', text: `${e.name} attacks!`, tone: 'bad' });
        hurtHero(f, hero, it.value, stats, r);
        break;
      case 'heavy':
        r.events.push({ t: 'log', text: `${e.name} unleashes a crushing blow!`, tone: 'bad' });
        hurtHero(f, hero, it.value, stats, r);
        break;
      case 'multi':
        r.events.push({ t: 'log', text: `${e.name} strikes in a frenzy!`, tone: 'bad' });
        for (let i = 0; i < (it.hits ?? 1) && !r.died; i++) hurtHero(f, hero, it.value, stats, r);
        break;
      case 'poison':
        r.events.push({ t: 'log', text: `${e.name} strikes with venom!`, tone: 'bad' });
        hurtHero(f, hero, it.value, stats, r);
        f.poison += it.hits ?? 0;
        r.events.push({ t: 'playerPoison', amount: it.hits ?? 0 });
        break;
      case 'block':
        e.block += it.value;
        r.events.push({ t: 'enemyBlock', amount: it.value }, { t: 'log', text: `${e.name} raises its guard (${it.value}).`, tone: 'info' });
        break;
      case 'buff':
        e.str += it.value;
        r.events.push({ t: 'enemyBuff', amount: it.value }, { t: 'log', text: `${e.name} grows stronger (+${it.value}).`, tone: 'bad' });
        break;
      case 'windup':
        r.events.push({ t: 'log', text: `${e.name} gathers itself for a heavy blow. Block it, or stun it!`, tone: 'bad' });
        break;
    }
  }
  if (e.traits.includes('armoured')) {
    e.block += armourOf(e);
    r.events.push({ t: 'enemyBlock', amount: armourOf(e) });
  }
  if (e.traits.includes('regen') && e.hp < e.maxHp) {
    const h = Math.min(e.maxHp - e.hp, Math.ceil(e.maxHp * 0.04));
    e.hp += h;
    r.events.push({ t: 'enemyHeal', amount: h });
  }
  if (e.weak > 0) e.weak -= 1;
  if (e.vuln > 0) e.vuln -= 1;
  e.patternIdx += 1;
  if (e.phase2 && !e.enraged && e.hp <= e.maxHp / 2) {
    e.enraged = true;
    e.pattern = e.phase2;
    e.patternIdx = 0;
    r.events.push({ t: 'log', text: `${e.name} is wounded and turns desperate!`, tone: 'bad' });
  }
  e.intent = intentFor(e);
  if (r.died) return r;

  // your new turn: block fades, poison ticks, draw a fresh hand
  f.block = 0;
  if (f.poison > 0) {
    hero.hp -= f.poison;
    r.events.push({ t: 'playerDmg', amount: f.poison }, { t: 'log', text: `Poison burns you for ${f.poison}.`, tone: 'bad' });
    f.poison -= 1;
    if (hero.hp <= 0) {
      r.died = true;
      r.events.push({ t: 'playerDied' });
      return r;
    }
  }
  f.discard.push(...f.hand);
  f.hand = [];
  drawCards(f, HAND_SIZE, rng);
  f.phase = 'answer';
  f.turn += 1;
  return r;
}
