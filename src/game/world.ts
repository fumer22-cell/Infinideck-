/**
 * The persistent world: bank, gear, the one active activity, the furnace,
 * farm plots and the current combat trip. Studying drives it: each graded
 * card performs one action of the active activity. Nothing here ever touches
 * card scheduling; the caller reports grades to srs.reviewCard first.
 */
import { kvGet, kvSet } from '../core/db';
import type { EffectId, Tier } from '../core/types';
import { AREA_BY_ID, COOKING, FORGING, GATHER, SEEDS, SMELTING, plotCount, smeltBatchCap, type AreaDef, type Drop, type MonsterDef } from './activities';
import { ADVENTURER } from './classes';
import { playCard, startCombat, type CombatEvent } from './combat';
import { intentFor, type EnemyState } from './enemies';
import { ITEMS, LOG_ORDER, METALS, SLOTS, type Slot, type ToolKind } from './items';
import type { RelicId } from './relics';
import { rand, randInt, type Rng } from './rng';
import { attackMult, defenceReduction, goldMult, maxHpFor, strengthMult, type Levels, type SkillId } from './skills';

export type Active =
  | { kind: 'gather'; id: string }
  | { kind: 'cook'; id: string }
  | { kind: 'forge'; id: string }
  | { kind: 'combat'; id: string };

export type CombatStyle = 'attack' | 'strength' | 'defence';

export interface Furnace { recipe: string; total: number; done: number; start: number; msEach: number }
export interface Plot { seed: string; planted: number; growMs: number; bonus: number; /** extra yield from fertiliser (0.5 = +50%) */ fert?: number }

export interface CombatSession {
  area: string;
  enemy: EnemyState;
  kills: number;
  hand: number[];
  combo: number;
  cardsPlayed: number;
  deathWardUsed: boolean;
  block: number;
  /** leech cards faced this trip (cleared when a boss falls) */
  leeches: number[];
  /** extra cards to draw from Insight effects */
  bonusDraw?: number;
}

export interface LogLine { text: string; tone?: 'dmg' | 'heal' | 'info' | 'bad' | 'gold' | 'xp' | 'loot' }

export interface World {
  v: 1;
  bank: Record<string, number>;
  equip: Partial<Record<Slot, string>>;
  food: string | null;
  style: CombatStyle;
  active: Active | null;
  hp: number;
  hpAt: number;
  furnace: Furnace | null;
  plots: (Plot | null)[];
  combat: CombatSession | null;
  /** kills toward each area's boss */
  bossProgress: Record<string, number>;
  log: LogLine[];
  stats: { actions: number; kills: number; bossKills: number; deaths: number };
}

export function newWorld(maxHp: number, now = Date.now()): World {
  return {
    v: 1,
    bank: { 'bronze-pickaxe': 1, 'bronze-hatchet': 1, 'rod-basic': 1, bread: 5, 'seed-potato': 4 },
    equip: {},
    food: 'bread',
    style: 'attack',
    active: null,
    hp: maxHp,
    hpAt: now,
    furnace: null,
    plots: [null, null],
    combat: null,
    bossProgress: {},
    log: [{ text: 'Welcome to Grimrecall. Pick a skill, then study to train it.', tone: 'info' }],
    stats: { actions: 0, kills: 0, bossKills: 0, deaths: 0 },
  };
}

export async function loadWorld(maxHp: number): Promise<World> {
  const w = await kvGet<World | null>('world', null);
  return w ?? newWorld(maxHp);
}
export async function saveWorld(w: World): Promise<void> {
  await kvSet('world', w);
}

export function pushLog(w: World, text: string, tone?: LogLine['tone']) {
  w.log = [...w.log.slice(-40), { text, tone }];
}

// ---------- bank ----------
export type Items = Record<string, number>;
export function addItems(w: World, items: Items) {
  for (const [id, n] of Object.entries(items)) if (n > 0) w.bank[id] = (w.bank[id] ?? 0) + n;
}
export function hasItems(w: World, items: Items, times = 1): boolean {
  return Object.entries(items).every(([id, n]) => (w.bank[id] ?? 0) >= n * times);
}
export function removeItems(w: World, items: Items, times = 1) {
  for (const [id, n] of Object.entries(items)) {
    w.bank[id] = (w.bank[id] ?? 0) - n * times;
    if (w.bank[id] <= 0) delete w.bank[id];
  }
}
/** Logs at least as hot as `minFuel` (index into LOG_ORDER). */
const fuelLogs = (minFuel: number) => LOG_ORDER.slice(minFuel);
export const logsInBank = (w: World, minFuel = 0) => fuelLogs(minFuel).reduce((a, id) => a + (w.bank[id] ?? 0), 0);
/** Burn logs as furnace fuel, the weakest acceptable ones first. */
function burnLogs(w: World, n: number, minFuel: number) {
  for (const id of fuelLogs(minFuel).filter((l) => w.bank[l])) {
    if (n <= 0) break;
    const take = Math.min(n, w.bank[id]);
    removeItems(w, { [id]: take });
    n -= take;
  }
}

