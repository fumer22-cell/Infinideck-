import { pick, randInt, rand, type Rng } from './rng';

export type Biome = 'crypt' | 'bog' | 'keep';
export const BIOMES: Record<Biome, { name: string; flavor: string }> = {
  crypt: { name: 'The Sunken Crypt', flavor: 'Bones rattle in the dark.' },
  bog: { name: 'The Weeping Bog', flavor: 'Something stirs beneath the reeds.' },
  keep: { name: 'The Ruined Keep', flavor: 'Broken banners, broken men.' },
};

export interface EnemyTemplate {
  id: string;
  name: string;
  sprite: string;
  hp: number; // base hp at depth 0
  atk: number;
  pattern: ('attack' | 'block' | 'buff')[];
  biomes: Biome[];
}

export const ENEMIES: EnemyTemplate[] = [
  { id: 'rat', name: 'Plague Rat', sprite: 'rat', hp: 12, atk: 2, pattern: ['attack', 'attack', 'buff'], biomes: ['crypt', 'bog', 'keep'] },
  { id: 'skeleton', name: 'Restless Bones', sprite: 'skeleton', hp: 16, atk: 3, pattern: ['attack', 'block', 'attack'], biomes: ['crypt', 'keep'] },
  { id: 'ghoul', name: 'Crypt Ghoul', sprite: 'ghoul', hp: 20, atk: 3, pattern: ['attack', 'attack', 'buff', 'attack'], biomes: ['crypt'] },
  { id: 'slime', name: 'Bog Ooze', sprite: 'slime', hp: 18, atk: 2, pattern: ['block', 'attack', 'attack'], biomes: ['bog'] },
  { id: 'wisp', name: 'Marsh Wisp', sprite: 'wisp', hp: 11, atk: 4, pattern: ['attack', 'buff', 'attack'], biomes: ['bog'] },
  { id: 'bat', name: 'Carrion Bat', sprite: 'bat', hp: 10, atk: 3, pattern: ['attack', 'attack'], biomes: ['crypt', 'bog', 'keep'] },
  { id: 'knight', name: 'Hollow Knight', sprite: 'knight', hp: 24, atk: 4, pattern: ['block', 'attack', 'attack', 'buff'], biomes: ['keep'] },
  { id: 'cultist', name: 'Ashen Cultist', sprite: 'cultist', hp: 15, atk: 3, pattern: ['buff', 'attack', 'attack'], biomes: ['keep', 'crypt'] },
];

export const BOSSES: (EnemyTemplate & { title: string })[] = [
  { id: 'lich', name: 'Morvath', title: 'the Lich Unremembered', sprite: 'lich', hp: 50, atk: 5, pattern: ['attack', 'buff', 'attack', 'block', 'attack'], biomes: ['crypt'] },
  { id: 'hag', name: 'Grandmother Silt', title: 'Hag of the Bog', sprite: 'hag', hp: 46, atk: 5, pattern: ['attack', 'attack', 'block', 'buff'], biomes: ['bog'] },
  { id: 'king', name: 'Aldric', title: 'the Fallen King', sprite: 'king', hp: 56, atk: 6, pattern: ['block', 'attack', 'attack', 'buff', 'attack'], biomes: ['keep'] },
];

export type IntentKind = 'attack' | 'block' | 'buff';
export interface Intent { kind: IntentKind; value: number }

export interface EnemyState {
  id: string;
  name: string;
  sprite: string;
  hp: number;
  maxHp: number;
  block: number;
  atk: number;
  poison: number;
  patternIdx: number;
  pattern: IntentKind[];
  intent: Intent;
  boss: boolean;
}

export function intentFor(e: Pick<EnemyState, 'pattern' | 'patternIdx' | 'atk'>): Intent {
  const kind = e.pattern[e.patternIdx % e.pattern.length];
  if (kind === 'attack') return { kind, value: e.atk };
  if (kind === 'block') return { kind, value: Math.ceil(e.atk * 1.5) };
  return { kind, value: 1 };
}

/**
 * Spawn an enemy. `hpBudget` is roughly the number of cards the fight should last,
 * so fight length stays sensible no matter how strong the deck is.
 */
export function spawnEnemy(biome: Biome, depth: number, avgPower: number, cardsTarget: number, boss = false, rng: Rng = rand): EnemyState {
  const pool = boss ? BOSSES.filter((b) => b.biomes.includes(biome)) : ENEMIES.filter((e) => e.biomes.includes(biome));
  const t = pick(pool, rng);
  const scale = 1 + depth * 0.06;
  // ~75% of card power turns into damage on average (heals/wards deal none).
  const toughness = boss ? 1 : Math.min(1.3, Math.max(0.7, t.hp / 16));
  const hp = Math.max(6, Math.round(avgPower * 0.75 * cardsTarget * toughness * scale + randInt(-2, 2, rng)));
  const atk = Math.round(t.atk * scale);
  const e: EnemyState = {
    id: t.id,
    name: boss ? `${t.name}, ${(t as (typeof BOSSES)[number]).title}` : t.name,
    sprite: t.sprite,
    hp,
    maxHp: hp,
    block: 0,
    atk,
    poison: 0,
    patternIdx: randInt(0, t.pattern.length - 1, rng),
    pattern: t.pattern,
    intent: { kind: 'attack', value: 0 },
    boss,
  };
  e.intent = intentFor(e);
  return e;
}
