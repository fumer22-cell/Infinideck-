/**
 * Dungeon-run state. A run is a view over today's due queue: it draws only cards
 * that are due right now and reports grades to srs.reviewCard. It never changes
 * scheduling itself. Endless mode draws Mature+ cards and never calls the scheduler.
 */
import { db, kvGet, kvSet } from '../core/db';
import type { Profile } from '../core/profile';
import type { Settings } from '../core/settings';
import { dayKey, getDueQueue, isLeech, nextLearningDue, State, tierOf } from '../core/srs';
import type { CardRow } from '../core/types';
import type { ClassId } from './classes';
import { startCombat, type CombatState, type PlayerState } from './combat';
import { TIER_POWER } from './effects';
import { BIOMES, spawnEnemy, type Biome } from './enemies';
import { ALL_RELICS, type RelicId } from './relics';
import { pick, pickN, randInt } from './rng';
import { levels, maxHpFor } from './skills';

export const HAND_SIZE = 3;
export const MAX_HAND = 5;
export const FIGHTS_PER_REST = 5;
export const BOSS_AT = 8; // boss appears when this many (or fewer) due cards remain
export const ENDLESS_BOSS_EVERY = 8;

export type Phase = 'fight' | 'rest' | 'shop' | 'bossReward' | 'victory' | 'dead' | 'waiting';

export interface LogLine { text: string; tone?: 'dmg' | 'heal' | 'info' | 'bad' | 'gold' | 'xp' }

export interface RunState {
  v: 1;
  mode: 'dungeon' | 'endless';
  cls: ClassId;
  biome: Biome;
  day: string;
  startedAt: number;
  player: PlayerState;
  relics: RelicId[];
  gold: number;
  fight: number;
  fightsSinceRest: number;
  phase: Phase;
  combat: CombatState | null;
  hand: number[];
  deathWardUsed: boolean;
  bossFought: boolean;
  bossBeaten: boolean;
  leechesFaced: number[];
  choices: RelicId[];
  potionBought: boolean;
  retreated: boolean;
  log: LogLine[];
  stats: { reviews: number; correct: number; kills: number };
}

export async function loadRun(): Promise<RunState | null> {
  return kvGet<RunState | null>('run', null);
}
export async function saveRun(r: RunState): Promise<void> {
  await kvSet('run', r);
}
export async function clearRun(): Promise<void> {
  await db.kv.delete('run');
}

export function pushLog(r: RunState, text: string, tone?: LogLine['tone']) {
  r.log = [...r.log.slice(-60), { text, tone }];
}

export async function startRun(mode: RunState['mode'], cls: ClassId, profile: Profile, settings?: Settings): Promise<RunState> {
  const lv = levels(profile.xp);
  const maxHp = maxHpFor(lv.hitpoints, (profile.meta.vitality ?? 0) * 5);
  const biome = pick(Object.keys(BIOMES) as Biome[]);
  const relics: RelicId[] = profile.meta.relicseeker ? [pick(ALL_RELICS)] : [];
  const r: RunState = {
    v: 1,
    mode,
    cls,
    biome,
    day: dayKey(Date.now(), settings?.dayStartHour ?? 4),
    startedAt: Date.now(),
    player: { hp: maxHp, maxHp, block: 0 },
    relics,
    gold: 0,
    fight: 0,
    fightsSinceRest: 0,
    phase: 'fight',
    combat: null,
    hand: [],
    deathWardUsed: false,
    bossFought: false,
    bossBeaten: false,
    leechesFaced: [],
    choices: [],
    potionBought: false,
    retreated: false,
    log: [],
    stats: { reviews: 0, correct: 0, kills: 0 },
  };
  pushLog(r, `You descend into ${BIOMES[biome].name}. ${BIOMES[biome].flavor}`, 'info');
  if (relics.length) pushLog(r, 'Your Relic Seeker instincts turn up a relic.', 'gold');
  await saveRun(r);
  return r;
}

async function endlessPool(): Promise<CardRow[]> {
  return db.cards.where('state').equals(State.Review).filter((c) => !c.suspended && c.scheduled_days >= 21).toArray();
}

/** Due cards not already in hand (dungeon) or mature cards (endless). */
export async function drawPile(r: RunState, s: Settings): Promise<CardRow[]> {
  const inHand = new Set(r.hand);
  if (r.mode === 'endless') return (await endlessPool()).filter((c) => !inHand.has(c.id!));
  return getDueQueue({ now: Date.now(), newPerDay: s.newPerDay, maxReviewsPerDay: s.maxReviewsPerDay, dayStartHour: s.dayStartHour, exclude: inHand });
}