// ---------- tools & gear ----------
export function bestTool(w: World, kind: ToolKind, lv: Levels): { id: string; bonus: number; tier: number } | null {
  let best: { id: string; bonus: number; tier: number } | null = null;
  for (const id of Object.keys(w.bank)) {
    const t = ITEMS[id]?.tool;
    if (!t || t.kind !== kind || lv[t.skill] < t.level) continue;
    if (!best || t.tier > best.tier) best = { id, bonus: t.bonus, tier: t.tier };
  }
  return best;
}
export const TOOL_FOR: Record<string, ToolKind> = { mining: 'pickaxe', woodcutting: 'axe', fishing: 'rod' };

/** Human name of the weakest tool of a tier, and where it comes from. */
export function toolNeeded(kind: ToolKind, tier: number): { name: string; how: string } {
  if (kind === 'rod') {
    if (tier <= 1) return { name: 'fishing rod', how: 'Buy one in the general store.' };
    if (tier <= 3) return { name: 'fly rod', how: 'Trade 5 willow logs and 150 gold at the general store.' };
    return { name: 'harpoon', how: 'Forge one from 3 steel bars (Smithing 35).' };
  }
  const m = METALS[Math.min(METALS.length, tier) - 1];
  const piece = kind === 'pickaxe' ? 'pickaxe' : 'hatchet';
  return { name: `${m.name.toLowerCase()} ${piece}`, how: tier <= 1 ? 'Buy one in the general store.' : `Forge one from 2 ${m.name.toLowerCase()} bars (Smithing ${m.smith + 1}).` };
}

export function canEquip(id: string, lv: Levels): boolean {
  const e = ITEMS[id]?.equip;
  return !!e && (!e.skill || lv[e.skill] >= e.level);
}

export function equip(w: World, id: string, lv: Levels): boolean {
  const e = ITEMS[id]?.equip;
  if (!e || !canEquip(id, lv) || !w.bank[id]) return false;
  const prev = w.equip[e.slot];
  removeItems(w, { [id]: 1 });
  if (prev) addItems(w, { [prev]: 1 });
  w.equip[e.slot] = id;
  return true;
}
export function unequip(w: World, slot: Slot) {
  const prev = w.equip[slot];
  if (!prev) return;
  addItems(w, { [prev]: 1 });
  delete w.equip[slot];
}

export interface Bonuses { dmgMult: number; reduction: number; relics: RelicId[]; weaponDmg: number; armourDr: number }
export function bonuses(w: World, lv: Levels): Bonuses {
  let weaponDmg = 0;
  let armourDr = 0;
  const relics: RelicId[] = [];
  for (const slot of SLOTS) {
    const id = w.equip[slot];
    const e = id ? ITEMS[id]?.equip : undefined;
    if (!e) continue;
    weaponDmg += e.dmg ?? 0;
    armourDr += e.dr ?? 0;
    if (e.relic) relics.push(e.relic);
  }
  return {
    dmgMult: attackMult(lv.attack) * strengthMult(lv.strength) * (1 + weaponDmg),
    reduction: Math.min(0.75, defenceReduction(lv.defence) + armourDr),
    relics,
    weaponDmg,
    armourDr,
  };
}

// ---------- knowledge bonus ----------
/** Mature knowledge pays: chance of a double yield by the card's maturity tier. */
export const TIER_DOUBLE: Record<Tier, number> = { 0: 0, 1: 0.1, 2: 0.25, 3: 0.5 };

// ---------- actions ----------
export interface ActionResult {
  ok: boolean;
  reason?: string;
  items: Items;
  xp: Partial<Record<SkillId, number>>;
  msgs: LogLine[];
}
const fail = (reason: string): ActionResult => ({ ok: false, reason, items: {}, xp: {}, msgs: [] });

