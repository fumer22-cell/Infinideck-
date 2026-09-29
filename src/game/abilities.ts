/**
 * Ability cards: what you play in combat. Flashcards don't carry abilities;
 * answering one gives energy, and energy pays for these. Your deck comes from
 * your loadout: weapon, armour, trinkets, packed food and combat techniques.
 */
import { ITEMS, SLOTS, baseItemId } from './items';
import type { RelicId } from './relics';
import { attackMult, defenceReduction, strengthMult, type Levels, type SkillId } from './skills';

export type AbilityId =
  | 'punch' | 'guard'
  | 'slash' | 'lunge' | 'parry'
  | 'stab' | 'twinfang' | 'envenom'
  | 'chop' | 'cleave' | 'sunder'
  | 'shieldbash' | 'steady' | 'bulwark'
  | 'focus' | 'brace' | 'warcry' | 'secondwind' | 'riposte' | 'feint' | 'overpower'
  | 'flurry' | 'feather' | 'ironskin' | 'plague' | 'gilded' | 'starfall' | 'insight' | 'soulrend' | 'hexward' | 'rhythm' | 'phoenix' | 'clarity'
  | 'eat';

/** One card in a fight: an ability, maybe upgraded (+) by a masterwork item. */
export interface CardInst { uid: number; id: AbilityId; plus?: boolean; food?: string }

/** Your numbers in a fight. Card text and effects are computed from these. */
export interface CombatStats {
  /** damage of a basic hit */
  power: number;
  /** block of a basic Guard */
  guard: number;
  /** fraction of incoming damage ignored */
  reduction: number;
  maxHp: number;
}

/** What a card can do. The engine in combat.ts implements it. */
export interface CardApi {
  hit(amount: number, opts?: { pierce?: boolean }): number;
  block(amount: number): void;
  heal(amount: number): number;
  poison(amount: number): void;
  weak(turns: number): void;
  vuln(turns: number): void;
  stun(): void;
  draw(n: number): void;
  energy(n: number): void;
  focus(mult: number): void;
  strength(n: number): void;
  goldOnKill(): void;
}

export interface AbilityDef {
  id: AbilityId;
  name: string;
  icon: string;
  cost: number;
  kind: 'attack' | 'skill' | 'item';
  /** removed for the rest of the fight once played */
  exhaust?: boolean;
  text: (n: Num) => string;
  play: (api: CardApi, n: Num, extra: { foodHeal: number }) => void;
}

/** Number helpers for one card: damage and block scaled by your stats, and +30% when upgraded. */
export interface Num { d: (m: number) => number; g: (m: number) => number; hp: (frac: number) => number; k: number; food?: string }

export function num(s: CombatStats, plus = false, food?: string): Num {
  const k = plus ? 1.3 : 1;
  return {
    d: (m) => Math.max(1, Math.round(m * s.power * k)),
    g: (m) => Math.max(1, Math.round(m * s.guard * k)),
    hp: (f) => Math.max(1, Math.round(f * s.maxHp * k)),
    k,
    food,
  };
}

