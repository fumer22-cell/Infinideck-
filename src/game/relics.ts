export type RelicId =
  | 'twinstrike' | 'easyheal' | 'ironskin' | 'venomgland' | 'goldtooth' | 'ember'
  | 'grimoire' | 'bloodvial' | 'wardstone' | 'comboring' | 'deathward' | 'focuscrystal';

export interface RelicDef { id: RelicId; name: string; desc: string; icon: string; cost: number }

export const RELICS: Record<RelicId, RelicDef> = {
  twinstrike: { id: 'twinstrike', name: 'Twin Sigil', desc: 'Adds Flurry: hit three times.', icon: 'sigil', cost: 60 },
  easyheal: { id: 'easyheal', name: 'Feather of Ease', desc: 'Adds Feather of Ease: a free heal that draws a card.', icon: 'feather', cost: 40 },
  ironskin: { id: 'ironskin', name: 'Iron Skin', desc: 'Adds Iron Skin: a big block.', icon: 'shield', cost: 50 },
  venomgland: { id: 'venomgland', name: 'Venom Gland', desc: 'Adds Plague: heavy poison.', icon: 'skull', cost: 45 },
  goldtooth: { id: 'goldtooth', name: 'Gold Tooth', desc: 'Adds Gilded Strike: double gold when it kills.', icon: 'coin', cost: 40 },
  ember: { id: 'ember', name: 'Undying Ember', desc: 'Adds Starfall: a huge 3-energy hit.', icon: 'flame', cost: 55 },
  grimoire: { id: 'grimoire', name: 'Tattered Grimoire', desc: 'Adds Insight: draw 2 for free.', icon: 'book', cost: 50 },
  bloodvial: { id: 'bloodvial', name: 'Blood Vial', desc: 'Adds Soulrend: hit and heal half.', icon: 'potion', cost: 45 },
  wardstone: { id: 'wardstone', name: 'Wardstone', desc: 'Adds Hex Ward: block and weaken the enemy.', icon: 'gem', cost: 50 },
  comboring: { id: 'comboring', name: 'Ring of Rhythm', desc: 'Adds Rhythm: gain 2 energy once per fight.', icon: 'ring', cost: 55 },
  deathward: { id: 'deathward', name: 'Death Ward', desc: 'Adds Phoenix Rite: a big heal and block once per fight.', icon: 'ankh', cost: 80 },
  focuscrystal: { id: 'focuscrystal', name: 'Focus Crystal', desc: 'Adds Clarity: your next attack deals double.', icon: 'gem', cost: 60 },
};

export const ALL_RELICS = Object.keys(RELICS) as RelicId[];