/** Can the active activity run another action right now? */
export function checkActive(w: World, lv: Levels): string | null {
  const a = w.active;
  if (!a) return 'Pick a skill to train.';
  if (a.kind === 'gather') {
    const node = GATHER.find((n) => n.id === a.id)!;
    if (lv[node.skill] < node.level) return `Needs ${node.skill} level ${node.level}.`;
    const tool = bestTool(w, TOOL_FOR[node.skill], lv);
    if (!tool || tool.tier < node.tool) {
      const need = toolNeeded(TOOL_FOR[node.skill], node.tool);
      return `${node.name} needs a ${need.name} or better. ${need.how}`;
    }
  }
  if (a.kind === 'cook') {
    const r = COOKING.find((c) => c.id === a.id)!;
    if (lv.cooking < r.level) return `Needs cooking level ${r.level}.`;
    const missing = Object.entries(r.inputs).find(([id, n]) => (w.bank[id] ?? 0) < n);
    if (missing) return `Out of ${ITEMS[missing[0]].name.toLowerCase()}.`;
  }
  if (a.kind === 'forge') {
    const r = FORGING.find((f) => f.id === a.id)!;
    if ((w.bank[r.bar] ?? 0) < r.bars) return `Needs ${r.bars} ${ITEMS[r.bar].name.toLowerCase()}${r.bars > 1 ? 's' : ''}.`;
  }
  return null;
}

/** One graded card of a non-combat activity. Grades don't change the outcome; card maturity does. */
export function performAction(w: World, lv: Levels, cardTier: Tier, rng: Rng = rand): ActionResult {
  const blocked = checkActive(w, lv);
  if (blocked) return fail(blocked);
  const a = w.active!;
  const items: Items = {};
  const msgs: LogLine[] = [];
  const give = (id: string, n: number) => (items[id] = (items[id] ?? 0) + n);

  if (a.kind === 'gather') {
    const node = GATHER.find((n) => n.id === a.id)!;
    const tool = bestTool(w, TOOL_FOR[node.skill], lv)!;
    const double = rng() < TIER_DOUBLE[cardTier] + tool.bonus;
    give(node.item, double ? 2 : 1);
    msgs.push({ text: `${node.skill === 'fishing' ? 'You catch' : node.skill === 'mining' ? 'You mine' : 'You chop'} ${double ? '2× ' : 'some '}${ITEMS[node.item].name.toLowerCase()}.`, tone: 'loot' });
    for (const r of node.rare) {
      if (rng() < r.chance * (1 + cardTier * 0.25)) {
        give(r.item, 1);
        msgs.push({ text: `Rare find: ${ITEMS[r.item].name}!`, tone: 'gold' });
      }
    }
    addItems(w, items);
    w.stats.actions++;
    return { ok: true, items, xp: { [node.skill]: node.xp }, msgs };
  }
  if (a.kind === 'cook') {
    const r = COOKING.find((c) => c.id === a.id)!;
    removeItems(w, r.inputs);
    give(r.output, 1);
    addItems(w, items);
    msgs.push({ text: `You cook the ${r.name.toLowerCase()}.`, tone: 'loot' });
    w.stats.actions++;
    return { ok: true, items, xp: { cooking: r.xp }, msgs };
  }
  if (a.kind === 'forge') {
    const r = FORGING.find((f) => f.id === a.id)!;
    removeItems(w, { [r.bar]: r.bars });
    give(r.output, 1);
    addItems(w, items);
    msgs.push({ text: `You forge a ${r.name.toLowerCase()}.`, tone: 'loot' });
    w.stats.actions++;
    return { ok: true, items, xp: { smithing: r.xp }, msgs };
  }
  return fail('Combat is played from your hand.');
}

// ---------- furnace (real time) ----------
export function maxSmeltable(w: World, recipeId: string, lv: Levels): number {
  const r = SMELTING.find((s) => s.id === recipeId)!;
  let n = Math.min(smeltBatchCap(lv.smithing), logsInBank(w, r.fuel));
  for (const [id, per] of Object.entries(r.inputs)) n = Math.min(n, Math.floor((w.bank[id] ?? 0) / per));
  return Math.max(0, n);
}

/** Start a smelting batch. The caller has already passed the card check; its maturity speeds the furnace. */
export function startSmelt(w: World, recipeId: string, qty: number, lv: Levels, cardTier: Tier, now = Date.now()): boolean {
  const r = SMELTING.find((s) => s.id === recipeId)!;
  if (w.furnace || lv.smithing < r.level || qty < 1 || qty > maxSmeltable(w, recipeId, lv)) return false;
  removeItems(w, r.inputs, qty);
  burnLogs(w, qty, r.fuel);
  w.furnace = { recipe: recipeId, total: qty, done: 0, start: now, msEach: Math.round(r.msEach * (1 - 0.1 * cardTier)) };
  return true;
}

