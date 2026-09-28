/**
 * Rewards and penalties for how you answer. Right answers build a streak and
 * earn bonuses; a miss (Again) earns no skill xp or resources and breaks the
 * streak. Hard counts as correct. Scholarship xp is handled elsewhere and is
 * always earned, because an honest miss is still studying.
 */
import type { Tier } from '../core/types';
import { COLLECTION } from './items';
import { levelForXp } from './skills';
import type { World } from './world';

export interface AnswerCtx {
  grade: 1 | 2 | 3 | 4;
  /** the card's maturity when answered */
  tier: Tier;
  /** answer was typed and checked by the app */
  verified?: boolean;
  /** a leech card (4+ lapses) */
  leech?: boolean;
  /** a brand-new card's first answer */
  discovery?: boolean;
  /** a card relearning after a lapse */
  secondWind?: boolean;
}

export interface Milestone { at: number; text: string; gold: number; hot: number; rare: boolean }

export interface AnswerResult {
  correct: boolean;
  /** skill-xp multiplier (0 on a miss) */
  mult: number;
  /** short labels for the bonuses that applied */
  tags: string[];
  chain: number;
  milestone: Milestone | null;
}

export const isCorrect = (g: number) => g >= 2;

export const REST_MS = 30 * 60_000; // one rested charge per half hour away
export const REST_CAP = 30;
export const RECENT = 20;

/** Default the reward fields for saves made before they existed. */
export function ensureRewards(w: World) {
  w.chain ??= 0;
  w.bestChain ??= 0;
  w.nodeChain ??= 0;
  w.nodeId ??= null;
  w.rested ??= 0;
  w.lastActive ??= 0;
  w.recent ??= [];
  w.hot ??= 0;
  w.mastery ??= {};
  w.collection ??= {};
}

export function accuracy(w: World): number | null {
  const r = w.recent ?? [];
  return r.length >= 10 ? r.reduce((a, b) => a + b, 0) / r.length : null;
}

export function isFocused(w: World) {
  const acc = accuracy(w);
  return acc != null && acc >= 0.9;
}

function milestoneFor(chain: number): Milestone | null {
  if (chain === 10) return { at: 10, text: '10 in a row! Hot streak: double yield for 5 actions.', gold: 0, hot: 5, rare: false };
  if (chain === 25) return { at: 25, text: '25 in a row! A guaranteed rare find and 50 gold.', gold: 50, hot: 0, rare: true };
  if (chain === 50) return { at: 50, text: '50 in a row! 250 gold and 10 double-yield actions.', gold: 250, hot: 10, rare: true };
  if (chain >= 100 && chain % 50 === 0) return { at: chain, text: `${chain} in a row! Unbroken. 1,000 gold.`, gold: 1000, hot: 10, rare: true };
  return null;
}

/**
 * Record an answer: streaks, rested charges, accuracy, milestones.
 * `nodeId` names what you're working on (a rock, recipe or area) for per-node streaks.
 */
export function registerAnswer(w: World, ctx: AnswerCtx, nodeId: string, now = Date.now()): AnswerResult {
  ensureRewards(w);
  // time away turns into rested charges
  if (w.lastActive && now - w.lastActive >= REST_MS) w.rested = Math.min(REST_CAP, w.rested! + Math.floor((now - w.lastActive) / REST_MS));
  w.lastActive = now;

  const ok = isCorrect(ctx.grade);
  w.recent = [...w.recent!, ok ? 1 : 0].slice(-RECENT);
  if (!ok) {
    w.chain = 0;
    w.nodeChain = 0;
    w.nodeId = nodeId;
    return { correct: false, mult: 0, tags: ['Miss'], chain: 0, milestone: null };
  }
  w.chain! += 1;
  w.bestChain = Math.max(w.bestChain!, w.chain!);
  w.nodeChain = w.nodeId === nodeId ? w.nodeChain! + 1 : 1;
  w.nodeId = nodeId;

  let mult = 1;
  const tags: string[] = [];
  const streak = Math.min(0.5, 0.05 * (w.chain! - 1));
  if (streak > 0) {
    mult += streak;
    tags.push(`Streak +${Math.round(streak * 100)}%`);
  }
  if (w.rested! > 0) {
    w.rested! -= 1;
    mult += 0.5;
    tags.push('Rested +50%');
  }
  if (isFocused(w)) {
    mult += 0.1;
    tags.push('Focused +10%');
  }
  if (ctx.leech) {
    mult += 1;
    tags.push('Leech slain ×2');
  }
  if (ctx.discovery) {
    mult += 0.5;
    tags.push('Discovery +50%');
  }
  if (ctx.secondWind) {
    mult += 0.25;
    tags.push('Second wind +25%');
  }
  if (ctx.verified) {
    mult += 0.25;
    tags.push('Verified +25%');
  }
  if (ctx.grade === 4) {
    mult += 0.2;
    tags.push('Easy +20%');
  }
  const milestone = milestoneFor(w.chain!);
  if (milestone?.hot) w.hot! += milestone.hot;
  return { correct: true, mult, tags, chain: w.chain!, milestone };
}

// ---------- mastery ----------
export const MASTERY_SAFE = 50; // from here, misses no longer burn food or crack bars
export const masteryLevel = (w: World, id: string) => levelForXp(w.mastery?.[id] ?? 0);
export function masteryDouble(level: number): number {
  if (level >= 99) return 0.25;
  if (level >= 75) return 0.15;
  if (level >= 50) return 0.1;
  if (level >= 25) return 0.05;
  return 0;
}
export function addMastery(w: World, id: string, xp: number) {
  ensureRewards(w);
  w.mastery![id] = (w.mastery![id] ?? 0) + Math.round(xp * 3);
}

// ---------- collection log ----------
const COLLECTABLE = new Set(COLLECTION);
/** Note first finds for the collection log; returns the ids found for the first time. */
export function recordFinds(w: World, items: Record<string, number>, now = Date.now()): string[] {
  ensureRewards(w);
  const fresh: string[] = [];
  for (const id of Object.keys(items)) {
    if (COLLECTABLE.has(id) && !w.collection![id]) {
      w.collection![id] = now;
      fresh.push(id);
    }
  }
  return fresh;
}
