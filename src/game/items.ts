import { RELICS, type RelicId } from './relics';
import type { SkillId } from './skills';

export type Slot = 'weapon' | 'helm' | 'body' | 'shield' | 'amulet' | 'ring';
export const SLOTS: Slot[] = ['weapon', 'helm', 'body', 'shield', 'amulet', 'ring'];
export type ToolKind = 'pickaxe' | 'axe' | 'rod';
export type ItemKind = 'ore' | 'gem' | 'bar' | 'log' | 'fish' | 'food' | 'gear' | 'tool' | 'seed' | 'crop' | 'trinket' | 'misc';

export interface ItemDef {
  id: string;
  name: string;
  icon: string;
  tint?: Record<string, string>;
  kind: ItemKind;
  value: number;
  heal?: number;
  equip?: { slot: Slot; skill?: SkillId; level: number; dmg?: number; dr?: number; relic?: RelicId };
  tool?: { kind: ToolKind; tier: number; level: number; skill: SkillId; bonus: number };
  desc?: string;
}

export const ITEMS: Record<string, ItemDef> = {};

/** Log tiers, cheapest first. Better bars need hotter fuel. */
export const LOG_ORDER = ['log-normal', 'log-oak', 'log-willow', 'log-maple', 'log-yew', 'log-magic'];
const add = (d: ItemDef) => (ITEMS[d.id] = d);

// ---------- metals ----------
export const METALS = [
  { id: 'bronze', name: 'Bronze', y: '#b8743a', Y: '#e8a86a', tier: 1, smith: 1, wield: 1, barValue: 10 },
  { id: 'iron', name: 'Iron', y: '#6e6a66', Y: '#a8a29a', tier: 2, smith: 15, wield: 5, barValue: 25 },
  { id: 'steel', name: 'Steel', y: '#8a96a0', Y: '#d0dae2', tier: 3, smith: 30, wield: 15, barValue: 50 },
  { id: 'mithril', name: 'Mithril', y: '#3a4a8a', Y: '#7a8ad0', tier: 4, smith: 45, wield: 25, barValue: 120 },
  { id: 'adamant', name: 'Adamant', y: '#2e6a3e', Y: '#6ab07a', tier: 5, smith: 60, wield: 35, barValue: 250 },
  { id: 'rune', name: 'Rune', y: '#2a8a96', Y: '#7ae0e8', tier: 6, smith: 75, wield: 45, barValue: 600 },
] as const;
export type MetalId = (typeof METALS)[number]['id'];

/** Forgeable items per metal: bars used, smithing level offset. */
export const FORGE_PIECES = [
  { piece: 'sword', name: 'Sword', icon: 'sword', bars: 1, offset: 0 },
  { piece: 'pickaxe', name: 'Pickaxe', icon: 'pickaxe', bars: 2, offset: 1 },
  { piece: 'hatchet', name: 'Hatchet', icon: 'axe', bars: 2, offset: 1 },
  { piece: 'helm', name: 'Helm', icon: 'helm', bars: 1, offset: 3 },
  { piece: 'shield', name: 'Kiteshield', icon: 'shield', bars: 2, offset: 6 },
  { piece: 'body', name: 'Platebody', icon: 'body', bars: 3, offset: 9 },
] as const;

for (const m of METALS) {
  const tint = { y: m.y, Y: m.Y, g: m.y, w: m.Y };
  add({ id: `bar-${m.id}`, name: `${m.name} bar`, icon: 'bar', tint: { y: m.y, Y: m.Y }, kind: 'bar', value: m.barValue });
  for (const p of FORGE_PIECES) {
    const id = `${m.id}-${p.piece}`;
    const value = Math.round(p.bars * m.barValue * 1.3);
    const name = `${m.name} ${p.name.toLowerCase()}`;
    if (p.piece === 'pickaxe' || p.piece === 'hatchet') {
      const skill: SkillId = p.piece === 'pickaxe' ? 'mining' : 'woodcutting';
      add({ id, name, icon: p.icon, tint, kind: 'tool', value, tool: { kind: p.piece === 'pickaxe' ? 'pickaxe' : 'axe', tier: m.tier, level: m.wield, skill, bonus: 0.05 * m.tier } });
    } else if (p.piece === 'sword') {
      add({ id, name, icon: p.icon, tint, kind: 'gear', value, equip: { slot: 'weapon', skill: 'attack', level: m.wield, dmg: [0.1, 0.2, 0.35, 0.5, 0.7, 0.95][m.tier - 1] } });
    } else {
      const per = p.piece === 'helm' ? 0.01 : p.piece === 'shield' ? 0.02 : 0.03;
      add({ id, name, icon: p.icon, tint, kind: 'gear', value, equip: { slot: p.piece as Slot, skill: 'defence', level: m.wield, dr: +(per * m.tier).toFixed(3) } });
    }
  }
}

