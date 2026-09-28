export type SkillId =
  | 'mining' | 'woodcutting' | 'fishing' | 'farming'
  | 'smithing' | 'cooking'
  | 'attack' | 'strength' | 'defence' | 'hitpoints'
  | 'scholarship';

export type SkillGroup = 'Gathering' | 'Artisan' | 'Combat' | 'Knowledge';

export interface SkillDef { id: SkillId; name: string; icon: string; group: SkillGroup; desc: string }

export const SKILLS: SkillDef[] = [
  { id: 'mining', name: 'Mining', icon: 'pickaxe', group: 'Gathering', desc: 'Each card mines one ore.' },
  { id: 'woodcutting', name: 'Woodcutting', icon: 'axe', group: 'Gathering', desc: 'Each card chops one log.' },
  { id: 'fishing', name: 'Fishing', icon: 'fish', group: 'Gathering', desc: 'Each card lands one fish.' },
  { id: 'farming', name: 'Farming', icon: 'sprout', group: 'Gathering', desc: 'Plant with a card check; crops grow in real time.' },
  { id: 'smithing', name: 'Smithing', icon: 'anvil', group: 'Artisan', desc: 'Smelt bars in the furnace, forge gear and tools.' },
  { id: 'cooking', name: 'Cooking', icon: 'pot', group: 'Artisan', desc: 'Each card cooks one fish.' },
  { id: 'attack', name: 'Attack', icon: 'sword', group: 'Combat', desc: '+1% damage per level; wield better weapons.' },
  { id: 'strength', name: 'Strength', icon: 'fist', group: 'Combat', desc: '+1.5% damage per level.' },
  { id: 'defence', name: 'Defence', icon: 'shield', group: 'Combat', desc: 'Take less damage; wear better armour.' },
  { id: 'hitpoints', name: 'Hitpoints', icon: 'heart', group: 'Combat', desc: '+2 max HP per level.' },
  { id: 'scholarship', name: 'Scholarship', icon: 'book', group: 'Knowledge', desc: 'Every scheduled review, in any skill. +1% gold per level.' },
];
export const SKILL_BY_ID = Object.fromEntries(SKILLS.map((s) => [s.id, s])) as Record<SkillId, SkillDef>;
export const ALL_SKILLS = SKILLS.map((s) => s.id);

export const MAX_LEVEL = 99;

/** Classic exponential MMO skill curve: xp(L) = floor(Σ_{l=1}^{L-1} floor(l + 300·2^(l/7)) / 4). */
export const XP_TABLE: number[] = (() => {
  const t = [0, 0]; // index = level
  let points = 0;
  for (let lvl = 1; lvl < MAX_LEVEL; lvl++) {
    points += Math.floor(lvl + 300 * Math.pow(2, lvl / 7));
    t.push(Math.floor(points / 4));
  }
  return t;
})();

export function levelForXp(xp: number): number {
  let lvl = 1;
  while (lvl < MAX_LEVEL && xp >= XP_TABLE[lvl + 1]) lvl++;
  return lvl;
}

export function xpProgress(xp: number): { level: number; into: number; span: number } {
  const level = levelForXp(xp);
  if (level >= MAX_LEVEL) return { level, into: 1, span: 1 };
  return { level, into: xp - XP_TABLE[level], span: XP_TABLE[level + 1] - XP_TABLE[level] };
}

export type SkillXp = Record<SkillId, number>;
export const EMPTY_XP: SkillXp = Object.fromEntries(ALL_SKILLS.map((s) => [s, s === 'hitpoints' ? XP_TABLE[10] : 0])) as SkillXp;

export type Levels = Record<SkillId, number>;
export function levels(xp: SkillXp): Levels {
  return Object.fromEntries(ALL_SKILLS.map((s) => [s, levelForXp(xp[s] ?? 0)])) as Levels;
}
export function totalLevel(lv: Levels): number {
  return ALL_SKILLS.reduce((a, s) => a + lv[s], 0);
}
/** Classic combat level formula. */
export function combatLevel(lv: Levels): number {
  return Math.floor(0.25 * (lv.defence + lv.hitpoints) + 0.325 * (lv.attack + lv.strength));
}

export function maxHpFor(hpLevel: number): number {
  return 20 + hpLevel * 2;
}
export const attackMult = (lvl: number) => 1 + (lvl - 1) * 0.01;
export const strengthMult = (lvl: number) => 1 + (lvl - 1) * 0.015;
/** Fraction of incoming damage ignored from the Defence level alone (30% at 99). */
export const defenceReduction = (lvl: number) => ((lvl - 1) / 98) * 0.3;
export const goldMult = (lvl: number) => 1 + (lvl - 1) * 0.01;
