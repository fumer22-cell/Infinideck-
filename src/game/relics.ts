export type RelicId =
  | 'twinstrike' | 'easyheal' | 'ironskin' | 'venomgland' | 'goldtooth' | 'ember'
  | 'grimoire' | 'bloodvial' | 'wardstone' | 'comboring' | 'deathward' | 'focuscrystal';

export interface RelicDef { id: RelicId; name: string; desc: string; icon: string; cost: number }

export const RELICS: Record<RelicId, RelicDef> = {
  twinstrike: { id: 'twinstrike', name: 'Twin Sigil', desc: 'First card each fight triggers twice.', icon: 'sigil', cost: 60 },
  easyheal: { id: 'easyheal', name: 'Feather of Ease', desc: 'Heal 1 on every Easy.', icon: 'feather', cost: 40 },
  ironskin: { id: 'ironskin', name: 'Iron Skin', desc: 'Start each fight with 4 block.', icon: 'shield', cost: 50 },
  venomgland: { id: 'venomgland', name: 'Venom Gland', desc: 'Poison ticks deal +1.', icon: 'skull', cost: 45 },
  goldtooth: { id: 'goldtooth', name: 'Gold Tooth', desc: '+25% gold from kills.', icon: 'coin', cost: 40 },
  ember: { id: 'ember', name: 'Undying Ember', desc: 'Every Good or Easy deals 1 extra damage.', icon: 'flame', cost: 55 },
  grimoire: { id: 'grimoire', name: 'Tattered Grimoire', desc: 'New cards hit as if Young.', icon: 'book', cost: 50 },
  bloodvial: { id: 'bloodvial', name: 'Blood Vial', desc: 'Heal 3 after each fight.', icon: 'potion', cost: 45 },
  wardstone: { id: 'wardstone', name: 'Wardstone', desc: 'Again costs 2 less HP.', icon: 'gem', cost: 50 },
  comboring: { id: 'comboring', name: 'Ring of Rhythm', desc: 'Combo starts at 2.', icon: 'ring', cost: 55 },
  deathward: { id: 'deathward', name: 'Death Ward', desc: 'Once per run, survive a killing blow at 1 HP.', icon: 'ankh', cost: 80 },
  focuscrystal: { id: 'focuscrystal', name: 'Focus Crystal', desc: 'Crits (Easy) deal +50% more.', icon: 'gem', cost: 60 },
};

export const ALL_RELICS = Object.keys(RELICS) as RelicId[];
