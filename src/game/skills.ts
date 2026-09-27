export type SkillId = 'attack' | 'defence' | 'hitpoints' | 'scholarship';
export const SKILLS: { id: SkillId; name: string; icon: string; desc: string }[] = [
  { id: 'attack', name: 'Attack', icon: 'sword', desc: '+1% damage per level' },
  { id: 'defence', name: 'Defence', icon: 'shield', desc: 'Reduces enemy hits' },
  { id: 'hitpoints', name: 'Hitpoints', icon: 'heart', desc: 'Raises max HP' },
  { id: 'scholarship', name: 'Scholarship', icon: 'book', desc: '+1% gold per level (from reviews)' },
];

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
export const EMPTY_XP: SkillXp = { attack: 0, defence: 0, hitpoints: XP_TABLE[10], scholarship: 0 };

export function levels(xp: SkillXp): Record<SkillId, number> {
  return {
    attack: levelForXp(xp.attack),
    defence: levelForXp(xp.defence),
    hitpoints: levelForXp(xp.hitpoints),
    scholarship: levelForXp(xp.scholarship),
  };
}

export function maxHpFor(hpLevel: number, metaBonus = 0): number {
  return 20 + hpLevel * 2 + metaBonus;
}
export const attackMult = (lvl: number) => 1 + (lvl - 1) * 0.01;
/** Fraction of incoming damage ignored. Caps at 30% at 99. */
export const defenceReduction = (lvl: number) => ((lvl - 1) / 98) * 0.3;
export const goldMult = (lvl: number) => 1 + (lvl - 1) * 0.01;