const A = (d: AbilityDef) => d;
export const ABILITIES: Record<AbilityId, AbilityDef> = {
  // basics
  punch: A({ id: 'punch', name: 'Punch', icon: 'fist', cost: 1, kind: 'attack', text: (n) => `Deal ${n.d(1)}.`, play: (a, n) => void a.hit(n.d(1)) }),
  guard: A({ id: 'guard', name: 'Guard', icon: 'shield', cost: 1, kind: 'skill', text: (n) => `Block ${n.g(1)}.`, play: (a, n) => a.block(n.g(1)) }),
  // swords: steady and balanced
  slash: A({ id: 'slash', name: 'Slash', icon: 'sword', cost: 1, kind: 'attack', text: (n) => `Deal ${n.d(1.1)}.`, play: (a, n) => void a.hit(n.d(1.1)) }),
  lunge: A({ id: 'lunge', name: 'Lunge', icon: 'sword', cost: 2, kind: 'attack', text: (n) => `Deal ${n.d(2.4)}.`, play: (a, n) => void a.hit(n.d(2.4)) }),
  parry: A({ id: 'parry', name: 'Parry', icon: 'sword', cost: 1, kind: 'skill', text: (n) => `Block ${n.g(0.7)}. Deal ${n.d(0.5)}.`, play: (a, n) => { a.block(n.g(0.7)); a.hit(n.d(0.5)); } }),
  // daggers: cheap, many hits, poison
  stab: A({ id: 'stab', name: 'Stab', icon: 'daggers', cost: 0, kind: 'attack', text: (n) => `Deal ${n.d(0.5)}.`, play: (a, n) => void a.hit(n.d(0.5)) }),
  twinfang: A({ id: 'twinfang', name: 'Twin Fang', icon: 'daggers', cost: 1, kind: 'attack', text: (n) => `Deal ${n.d(0.65)} twice.`, play: (a, n) => { a.hit(n.d(0.65)); a.hit(n.d(0.65)); } }),
  envenom: A({ id: 'envenom', name: 'Envenom', icon: 'skull', cost: 1, kind: 'skill', text: (n) => `Apply ${n.d(0.7) + 1} poison.`, play: (a, n) => a.poison(n.d(0.7) + 1) }),
  // battleaxes: heavy, break armour
  chop: A({ id: 'chop', name: 'Chop', icon: 'axe', cost: 1, kind: 'attack', text: (n) => `Deal ${n.d(1.25)}.`, play: (a, n) => void a.hit(n.d(1.25)) }),
  cleave: A({ id: 'cleave', name: 'Cleave', icon: 'axe', cost: 2, kind: 'attack', text: (n) => `Deal ${n.d(2.4)}, ignoring block.`, play: (a, n) => void a.hit(n.d(2.4), { pierce: true }) }),
  sunder: A({ id: 'sunder', name: 'Sunder', icon: 'axe', cost: 1, kind: 'attack', text: (n) => `Deal ${n.d(0.6)}. Vulnerable 2: takes +50% damage.`, play: (a, n) => { a.hit(n.d(0.6)); a.vuln(2); } }),
  // armour
  shieldbash: A({ id: 'shieldbash', name: 'Shield Bash', icon: 'shield', cost: 2, kind: 'attack', text: (n) => `Deal ${n.d(0.5)}. Stun: it loses its next move (bosses: Weak 2).`, play: (a, n) => { a.hit(n.d(0.5)); a.stun(); } }),
  steady: A({ id: 'steady', name: 'Steady', icon: 'helm', cost: 0, kind: 'skill', text: (n) => `Block ${n.g(0.4)}. Draw 1.`, play: (a, n) => { a.block(n.g(0.4)); a.draw(1); } }),
  bulwark: A({ id: 'bulwark', name: 'Bulwark', icon: 'body', cost: 2, kind: 'skill', text: (n) => `Block ${n.g(2.6)}.`, play: (a, n) => a.block(n.g(2.6)) }),
  // techniques, unlocked by combat levels
  focus: A({ id: 'focus', name: 'Focus', icon: 'eye', cost: 0, kind: 'skill', text: (n) => `Your next attack deals +${Math.round(50 * n.k)}%.`, play: (a, n) => a.focus(1 + 0.5 * n.k) }),
  brace: A({ id: 'brace', name: 'Brace', icon: 'shield', cost: 0, kind: 'skill', text: (n) => `Block ${n.g(0.5)}.`, play: (a, n) => a.block(n.g(0.5)) }),
  warcry: A({ id: 'warcry', name: 'War Cry', icon: 'fist', cost: 1, kind: 'skill', exhaust: true, text: (n) => `Every hit this fight deals +${Math.round(2 * n.k)}. Once per fight.`, play: (a, n) => a.strength(Math.round(2 * n.k)) }),
  secondwind: A({ id: 'secondwind', name: 'Second Wind', icon: 'heart', cost: 1, kind: 'skill', exhaust: true, text: (n) => `Heal ${n.hp(0.15)}. Once per fight.`, play: (a, n) => void a.heal(n.hp(0.15)) }),
  riposte: A({ id: 'riposte', name: 'Riposte', icon: 'sword', cost: 1, kind: 'attack', text: (n) => `Block ${n.g(0.8)}. Deal ${n.d(0.6)}.`, play: (a, n) => { a.block(n.g(0.8)); a.hit(n.d(0.6)); } }),
  feint: A({ id: 'feint', name: 'Feint', icon: 'eye', cost: 0, kind: 'skill', exhaust: true, text: () => 'Draw 2. Once per fight.', play: (a) => a.draw(2) }),
  overpower: A({ id: 'overpower', name: 'Overpower', icon: 'fist', cost: 2, kind: 'attack', text: (n) => `Deal ${n.d(2.7)}.`, play: (a, n) => void a.hit(n.d(2.7)) }),
  // trinket cards
  flurry: A({ id: 'flurry', name: 'Flurry', icon: 'sigil', cost: 1, kind: 'attack', text: (n) => `Deal ${n.d(0.45)} three times.`, play: (a, n) => { for (let i = 0; i < 3; i++) a.hit(n.d(0.45)); } }),
  feather: A({ id: 'feather', name: 'Feather of Ease', icon: 'feather', cost: 0, kind: 'skill', text: (n) => `Heal ${n.hp(0.06)}. Draw 1.`, play: (a, n) => { a.heal(n.hp(0.06)); a.draw(1); } }),
  ironskin: A({ id: 'ironskin', name: 'Iron Skin', icon: 'shield', cost: 1, kind: 'skill', text: (n) => `Block ${n.g(1.8)}.`, play: (a, n) => a.block(n.g(1.8)) }),
  plague: A({ id: 'plague', name: 'Plague', icon: 'skull', cost: 2, kind: 'attack', text: (n) => `Apply ${n.d(1.2)} poison. Deal ${n.d(0.5)}.`, play: (a, n) => { a.poison(n.d(1.2)); a.hit(n.d(0.5)); } }),
  gilded: A({ id: 'gilded', name: 'Gilded Strike', icon: 'coin', cost: 1, kind: 'attack', text: (n) => `Deal ${n.d(1)}. Double gold if this kills.`, play: (a, n) => { a.goldOnKill(); a.hit(n.d(1)); } }),
  starfall: A({ id: 'starfall', name: 'Starfall', icon: 'star', cost: 3, kind: 'attack', text: (n) => `Deal ${n.d(3.8)}.`, play: (a, n) => void a.hit(n.d(3.8)) }),
  insight: A({ id: 'insight', name: 'Insight', icon: 'book', cost: 0, kind: 'skill', exhaust: true, text: () => 'Draw 2. Once per fight.', play: (a) => a.draw(2) }),
  soulrend: A({ id: 'soulrend', name: 'Soulrend', icon: 'soul', cost: 2, kind: 'attack', text: (n) => `Deal ${n.d(1.6)}. Heal half the damage dealt.`, play: (a, n) => void a.heal(Math.ceil(a.hit(n.d(1.6)) / 2)) }),
  hexward: A({ id: 'hexward', name: 'Hex Ward', icon: 'gem', cost: 1, kind: 'skill', text: (n) => `Block ${n.g(0.8)}. Weak 2: it deals 25% less.`, play: (a, n) => { a.block(n.g(0.8)); a.weak(2); } }),
  rhythm: A({ id: 'rhythm', name: 'Rhythm', icon: 'ring', cost: 0, kind: 'skill', exhaust: true, text: (n) => `Gain ${n.k > 1 ? 3 : 2} energy. Once per fight.`, play: (a, n) => a.energy(n.k > 1 ? 3 : 2) }),
  phoenix: A({ id: 'phoenix', name: 'Phoenix Rite', icon: 'flame', cost: 2, kind: 'skill', exhaust: true, text: (n) => `Heal ${n.hp(0.3)}. Block ${n.g(1)}. Once per fight.`, play: (a, n) => { a.heal(n.hp(0.3)); a.block(n.g(1)); } }),
  clarity: A({ id: 'clarity', name: 'Clarity', icon: 'gem', cost: 0, kind: 'skill', text: () => 'Your next attack deals double.', play: (a) => a.focus(2) }),
  // food you packed
  eat: A({ id: 'eat', name: 'Eat', icon: 'bread', cost: 1, kind: 'item', text: (n) => (n.food ? `Eat 1 ${ITEMS[n.food].name.toLowerCase()}: heal ${ITEMS[n.food].heal}.` : 'Eat your packed food.'), play: (a, _n, x) => void a.heal(x.foodHeal) }),
};

