/** Combat tuning. Classes were replaced by gear; everyone fights as an adventurer. */
export interface ClassDef {
  id: string;
  name: string;
  dmgMult: number;
  healMult: number;
  comboStep: number;
  comboCap: number;
}
export const ADVENTURER: ClassDef = { id: 'adventurer', name: 'Adventurer', dmgMult: 1, healMult: 1, comboStep: 0.1, comboCap: 2 };
