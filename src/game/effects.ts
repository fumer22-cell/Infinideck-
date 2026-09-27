import type { EffectId, Tier } from '../core/types';
import { pick, pickN, rand, type Rng } from './rng';

export interface EffectDef {
  id: EffectId;
  name: string;
  icon: string; // sprite key
  rarity: 'common' | 'rare' | 'epic';
  desc: (p: number) => string;
}

export const EFFECTS: Record<EffectId, EffectDef> = {
  attack: { id: 'attack', name: 'Strike', icon: 'sword', rarity: 'common', desc: (p) => `Deal ${p} damage.` },
  heal: { id: 'heal', name: 'Mend', icon: 'heart', rarity: 'common', desc: (p) => `Heal ${p} HP.` },
  shield: { id: 'shield', name: 'Ward', icon: 'shield', rarity: 'common', desc: (p) => `Gain ${p} block.` },
  poison: { id: 'poison', name: 'Venom', icon: 'skull', rarity: 'common', desc: (p) => `Apply ${Math.ceil(p * 0.6)} poison.` },
  draw: { id: 'draw', name: 'Insight', icon: 'eye', rarity: 'common', desc: (p) => `Deal ${Math.ceil(p * 0.5)} and draw a card.` },
  doublehit: { id: 'doublehit', name: 'Twin Fang', icon: 'daggers', rarity: 'rare', desc: (p) => `Hit twice for ${Math.ceil(p * 0.65)}.` },
  lifesteal: { id: 'lifesteal', name: 'Leech Blade', icon: 'fang', rarity: 'rare', desc: (p) => `Deal ${p}, heal half.` },
  cleave: { id: 'cleave', name: 'Cleave', icon: 'axe', rarity: 'rare', desc: (p) => `Deal ${Math.ceil(p * 1.2)}, ignoring block.` },
  meteor: { id: 'meteor', name: 'Starfall', icon: 'star', rarity: 'epic', desc: (p) => `Deal ${p * 2} damage.` },
  phoenix: { id: 'phoenix', name: 'Phoenix Rite', icon: 'flame', rarity: 'epic', desc: (p) => `Heal ${p} and gain ${p} block.` },
  soulrend: { id: 'soulrend', name: 'Soulrend', icon: 'soul', rarity: 'epic', desc: (p) => `Deal ${Math.ceil(p * 1.5)}, heal all of it.` },
  plague: { id: 'plague', name: 'Plague', icon: 'skull', rarity: 'epic', desc: (p) => `Apply ${p} poison and deal ${Math.ceil(p * 0.5)}.` },
};

export const COMMON: EffectId[] = ['attack', 'heal', 'shield', 'poison', 'draw'];
export const RARE: EffectId[] = ['doublehit', 'lifesteal', 'cleave'];
export const EPIC: EffectId[] = ['meteor', 'phoenix', 'soulrend', 'plague'];

/** Base power per maturity tier. */
export const TIER_POWER: Record<Tier, number> = { 0: 3, 1: 5, 2: 8, 3: 12 };

/** Weighted roll at card creation: attack is most common. */
export function rollStartingEffect(rng: Rng = rand): EffectId {
  const r = rng();
  if (r < 0.4) return 'attack';
  if (r < 0.55) return 'heal';
  if (r < 0.7) return 'shield';
  if (r < 0.85) return 'poison';
  return 'draw';
}

/** Roll for a card created at a given maturity (e.g. imported mature cards). */
export function rollEffectForTier(tier: Tier, rng: Rng = rand): EffectId {
  const r = rng();
  if (tier >= 3 && r < 0.15) return pick(EPIC, rng);
  if (tier >= 2 && r < 0.4) return pick(RARE, rng);
  return rollStartingEffect(rng);
}

export function effectPoolForTier(tier: Tier): EffectId[] {
  if (tier >= 3) return [...COMMON, ...RARE, ...EPIC];
  if (tier >= 2) return [...COMMON, ...RARE];
  return COMMON;
}

/** Offer 3 effects when a card reaches a new tier, biased toward that tier's rarity. */
export function tierUpChoices(tier: Tier, current: EffectId, rng: Rng = rand): EffectId[] {
  const pool = effectPoolForTier(tier).filter((e) => e !== current);
  const featured = tier >= 3 ? EPIC : tier >= 2 ? RARE : COMMON;
  const first = pick(featured.filter((e) => e !== current), rng);
  const rest = pickN(pool.filter((e) => e !== first), 2, rng);
  return [first, ...rest];
}

export const GRADE_MULT: Record<1 | 2 | 3 | 4, number> = { 1: 0, 2: 0.5, 3: 1, 4: 1.75 };
export const GRADE_LABEL: Record<1 | 2 | 3 | 4, string> = { 1: 'Again', 2: 'Hard', 3: 'Good', 4: 'Easy' };