// ---------- rods (shop) ----------
const RODS = [
  { id: 'rod-basic', name: 'Fishing rod', tier: 1, level: 1, value: 10, Y: '#c8a040' },
  { id: 'rod-fly', name: 'Fly rod', tier: 3, level: 15, value: 200, Y: '#a0e0ff' },
  { id: 'rod-harpoon', name: 'Harpoon', tier: 5, level: 40, value: 200, Y: '#e03a2a' },
];
for (const r of RODS) add({ id: r.id, name: r.name, icon: 'rod', tint: { Y: r.Y }, kind: 'tool', value: r.value, tool: { kind: 'rod', tier: r.tier, level: r.level, skill: 'fishing', bonus: 0.05 * r.tier } });

// ---------- ores & gems ----------
const ORES = [
  ['copper', 'Copper ore', '#c87a3a', '#f0b070', 4],
  ['tin', 'Tin ore', '#a8a8a0', '#e0e0d8', 4],
  ['iron', 'Iron ore', '#7a4a3a', '#b07a6a', 10],
  ['coal', 'Coal', '#1e1e22', '#4a4a52', 15],
  ['mithril', 'Mithril ore', '#3a4a8a', '#7a8ad0', 50],
  ['adamantite', 'Adamantite ore', '#2e6a3e', '#6ab07a', 110],
  ['runite', 'Runite ore', '#2a8a96', '#7ae0e8', 280],
] as const;
for (const [id, name, y, Y, value] of ORES) add({ id: `ore-${id}`, name, icon: 'ore', tint: { y, Y }, kind: 'ore', value });
const GEMS = [
  ['sapphire', 'Sapphire', '#2a50c0', '#8ab0ff', 50],
  ['emerald', 'Emerald', '#2a9a4a', '#8af0a0', 100],
  ['ruby', 'Ruby', '#b01a2a', '#ff8090', 200],
  ['diamond', 'Diamond', '#b0d0e0', '#ffffff', 450],
] as const;
for (const [id, name, c, C, value] of GEMS) add({ id: `gem-${id}`, name, icon: 'gem', tint: { c, C }, kind: 'gem', value });

// ---------- logs ----------
const LOGS = [
  ['normal', 'Logs', '#6a4a2a', 2],
  ['oak', 'Oak logs', '#8a6a3a', 8],
  ['willow', 'Willow logs', '#7a7a3a', 15],
  ['maple', 'Maple logs', '#9a4a1a', 30],
  ['yew', 'Yew logs', '#5a3a1a', 70],
  ['magic', 'Magic logs', '#4a6a9a', 180],
] as const;
for (const [id, name, b, value] of LOGS) add({ id: `log-${id}`, name, icon: 'log', tint: { b }, kind: 'log', value });