/** Fill the hand to HAND_SIZE (+extra draws). Bosses force due leeches into the hand first. */
export async function fillHand(r: RunState, s: Settings, extra = 0): Promise<RunState> {
  const target = Math.min(MAX_HAND, Math.max(HAND_SIZE, r.hand.length + extra));
  const need = target - r.hand.length;
  if (need <= 0) return r;
  let pile = await drawPile(r, s);
  const isBoss = !!r.combat?.enemy.boss;
  let drawn: CardRow[];
  if (r.mode === 'endless') drawn = pickN(pile, need);
  else {
    if (isBoss) pile = [...pile.filter(isLeech), ...pile.filter((c) => !isLeech(c))];
    drawn = pile.slice(0, need);
  }
  const next = { ...r, hand: [...r.hand, ...drawn.map((c) => c.id!)] };
  if (isBoss) {
    const leeches = drawn.filter(isLeech).map((c) => c.id!);
    if (leeches.length) {
      next.leechesFaced = [...new Set([...r.leechesFaced, ...leeches])];
      pushLog(next, `The boss drags ${leeches.length} leech card${leeches.length > 1 ? 's' : ''} into your hand!`, 'bad');
    }
  }
  return next;
}

export async function handCards(r: RunState): Promise<CardRow[]> {
  const rows = await db.cards.bulkGet(r.hand);
  return rows.filter((c): c is CardRow => !!c);
}

export function avgHandPower(cards: CardRow[]): number {
  if (!cards.length) return TIER_POWER[1];
  return cards.reduce((a, c) => a + TIER_POWER[tierOf(c)], 0) / cards.length;
}

/**
 * Start the next fight, or end the run if nothing is due.
 * Returns the updated run (phase may become 'victory' or 'waiting').
 */
export async function beginFight(prev: RunState, s: Settings, profile: Profile): Promise<RunState> {
  let r: RunState = { ...prev, combat: null };
  // Cards drawn in an earlier fight might not be due any more if the day rolled over; keep only valid ones.
  if (r.mode === 'dungeon') {
    const due = new Set((await getDueQueue({ now: Date.now(), ...s })).map((c) => c.id!));
    r.hand = r.hand.filter((id) => due.has(id));
  }
  const pile = await drawPile(r, s);
  const remaining = pile.length + r.hand.length;
  if (remaining === 0) return endOfQueue(r);

  const fightNo = r.fight + 1;
  const boss = r.mode === 'dungeon' ? !r.bossFought && remaining <= BOSS_AT : fightNo % ENDLESS_BOSS_EVERY === 0;
  r.fight = fightNo;
  const cards = await handCards(r);
  const sample = cards.length ? cards : pile.slice(0, 3);
  const cardsTarget = boss ? Math.max(4, Math.min(remaining, 12) * 0.85) : r.mode === 'endless' ? randInt(3, 5) + Math.floor(fightNo / 6) : randInt(3, 5);
  const depth = r.mode === 'endless' ? fightNo * 2 : fightNo;
  const enemy = spawnEnemy(r.biome, depth, avgHandPower(sample), cardsTarget, boss);
  const startBlock = (profile.meta.bulwark ?? 0) * 2;
  r.combat = startCombat({ ...r.player, block: 0 }, enemy, r.relics, startBlock, r.deathWardUsed);
  if (boss) r.bossFought = true;
  pushLog(r, boss ? `${enemy.name} rises before you!` : `A ${enemy.name} blocks your path.`, boss ? 'bad' : 'info');
  r = await fillHand(r, s);
  return r;
}

/** Queue exhausted: wait for learning cards, or the dungeon is cleared. */
export async function endOfQueue(prev: RunState): Promise<RunState> {
  const r = { ...prev };
  if (r.mode === 'dungeon') {
    const next = await nextLearningDue(Date.now());
    if (next && next - Date.now() < 30 * 60_000) {
      r.phase = 'waiting';
      return r;
    }
  }
  r.phase = 'victory';
  return r;
}

export function relicChoices(owned: RelicId[], n = 3): RelicId[] {
  return pickN(ALL_RELICS.filter((x) => !owned.includes(x)), n);
}