export const RELIC_CARD: Record<RelicId, AbilityId> = {
  twinstrike: 'flurry', easyheal: 'feather', ironskin: 'ironskin', venomgland: 'plague', goldtooth: 'gilded', ember: 'starfall',
  grimoire: 'insight', bloodvial: 'soulrend', wardstone: 'hexward', comboring: 'rhythm', deathward: 'phoenix', focuscrystal: 'clarity',
};

export type WeaponKind = 'sword' | 'dagger' | 'battleaxe';
export const WEAPON_CARDS: Record<WeaponKind | 'none', AbilityId[]> = {
  none: ['punch', 'punch', 'punch'],
  sword: ['slash', 'slash', 'lunge', 'parry'],
  dagger: ['stab', 'stab', 'twinfang', 'envenom'],
  battleaxe: ['chop', 'chop', 'cleave', 'sunder'],
};
export const ARMOUR_CARDS = { shield: 'shieldbash', helm: 'steady', body: 'bulwark' } as const satisfies Record<string, AbilityId>;

/** Techniques you learn by training combat skills. */
export const TECHNIQUES: { id: AbilityId; skill: SkillId; level: number }[] = [
  { id: 'focus', skill: 'attack', level: 5 },
  { id: 'brace', skill: 'defence', level: 5 },
  { id: 'warcry', skill: 'strength', level: 10 },
  { id: 'secondwind', skill: 'hitpoints', level: 15 },
  { id: 'riposte', skill: 'defence', level: 20 },
  { id: 'feint', skill: 'attack', level: 20 },
  { id: 'overpower', skill: 'strength', level: 30 },
];

