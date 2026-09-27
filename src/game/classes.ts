export type ClassId = 'warrior' | 'cleric' | 'rogue';
export interface ClassDef {
  id: ClassId;
  name: string;
  blurb: string;
  dmgMult: number;
  healMult: number;
  comboStep: number;
  comboCap: number;
}
export const CLASSES: Record<ClassId, ClassDef> = {
  warrior: { id: 'warrior', name: 'Warrior', blurb: '+30% damage from every strike.', dmgMult: 1.3, healMult: 1, comboStep: 0.1, comboCap: 2 },
  cleric: { id: 'cleric', name: 'Cleric', blurb: '+60% healing and warding.', dmgMult: 1, healMult: 1.6, comboStep: 0.1, comboCap: 2 },
  rogue: { id: 'rogue', name: 'Rogue', blurb: 'Combo builds twice as fast, cap x3.', dmgMult: 1, healMult: 1, comboStep: 0.2, comboCap: 3 },
};