// ---------- fish ----------
export const FISH = [
  // id, name, color, heal, raw value
  ['shrimp', 'Shrimp', '#e08a8a', 3, 2],
  ['sardine', 'Sardine', '#8aa0b0', 4, 4],
  ['trout', 'Trout', '#9ab07a', 7, 10],
  ['salmon', 'Salmon', '#e0906a', 9, 15],
  ['lobster', 'Lobster', '#c03a2a', 12, 40],
  ['swordfish', 'Swordfish', '#6a8ac0', 14, 60],
  ['shark', 'Shark', '#7a8a9a', 20, 150],
] as const;
for (const [id, name, y, heal, value] of FISH) {
  add({ id: `raw-${id}`, name: `Raw ${name.toLowerCase()}`, icon: 'fish', tint: { y, Y: '#f0e8d8' }, kind: 'fish', value });
  add({ id: `cooked-${id}`, name, icon: 'fish', tint: { y: '#8a5a2a', Y: '#d0a060' }, kind: 'food', value: Math.round(value * 1.6), heal });
}
add({ id: 'bread', name: 'Bread', icon: 'bread', kind: 'food', value: 6, heal: 3 });
add({ id: 'dish-soup', name: 'Onion soup', icon: 'pot', tint: { g: '#d0b080', d: '#6a4a2a' }, kind: 'food', value: 25, heal: 8 });
add({ id: 'dish-pie', name: "Fisherman's pie", icon: 'bread', tint: { o: '#c08a4a', Y: '#f0d0a0' }, kind: 'food', value: 60, heal: 18 });
add({ id: 'dish-stew', name: "Hunter's stew", icon: 'pot', tint: { g: '#c05a2a', d: '#6a2a1a' }, kind: 'food', value: 140, heal: 26 });
add({ id: 'dish-feast', name: 'Shark feast', icon: 'pot', tint: { g: '#6ab07a', d: '#2a4a3a' }, kind: 'food', value: 320, heal: 38 });

// ---------- farming ----------
export const CROPS = [
  // id, name, color, heal, value
  ['potato', 'Potato', '#b08a5a', 2, 3],
  ['onion', 'Onion', '#d0b080', 2, 5],
  ['cabbage', 'Cabbage', '#6aa04a', 3, 8],
  ['tomato', 'Tomato', '#d03a2a', 5, 14],
  ['strawberry', 'Strawberry', '#e02a4a', 7, 25],
  ['watermelon', 'Watermelon', '#3a8a3a', 10, 45],
  ['snapdragon', 'Snapdragon', '#c04ac0', 0, 150],
] as const;
for (const [id, name, y, heal, value] of CROPS) {
  add({ id: `seed-${id}`, name: `${name} seed`, icon: 'seed', tint: { y }, kind: 'seed', value: Math.max(1, Math.round(value / 3)) });
  add({ id: `crop-${id}`, name, icon: 'crop', tint: { y }, kind: heal ? 'food' : 'crop', value, heal: heal || undefined });
}

// ---------- misc ----------
add({ id: 'bones', name: 'Bones', icon: 'bones', kind: 'misc', value: 5 });
add({ id: 'big-bones', name: 'Big bones', icon: 'bones', tint: { w: '#fff8e0' }, kind: 'misc', value: 20 });
add({ id: 'bird-nest', name: "Bird's nest", icon: 'nest', kind: 'misc', value: 30, desc: 'Open it for seeds.' });
add({ id: 'casket', name: 'Casket', icon: 'chest', kind: 'misc', value: 60, desc: 'Open it for coins.' });
add({ id: 'key-crypt', name: 'Crypt key', icon: 'key', tint: { y: '#9a9486', Y: '#e8e0cc' }, kind: 'misc', value: 0, desc: 'Opens the Sunken Crypt. Dropped by the Old Graveyard boss.' });
add({ id: 'key-bog', name: 'Bog lantern', icon: 'key', tint: { y: '#4a7a3a', Y: '#8ab04a' }, kind: 'misc', value: 0, desc: 'Lights the way into the Weeping Bog. Dropped by the Crypt boss.' });
add({ id: 'key-keep', name: 'Keep sigil', icon: 'key', tint: { y: '#8a1414', Y: '#e03a2a' }, kind: 'misc', value: 0, desc: 'Opens the gates of the Ruined Keep. Dropped by the Bog boss.' });

// ---------- trinkets (relics as jewellery) ----------
const RING_RELICS: RelicId[] = ['ironskin', 'venomgland', 'goldtooth', 'grimoire', 'wardstone', 'comboring'];
for (const r of Object.values(RELICS)) {
  const slot: Slot = RING_RELICS.includes(r.id) ? 'ring' : 'amulet';
  add({ id: `relic-${r.id}`, name: r.name, icon: r.icon, kind: 'trinket', value: r.cost * 10, equip: { slot, level: 1, relic: r.id }, desc: r.desc });
}

export function item(id: string): ItemDef {
  const d = ITEMS[id];
  if (!d) throw new Error(`unknown item ${id}`);
  return d;
}
