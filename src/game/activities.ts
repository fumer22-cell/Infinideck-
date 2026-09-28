import type { Biome } from './enemies';
import { CROPS, FISH, FORGE_PIECES, METALS } from './items';
import type { SkillId } from './skills';

// ---------- gathering: one card = one resource ----------
export interface GatherNode {
  id: string;
  skill: 'mining' | 'woodcutting' | 'fishing';
  name: string;
  level: number;
  xp: number;
  item: string;
  /** rare finds rolled per action */
  rare: { item: string; chance: number }[];
}

const GEM_FINDS = [
  { item: 'gem-sapphire', chance: 1 / 90 },
  { item: 'gem-emerald', chance: 1 / 180 },
  { item: 'gem-ruby', chance: 1 / 360 },
  { item: 'gem-diamond', chance: 1 / 720 },
];

export const GATHER: GatherNode[] = [
  // mining
  { id: 'rock-copper', skill: 'mining', name: 'Copper rock', level: 1, xp: 25, item: 'ore-copper', rare: GEM_FINDS },
  { id: 'rock-tin', skill: 'mining', name: 'Tin rock', level: 1, xp: 25, item: 'ore-tin', rare: GEM_FINDS },
  { id: 'rock-iron', skill: 'mining', name: 'Iron rock', level: 10, xp: 40, item: 'ore-iron', rare: GEM_FINDS },
  { id: 'rock-coal', skill: 'mining', name: 'Coal seam', level: 20, xp: 50, item: 'ore-coal', rare: GEM_FINDS },
  { id: 'rock-mithril', skill: 'mining', name: 'Mithril vein', level: 35, xp: 70, item: 'ore-mithril', rare: GEM_FINDS },
  { id: 'rock-adamantite', skill: 'mining', name: 'Adamantite vein', level: 50, xp: 95, item: 'ore-adamantite', rare: GEM_FINDS },
  { id: 'rock-runite', skill: 'mining', name: 'Runite vein', level: 70, xp: 130, item: 'ore-runite', rare: GEM_FINDS },
  // woodcutting
  ...(
    [
      ['normal', 'Dead tree', 1, 25],
      ['oak', 'Oak tree', 10, 40],
      ['willow', 'Willow tree', 20, 55],
      ['maple', 'Maple tree', 35, 75],
      ['yew', 'Yew tree', 50, 100],
      ['magic', 'Magic tree', 70, 140],
    ] as const
  ).map(([id, name, level, xp]) => ({ id: `tree-${id}`, skill: 'woodcutting' as const, name, level, xp, item: `log-${id}`, rare: [{ item: 'bird-nest', chance: 1 / 80 }] })),
  // fishing
  ...FISH.map(([id, name], i) => ({
    id: `spot-${id}`,
    skill: 'fishing' as const,
    name: `${name} spot`,
    level: [1, 5, 15, 25, 40, 50, 70][i],
    xp: [25, 30, 45, 60, 85, 100, 140][i],
    item: `raw-${id}`,
    rare: [{ item: 'casket', chance: 1 / 100 }],
  })),
];

// ---------- cooking: one card = one fish ----------
export interface CookRecipe { id: string; name: string; level: number; xp: number; input: string; output: string }
export const COOKING: CookRecipe[] = FISH.map(([id, name], i) => ({
  id: `cook-${id}`,
  name,
  level: [1, 5, 15, 25, 40, 50, 70][i],
  xp: [30, 40, 70, 90, 120, 140, 210][i],
  input: `raw-${id}`,
  output: `cooked-${id}`,
}));