/** Collect any bars finished since last time. */
export function tickFurnace(w: World, now = Date.now()): { bars: number; xp: number; bar: string } | null {
  const f = w.furnace;
  if (!f) return null;
  const r = SMELTING.find((s) => s.id === f.recipe)!;
  const finished = Math.min(f.total, Math.floor((now - f.start) / f.msEach));
  const fresh = finished - f.done;
  if (fresh <= 0) return null;
  f.done = finished;
  addItems(w, { [r.bar]: fresh });
  if (f.done >= f.total) w.furnace = null;
  return { bars: fresh, xp: fresh * r.xp, bar: r.bar };
}

// ---------- farming (real time) ----------
export function syncPlots(w: World, lv: Levels) {
  const n = plotCount(lv.farming);
  while (w.plots.length < n) w.plots.push(null);
}

/** Bones from combat make good fertiliser. */
export const FERTILISER: Record<string, number> = { bones: 0.5, 'big-bones': 1 };

export function plant(w: World, idx: number, seedId: string, lv: Levels, cardTier: Tier, now = Date.now(), fertiliser: string | null = null): boolean {
  const s = SEEDS.find((x) => x.id === seedId)!;
  if (w.plots[idx] || lv.farming < s.level || !w.bank[s.seed]) return false;
  removeItems(w, { [s.seed]: 1 });
  let fert = 0;
  if (fertiliser && FERTILISER[fertiliser] && w.bank[fertiliser]) {
    removeItems(w, { [fertiliser]: 1 });
    fert = FERTILISER[fertiliser];
  }
  w.plots[idx] = { seed: seedId, planted: now, growMs: s.growMs, bonus: cardTier, fert };
  return true;
}

export const plotReady = (p: Plot, now = Date.now()) => now - p.planted >= p.growMs;

export function harvest(w: World, idx: number, now = Date.now(), rng: Rng = rand): { crop: string; qty: number; xp: number } | null {
  const p = w.plots[idx];
  if (!p || !plotReady(p, now)) return null;
  const s = SEEDS.find((x) => x.id === p.seed)!;
  const qty = Math.round(randInt(s.yield[0], s.yield[1], rng) * (1 + 0.25 * p.bonus + (p.fert ?? 0)));
  addItems(w, { [s.crop]: qty });
  w.plots[idx] = null;
  return { crop: s.crop, qty, xp: s.plantXp + qty * s.harvestXp };
}

// ---------- hitpoints ----------
export const REGEN_MS = 20_000;
/** Out of combat, HP regenerates 1 per 20 seconds of real time. */
export function regen(w: World, maxHp: number, now = Date.now()) {
  if (w.combat) {
    w.hpAt = now;
    return;
  }
  const gained = Math.floor((now - w.hpAt) / REGEN_MS);
  if (gained > 0) {
    w.hp = Math.min(maxHp, w.hp + gained);
    w.hpAt += gained * REGEN_MS;
  }
  if (w.hp >= maxHp) {
    w.hp = maxHp;
    w.hpAt = now;
  }
}

export function eat(w: World, maxHp: number): number {
  const id = w.food;
  const heal = id ? ITEMS[id]?.heal : 0;
  if (!id || !heal || !w.bank[id] || w.hp >= maxHp) return 0;
  removeItems(w, { [id]: 1 });
  const before = w.hp;
  w.hp = Math.min(maxHp, w.hp + heal);
  return w.hp - before;
}

// ---------- combat trips ----------
export function spawn(def: MonsterDef): EnemyState {
  const e: EnemyState = { id: def.id, name: def.name, sprite: def.sprite, hp: def.hp, maxHp: def.hp, block: 0, atk: def.atk, poison: 0, patternIdx: 0, pattern: def.pattern, intent: { kind: 'attack', value: 0 }, boss: !!def.boss };
  e.intent = intentFor(e);
  return e;
}

export function startTrip(w: World, area: AreaDef, rng: Rng = rand): CombatSession {
  const def = area.monsters[Math.floor(rng() * area.monsters.length)];
  w.combat = { area: area.id, enemy: spawn(def), kills: 0, hand: [], combo: 0, cardsPlayed: 0, deathWardUsed: false, block: 0, leeches: [] };
  return w.combat;
}

/** Why an area can't be entered yet, or null. */
export function areaLocked(w: World, area: AreaDef, combatLvl: number): string | null {
  const why: string[] = [];
  if (combatLvl < area.level) why.push(`Combat level ${area.level}`);
  if (area.key && !w.bank[area.key]) why.push(`needs the ${ITEMS[area.key].name.toLowerCase()}`);
  return why.length ? why.join(' · ') : null;
}