/** Cards drawn per turn, the most energy you can bank, and the smallest deck allowed. */
export const HAND_SIZE = 4;
export const ENERGY_CAP = 6;
export const MIN_DECK = 5;

/** Energy from one answer: Hard 1, Good 2, Easy 3. Mature cards (21+ day interval) add 1. Again gives none. */
export function energyFor(grade: 1 | 2 | 3 | 4, tier: number): number {
  if (grade === 1) return 0;
  return grade - 1 + (tier >= 2 ? 1 : 0);
}

/** Weapon power by metal tier (0 = bare hands). */
export const weaponPower = (tier: number) => 3 + 2 * tier;

export interface Loadout { equip: Partial<Record<string, string>>; food: string | null; bank: Record<string, number> }

function metalTier(id: string | undefined): number {
  if (!id) return 0;
  const m = /^(bronze|iron|steel|mithril|adamant|rune)-/.exec(baseItemId(id));
  return m ? ['bronze', 'iron', 'steel', 'mithril', 'adamant', 'rune'].indexOf(m[1]) + 1 : 0;
}
export const isMasterwork = (id?: string) => !!id && id.startsWith('mw-');

export function combatStats(l: Loadout, lv: Levels, maxHp: number): CombatStats {
  let armourDr = 0;
  for (const slot of SLOTS) {
    const id = l.equip[slot];
    armourDr += (id && ITEMS[id]?.equip?.dr) || 0;
  }
  const weapon = l.equip.weapon;
  const p = weaponPower(metalTier(weapon)) * attackMult(lv.attack) * strengthMult(lv.strength) * (isMasterwork(weapon) ? 1.15 : 1);
  const guard = (4 + armourDr * 100) * (1 + (lv.defence - 1) * 0.015);
  return {
    power: Math.round(p * 10) / 10,
    guard: Math.round(guard * 10) / 10,
    reduction: Math.min(0.5, defenceReduction(lv.defence) + armourDr * 0.5),
    maxHp,
  };
}

/** The cards an item adds to your deck when equipped. */
export function itemCards(id: string): AbilityId[] {
  const e = ITEMS[id]?.equip;
  if (!e) return [];
  if (e.slot === 'weapon') return WEAPON_CARDS[e.weapon ?? 'sword'];
  if (e.relic) return [RELIC_CARD[e.relic]];
  if (e.slot === 'shield' || e.slot === 'helm' || e.slot === 'body') return [ARMOUR_CARDS[e.slot]];
  return [];
}

/** Every card your loadout offers. `key` is stable so you can switch cards on and off. */
export interface PoolCard { key: string; id: AbilityId; plus: boolean; source: string; food?: string }

export function cardPool(l: Loadout, lv: Levels): PoolCard[] {
  const out: PoolCard[] = [];
  const push = (ids: readonly AbilityId[], source: string, plus = false, food?: string) => {
    const seen: Record<string, number> = {};
    for (const id of ids) {
      const n = (seen[id] = (seen[id] ?? 0) + 1);
      out.push({ key: `${source}:${id}:${n}`, id, plus, source, food });
    }
  };
  const weapon = l.equip.weapon;
  const kind = (weapon && ITEMS[weapon]?.equip?.weapon) || (weapon ? 'sword' : 'none');
  push(WEAPON_CARDS[kind], weapon ?? 'fists', isMasterwork(weapon));
  push(['guard', 'guard'], 'basic');
  for (const slot of ['shield', 'helm', 'body'] as const) {
    const id = l.equip[slot];
    if (id) push([ARMOUR_CARDS[slot]], id, isMasterwork(id));
  }
  for (const slot of ['amulet', 'ring'] as const) {
    const id = l.equip[slot];
    const relic = id ? ITEMS[id]?.equip?.relic : undefined;
    if (id && relic) push([RELIC_CARD[relic]], id);
  }
  for (const t of TECHNIQUES) if (lv[t.skill] >= t.level) push([t.id], 'technique');
  if (l.food && (l.bank[l.food] ?? 0) > 0) push(['eat', 'eat'], 'food', false, l.food);
  return out;
}

/** The cards you fight with: the pool minus any you switched off (never below MIN_DECK). */
export function activeDeck(l: Loadout, lv: Levels, off: string[] = []): PoolCard[] {
  const pool = cardPool(l, lv);
  const on = pool.filter((c) => !off.includes(c.key));
  if (on.length >= MIN_DECK) return on;
  return [...on, ...pool.filter((c) => off.includes(c.key))].slice(0, MIN_DECK);
}