// ---------- smithing ----------
/** Smelting runs in real time in the furnace; each bar also burns one log. */
export interface SmeltRecipe { id: string; bar: string; name: string; level: number; xp: number; inputs: Record<string, number>; msEach: number }
export const SMELTING: SmeltRecipe[] = [
  { id: 'smelt-bronze', bar: 'bar-bronze', name: 'Bronze bar', level: 1, xp: 15, inputs: { 'ore-copper': 1, 'ore-tin': 1 }, msEach: 20_000 },
  { id: 'smelt-iron', bar: 'bar-iron', name: 'Iron bar', level: 15, xp: 30, inputs: { 'ore-iron': 1 }, msEach: 30_000 },
  { id: 'smelt-steel', bar: 'bar-steel', name: 'Steel bar', level: 30, xp: 45, inputs: { 'ore-iron': 1, 'ore-coal': 2 }, msEach: 40_000 },
  { id: 'smelt-mithril', bar: 'bar-mithril', name: 'Mithril bar', level: 45, xp: 70, inputs: { 'ore-mithril': 1, 'ore-coal': 3 }, msEach: 60_000 },
  { id: 'smelt-adamant', bar: 'bar-adamant', name: 'Adamant bar', level: 60, xp: 95, inputs: { 'ore-adamantite': 1, 'ore-coal': 4 }, msEach: 75_000 },
  { id: 'smelt-rune', bar: 'bar-rune', name: 'Rune bar', level: 75, xp: 125, inputs: { 'ore-runite': 1, 'ore-coal': 5 }, msEach: 90_000 },
];
export const smeltBatchCap = (smithingLevel: number) => 10 + smithingLevel;

/** Forging is active: one card = one finished item. */
export interface ForgeRecipe { id: string; output: string; name: string; level: number; xp: number; bars: number; bar: string }
export const FORGING: ForgeRecipe[] = METALS.flatMap((m) =>
  FORGE_PIECES.map((p) => ({
    id: `forge-${m.id}-${p.piece}`,
    output: `${m.id}-${p.piece}`,
    name: `${m.name} ${p.name.toLowerCase()}`,
    level: Math.min(99, m.smith + p.offset),
    xp: p.bars * [25, 40, 60, 85, 115, 150][m.tier - 1],
    bars: p.bars,
    bar: `bar-${m.id}`,
  })),
);

// ---------- farming: plant with a card check, grows in real time ----------
export interface SeedDef { id: string; seed: string; crop: string; name: string; level: number; growMs: number; plantXp: number; harvestXp: number; yield: [number, number] }
const MIN = 60_000;
export const SEEDS: SeedDef[] = CROPS.map(([id, name], i) => ({
  id: `plant-${id}`,
  seed: `seed-${id}`,
  crop: `crop-${id}`,
  name,
  level: [1, 5, 15, 25, 35, 50, 62][i],
  growMs: [15, 30, 60, 120, 180, 300, 480][i] * MIN,
  plantXp: [10, 15, 25, 40, 60, 90, 150][i],
  harvestXp: [8, 12, 20, 32, 48, 72, 120][i],
  yield: [4, 8] as [number, number],
}));
export const plotCount = (farmingLevel: number) => 2 + (farmingLevel >= 15 ? 1 : 0) + (farmingLevel >= 35 ? 1 : 0) + (farmingLevel >= 55 ? 1 : 0);

// ---------- combat ----------
export interface Drop { item: string; chance: number; min?: number; max?: number }
export interface MonsterDef {
  id: string;
  name: string;
  sprite: string;
  hp: number;
  atk: number;
  pattern: ('attack' | 'block' | 'buff')[];
  gold: [number, number];
  drops: Drop[];
  boss?: boolean;
}
export interface AreaDef { id: string; name: string; biome: Biome; level: number; flavor: string; monsters: MonsterDef[]; boss: MonsterDef; bossAfter: number }

const trinkets = (chance: number): Drop[] =>
  ['twinstrike', 'easyheal', 'ironskin', 'venomgland', 'goldtooth', 'ember', 'grimoire', 'bloodvial', 'wardstone', 'comboring', 'deathward', 'focuscrystal'].map((r) => ({ item: `relic-${r}`, chance: chance / 12 }));

