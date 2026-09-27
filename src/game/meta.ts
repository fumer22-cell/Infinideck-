export type MetaId = 'vitality' | 'bulwark' | 'bargain' | 'campfire' | 'treasure' | 'relicseeker';
export interface MetaDef { id: MetaId; name: string; desc: (lvl: number) => string; max: number; cost: (lvl: number) => number }

export const META: Record<MetaId, MetaDef> = {
  vitality: { id: 'vitality', name: 'Vitality Tonic', desc: (l) => `+${l * 5} max HP`, max: 5, cost: (l) => 100 * (l + 1) },
  bulwark: { id: 'bulwark', name: 'Bulwark Drills', desc: (l) => `Start fights with +${l * 2} block`, max: 3, cost: (l) => 150 * (l + 1) },
  bargain: { id: 'bargain', name: "Merchant's Favour", desc: (l) => `Shops ${l * 10}% cheaper`, max: 3, cost: (l) => 120 * (l + 1) },
  campfire: { id: 'campfire', name: 'Better Bedrolls', desc: (l) => `Rest heals +${l * 10}% more`, max: 3, cost: (l) => 100 * (l + 1) },
  treasure: { id: 'treasure', name: 'Treasure Sense', desc: (l) => `+${l * 10}% gold`, max: 5, cost: (l) => 120 * (l + 1) },
  relicseeker: { id: 'relicseeker', name: 'Relic Seeker', desc: (l) => (l ? 'Begin each run with a random relic' : 'Begin runs with a relic'), max: 1, cost: () => 500 },
};
export const ALL_META = Object.keys(META) as MetaId[];
