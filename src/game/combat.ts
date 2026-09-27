import type { EffectId, Tier } from '../core/types';
import type { ClassDef } from './classes';
import { GRADE_MULT, TIER_POWER } from './effects';
import { intentFor, type EnemyState } from './enemies';
import type { RelicId } from './relics';
import { attackMult, defenceReduction } from './skills';

export interface PlayerState { hp: number; maxHp: number; block: number }

export interface CombatState {
  player: PlayerState;
  enemy: EnemyState;
  combo: number;
  cardsPlayed: number;
  deathWardUsed: boolean;
}

export interface PlayInput {
  effect: EffectId;
  tier: Tier;
  grade: 1 | 2 | 3 | 4;
  wasNew: boolean;
  cls: ClassDef;
  relics: RelicId[];
  attackLevel: number;
  defenceLevel: number;
  fast: boolean; // speed bonus earned (caller guarantees never for New cards)
}

export type CombatEvent =
  | { t: 'enemyDmg'; amount: number; crit?: boolean }
  | { t: 'playerDmg'; amount: number }
  | { t: 'heal'; amount: number }
  | { t: 'block'; amount: number }
  | { t: 'poison'; amount: number }
  | { t: 'draw'; count: number }
  | { t: 'enemyBlock'; amount: number }
  | { t: 'enemyBuff' }
  | { t: 'miss' }
  | { t: 'deathWard' }
  | { t: 'enemyDied' }
  | { t: 'playerDied' }
  | { t: 'log'; text: string; tone?: 'dmg' | 'heal' | 'info' | 'bad' | 'gold' | 'xp' };

export interface PlayResult {
  state: CombatState;
  events: CombatEvent[];
  xp: { attack: number; defence: number; hitpoints: number };
}

export function comboMultiplier(combo: number, cls: ClassDef): number {
  return Math.min(cls.comboCap, 1 + cls.comboStep * Math.max(0, combo - 1));
}

export function effectivePower(tier: Tier, wasNew: boolean, relics: RelicId[]): number {
  const t: Tier = wasNew && relics.includes('grimoire') ? 1 : tier;
  return TIER_POWER[t];
}

function clone(s: CombatState): CombatState {
  return { ...s, player: { ...s.player }, enemy: { ...s.enemy, intent: { ...s.enemy.intent } } };
}

export function startCombat(player: PlayerState, enemy: EnemyState, relics: RelicId[], startBlock: number, deathWardUsed: boolean): CombatState {
  return {
    player: { ...player, block: startBlock + (relics.includes('ironskin') ? 4 : 0) },
    enemy,
    combo: relics.includes('comboring') ? 2 : 0,
    cardsPlayed: 0,
    deathWardUsed,
  };
}