export const AREAS: AreaDef[] = [
  {
    id: 'graveyard',
    name: 'The Old Graveyard',
    biome: 'keep',
    level: 1,
    flavor: 'Rats and restless dead among the headstones.',
    bossAfter: 10,
    monsters: [
      { id: 'rat', name: 'Plague Rat', sprite: 'rat', hp: 10, atk: 1, pattern: ['attack', 'attack', 'buff'], gold: [1, 4], drops: [{ item: 'bones', chance: 0.5 }, { item: 'seed-potato', chance: 0.15, min: 1, max: 3 }] },
      { id: 'skeleton', name: 'Restless Bones', sprite: 'skeleton', hp: 16, atk: 2, pattern: ['attack', 'block', 'attack'], gold: [2, 6], drops: [{ item: 'bones', chance: 1 }, { item: 'bronze-sword', chance: 0.03 }, { item: 'seed-onion', chance: 0.08, min: 1, max: 2 }] },
      { id: 'bat', name: 'Carrion Bat', sprite: 'bat', hp: 12, atk: 2, pattern: ['attack', 'attack'], gold: [1, 5], drops: [{ item: 'bones', chance: 0.4 }, { item: 'ore-copper', chance: 0.1, min: 2, max: 5 }] },
    ],
    boss: { id: 'gravedigger', name: 'Old Mortis, the Gravedigger', sprite: 'ghoul', hp: 70, atk: 4, pattern: ['attack', 'buff', 'attack', 'block'], gold: [40, 80], drops: [{ item: 'big-bones', chance: 1 }, { item: 'iron-sword', chance: 0.25 }, ...trinkets(0.12)], boss: true },
  },
  {
    id: 'crypt',
    name: 'The Sunken Crypt',
    biome: 'crypt',
    level: 10,
    flavor: 'Bones rattle in the dark.',
    bossAfter: 10,
    monsters: [
      { id: 'ghoul', name: 'Crypt Ghoul', sprite: 'ghoul', hp: 28, atk: 4, pattern: ['attack', 'attack', 'buff', 'attack'], gold: [5, 14], drops: [{ item: 'bones', chance: 1 }, { item: 'ore-iron', chance: 0.12, min: 1, max: 4 }, { item: 'seed-cabbage', chance: 0.06, min: 1, max: 2 }] },
      { id: 'cultist', name: 'Ashen Cultist', sprite: 'cultist', hp: 24, atk: 4, pattern: ['buff', 'attack', 'attack'], gold: [8, 20], drops: [{ item: 'bones', chance: 1 }, { item: 'gem-sapphire', chance: 0.03 }, { item: 'seed-tomato', chance: 0.05 }] },
      { id: 'skeleton2', name: 'Bone Sentry', sprite: 'skeleton', hp: 26, atk: 3, pattern: ['block', 'attack', 'attack'], gold: [5, 12], drops: [{ item: 'bones', chance: 1 }, { item: 'iron-helm', chance: 0.04 }] },
    ],
    boss: { id: 'lich', name: 'Morvath, the Lich Unremembered', sprite: 'lich', hp: 150, atk: 7, pattern: ['attack', 'buff', 'attack', 'block', 'attack'], gold: [120, 220], drops: [{ item: 'big-bones', chance: 1 }, { item: 'steel-sword', chance: 0.25 }, { item: 'gem-emerald', chance: 0.3 }, ...trinkets(0.2)], boss: true },
  },
  {
    id: 'bog',
    name: 'The Weeping Bog',
    biome: 'bog',
    level: 20,
    flavor: 'Something stirs beneath the reeds.',
    bossAfter: 12,
    monsters: [
      { id: 'slime', name: 'Bog Ooze', sprite: 'slime', hp: 42, atk: 5, pattern: ['block', 'attack', 'attack'], gold: [10, 25], drops: [{ item: 'ore-coal', chance: 0.2, min: 2, max: 6 }, { item: 'seed-strawberry', chance: 0.05 }] },
      { id: 'wisp', name: 'Marsh Wisp', sprite: 'wisp', hp: 34, atk: 7, pattern: ['attack', 'buff', 'attack'], gold: [12, 30], drops: [{ item: 'gem-emerald', chance: 0.03 }, { item: 'seed-watermelon', chance: 0.02 }] },
      { id: 'rat2', name: 'Bloated Rat', sprite: 'rat', hp: 30, atk: 5, pattern: ['attack', 'attack', 'buff'], gold: [8, 20], drops: [{ item: 'bones', chance: 1 }, { item: 'raw-salmon', chance: 0.15, min: 1, max: 3 }] },
    ],
    boss: { id: 'hag', name: 'Grandmother Silt, Hag of the Bog', sprite: 'hag', hp: 240, atk: 9, pattern: ['attack', 'attack', 'block', 'buff'], gold: [250, 450], drops: [{ item: 'big-bones', chance: 1 }, { item: 'mithril-sword', chance: 0.2 }, { item: 'gem-ruby', chance: 0.25 }, { item: 'seed-snapdragon', chance: 0.3, min: 1, max: 3 }, ...trinkets(0.25)], boss: true },
  },
  {
    id: 'keep',
    name: 'The Ruined Keep',
    biome: 'keep',
    level: 35,
    flavor: 'Broken banners, broken men.',
    bossAfter: 12,
    monsters: [
      { id: 'knight', name: 'Hollow Knight', sprite: 'knight', hp: 75, atk: 9, pattern: ['block', 'attack', 'attack', 'buff'], gold: [25, 60], drops: [{ item: 'bones', chance: 1 }, { item: 'ore-mithril', chance: 0.1, min: 1, max: 3 }, { item: 'adamant-helm', chance: 0.02 }] },
      { id: 'cultist2', name: 'Ember Priest', sprite: 'cultist', hp: 60, atk: 9, pattern: ['buff', 'attack', 'attack'], gold: [30, 70], drops: [{ item: 'gem-ruby', chance: 0.03 }, { item: 'seed-snapdragon', chance: 0.03 }] },
      { id: 'bat2', name: 'Keep Stalker', sprite: 'bat', hp: 48, atk: 8, pattern: ['attack', 'attack'], gold: [20, 45], drops: [{ item: 'bones', chance: 0.5 }, { item: 'ore-adamantite', chance: 0.06, min: 1, max: 2 }] },
    ],
    boss: { id: 'king', name: 'Aldric, the Fallen King', sprite: 'king', hp: 400, atk: 13, pattern: ['block', 'attack', 'attack', 'buff', 'attack'], gold: [600, 1100], drops: [{ item: 'big-bones', chance: 1 }, { item: 'rune-sword', chance: 0.15 }, { item: 'gem-diamond', chance: 0.25 }, ...trinkets(0.35)], boss: true },
  },
];
export const AREA_BY_ID = Object.fromEntries(AREAS.map((a) => [a.id, a])) as Record<string, AreaDef>;

// ---------- shop ----------
export const SHOP: { item: string; price: number; level?: { skill: SkillId; level: number } }[] = [
  { item: 'bread', price: 12 },
  { item: 'seed-potato', price: 5 },
  { item: 'seed-onion', price: 12, level: { skill: 'farming', level: 5 } },
  { item: 'seed-cabbage', price: 25, level: { skill: 'farming', level: 15 } },
  { item: 'seed-tomato', price: 50, level: { skill: 'farming', level: 25 } },
  { item: 'seed-strawberry', price: 90, level: { skill: 'farming', level: 35 } },
  { item: 'seed-watermelon', price: 180, level: { skill: 'farming', level: 50 } },
  { item: 'rod-fly', price: 400, level: { skill: 'fishing', level: 20 } },
  { item: 'rod-harpoon', price: 2500, level: { skill: 'fishing', level: 40 } },
  { item: 'bronze-pickaxe', price: 40 },
  { item: 'bronze-hatchet', price: 40 },
];