export function bossReady(w: World, area: AreaDef) {
  return (w.bossProgress[area.id] ?? 0) >= area.bossAfter;
}

export function nextEnemy(w: World, rng: Rng = rand, boss = false) {
  const c = w.combat!;
  const area = AREA_BY_ID[c.area];
  const def = boss ? area.boss : area.monsters[Math.floor(rng() * area.monsters.length)];
  c.enemy = spawn(def);
  c.combo = w.equip && Object.values(w.equip).includes('relic-comboring') ? 2 : 0;
  c.cardsPlayed = 0;
  c.block = 0;
}

export function rollDrops(drops: Drop[], rng: Rng = rand): Items {
  const out: Items = {};
  for (const d of drops) if (rng() < d.chance) out[d.item] = (out[d.item] ?? 0) + randInt(d.min ?? 1, d.max ?? 1, rng);
  return out;
}

export interface CombatResult {
  events: CombatEvent[];
  xp: Partial<Record<SkillId, number>>;
  killed: boolean;
  died: boolean;
  loot: Items;
  gold: number;
  boss: boolean;
  enemyName: string;
}

/** Play one graded card against the current enemy. */
export function combatPlay(
  w: World,
  lv: Levels,
  maxHp: number,
  card: { effect: EffectId; tier: Tier; wasNew: boolean },
  grade: 1 | 2 | 3 | 4,
  fast: boolean,
  rng: Rng = rand,
): CombatResult {
  const c = w.combat!;
  const b = bonuses(w, lv);
  const state = startCombat({ hp: w.hp, maxHp, block: c.block }, c.enemy, [], 0, c.deathWardUsed);
  state.combo = c.combo;
  state.cardsPlayed = c.cardsPlayed;
  const res = playCard(state, { effect: card.effect, tier: card.tier, grade, wasNew: card.wasNew, cls: ADVENTURER, relics: b.relics, dmgMult: b.dmgMult, reduction: b.reduction, fast });
  w.hp = res.state.player.hp;
  c.block = res.state.player.block;
  c.enemy = res.state.enemy;
  c.combo = res.state.combo;
  c.cardsPlayed = res.state.cardsPlayed;
  c.deathWardUsed = res.state.deathWardUsed;
  const xp: Partial<Record<SkillId, number>> = { hitpoints: res.xp.hitpoints };
  xp[w.style] = (xp[w.style] ?? 0) + res.xp.attack;
  xp.defence = (xp.defence ?? 0) + res.xp.defence;

  const died = res.events.some((e) => e.t === 'playerDied');
  const killed = !died && res.events.some((e) => e.t === 'enemyDied');
  const out: CombatResult = { events: res.events, xp, killed, died, loot: {}, gold: 0, boss: c.enemy.boss, enemyName: c.enemy.name };
  w.stats.actions++;
  if (killed) {
    const area = AREA_BY_ID[c.area];
    const def = c.enemy.boss ? area.boss : area.monsters.find((m) => m.id === c.enemy.id)!;
    // keys are only needed once
    out.loot = rollDrops(def.drops.filter((d) => !(d.item.startsWith('key-') && w.bank[d.item])), rng);
    const goldMul = goldMult(lv.scholarship) * (b.relics.includes('goldtooth') ? 1.25 : 1);
    out.gold = Math.round(randInt(def.gold[0], def.gold[1], rng) * goldMul);
    addItems(w, out.loot);
    c.kills++;
    w.stats.kills++;
    if (c.enemy.boss) {
      w.stats.bossKills++;
      w.bossProgress[area.id] = 0;
    } else w.bossProgress[area.id] = (w.bossProgress[area.id] ?? 0) + 1;
    if (b.relics.includes('bloodvial')) w.hp = Math.min(maxHp, w.hp + 3);
  }
  if (died) {
    w.combat = null;
    w.active = null;
    w.hp = Math.ceil(maxHp / 2);
    w.hpAt = Date.now();
    w.stats.deaths++;
  }
  return out;
}

/** Auto-eat when HP falls below a third. Returns HP healed. */
export function autoEat(w: World, maxHp: number): number {
  let healed = 0;
  while (w.hp < maxHp / 3) {
    const h = eat(w, maxHp);
    if (!h) break;
    healed += h;
  }
  return healed;
}

export function leaveCombat(w: World) {
  w.combat = null;
  if (w.active?.kind === 'combat') w.active = null;
  w.hpAt = Date.now();
}

export { maxHpFor };