export function playCard(prev: CombatState, input: PlayInput): PlayResult {
  const s = clone(prev);
  const ev: CombatEvent[] = [];
  const xp = { attack: 0, defence: 0, hitpoints: 0 };
  const { cls, relics, grade } = input;
  const p = effectivePower(input.tier, input.wasNew, relics);

  const hit = (raw: number, opts: { pierce?: boolean; crit?: boolean } = {}) => {
    let amt = Math.max(0, Math.round(raw));
    if (!opts.pierce && s.enemy.block > 0) {
      const absorbed = Math.min(s.enemy.block, amt);
      s.enemy.block -= absorbed;
      amt -= absorbed;
    }
    const dealt = Math.min(amt, Math.max(0, s.enemy.hp));
    s.enemy.hp -= amt;
    ev.push({ t: 'enemyDmg', amount: amt, crit: opts.crit });
    xp.attack += dealt * 4;
    xp.hitpoints += Math.round(dealt * 1.33);
    return dealt;
  };
  const heal = (raw: number) => {
    const amt = Math.min(s.player.maxHp - s.player.hp, Math.max(0, Math.round(raw)));
    s.player.hp += amt;
    ev.push({ t: 'heal', amount: amt });
    return amt;
  };
  const block = (raw: number) => {
    const amt = Math.max(0, Math.round(raw));
    s.player.block += amt;
    ev.push({ t: 'block', amount: amt });
  };
  const hurtPlayer = (raw: number, pierce = false) => {
    let amt = Math.max(0, Math.round(raw * (1 - defenceReduction(input.defenceLevel))));
    if (!pierce && s.player.block > 0) {
      const absorbed = Math.min(s.player.block, amt);
      s.player.block -= absorbed;
      amt -= absorbed;
      xp.defence += absorbed * 4;
    }
    s.player.hp -= amt;
    ev.push({ t: 'playerDmg', amount: amt });
    if (s.player.hp <= 0) {
      if (relics.includes('deathward') && !s.deathWardUsed) {
        s.deathWardUsed = true;
        s.player.hp = 1;
        ev.push({ t: 'deathWard' }, { t: 'log', text: 'The Death Ward shatters. You cling to life!', tone: 'info' });
      } else {
        ev.push({ t: 'playerDied' });
      }
    }
  };

  // ---------- player action ----------
  if (grade === 1) {
    s.combo = 0;
    ev.push({ t: 'miss' }, { t: 'log', text: 'Your memory fails you. The strike misses!', tone: 'bad' });
    const free = Math.max(0, Math.ceil(s.enemy.atk * 0.5) + 1 - (relics.includes('wardstone') ? 2 : 0));
    ev.push({ t: 'log', text: `${s.enemy.name} seizes the opening.`, tone: 'bad' });
    hurtPlayer(free);
  } else {
    s.combo += 1;
    const crit = grade === 4;
    const scale = GRADE_MULT[grade] * comboMultiplier(s.combo, cls) * (input.fast ? 1.25 : 1) * (crit && relics.includes('focuscrystal') ? 1.5 : 1);
    const dmg = scale * cls.dmgMult * attackMult(input.attackLevel);
    const sup = scale * cls.healMult;
    const times = s.cardsPlayed === 0 && relics.includes('twinstrike') ? 2 : 1;
    for (let i = 0; i < times; i++) {
      switch (input.effect) {
        case 'attack': hit(p * dmg, { crit }); break;
        case 'heal': heal(p * sup); break;
        case 'shield': block(p * sup); break;
        case 'poison': {
          const amt = Math.max(1, Math.round(p * 0.6 * scale));
          s.enemy.poison += amt;
          ev.push({ t: 'poison', amount: amt });
          break;
        }
        case 'draw': hit(Math.ceil(p * 0.5) * dmg, { crit }); ev.push({ t: 'draw', count: 1 }); break;
        case 'doublehit': hit(p * 0.65 * dmg, { crit }); hit(p * 0.65 * dmg, { crit }); break;
        case 'lifesteal': heal(hit(p * dmg, { crit }) * 0.5 * cls.healMult); break;
        case 'cleave': hit(p * 1.2 * dmg, { crit, pierce: true }); break;
        case 'meteor': hit(p * 2 * dmg, { crit }); break;
        case 'phoenix': heal(p * sup); block(p * sup); break;
        case 'soulrend': heal(hit(p * 1.5 * dmg, { crit }) * cls.healMult); break;
        case 'plague': {
          const amt = Math.round(p * scale);
          s.enemy.poison += amt;
          ev.push({ t: 'poison', amount: amt });
          hit(Math.ceil(p * 0.5) * dmg, { crit });
          break;
        }
      }
    }
    if (grade >= 3 && relics.includes('ember') && s.enemy.hp > 0) hit(1);
    if (crit && relics.includes('easyheal')) heal(1);
  }
  s.cardsPlayed += 1;

  if (s.player.hp <= 0) return { state: s, events: ev, xp };
  if (s.enemy.hp <= 0) {
    ev.push({ t: 'enemyDied' });
    return { state: s, events: ev, xp };
  }

  // ---------- enemy turn ----------
  s.enemy.block = 0;
  if (s.enemy.poison > 0) {
    const tick = s.enemy.poison + (relics.includes('venomgland') ? 1 : 0);
    s.enemy.hp -= tick;
    xp.attack += Math.min(tick, s.enemy.hp + tick) * 2;
    ev.push({ t: 'enemyDmg', amount: tick }, { t: 'log', text: `Poison eats at ${s.enemy.name} for ${tick}.`, tone: 'dmg' });
    s.enemy.poison -= 1;
    if (s.enemy.hp <= 0) {
      ev.push({ t: 'enemyDied' });
      return { state: s, events: ev, xp };
    }
  }
  const intent = s.enemy.intent;
  if (intent.kind === 'attack') {
    ev.push({ t: 'log', text: `${s.enemy.name} attacks!`, tone: 'bad' });
    hurtPlayer(intent.value);
  } else if (intent.kind === 'block') {
    s.enemy.block += intent.value;
    ev.push({ t: 'enemyBlock', amount: intent.value }, { t: 'log', text: `${s.enemy.name} raises its guard (${intent.value}).`, tone: 'info' });
  } else {
    s.enemy.atk += intent.value;
    ev.push({ t: 'enemyBuff' }, { t: 'log', text: `${s.enemy.name} grows stronger.`, tone: 'bad' });
  }
  s.enemy.patternIdx += 1;
  s.enemy.intent = intentFor(s.enemy);
  return { state: s, events: ev, xp };
}
