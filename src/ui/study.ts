import { db } from '../core/db';
import { SCHOLARSHIP_XP } from '../core/profile';
import { getDueQueue, isLeech, reviewCard, State, tierOf } from '../core/srs';
import type { CardRow, Tier } from '../core/types';
import type { AppCtx } from './context';

/** Due cards right now, in Anki order. */
export async function dueQueue(app: Pick<AppCtx, 'settings'>, exclude?: Set<number>): Promise<CardRow[]> {
  return getDueQueue({ now: Date.now(), ...app.settings, exclude });
}

/**
 * Practice cards for when nothing is due: Mature cards first, then any reviewed card.
 * Practice never records a review, so it cannot change scheduling.
 */
export async function practicePool(): Promise<CardRow[]> {
  const reviewed = await db.cards.where('state').equals(State.Review).filter((c) => !c.suspended).toArray();
  const mature = reviewed.filter((c) => c.scheduled_days >= 21);
  return mature.length >= 3 ? mature : reviewed;
}

export function pickRandom<T>(arr: T[], avoid?: (t: T) => boolean): T | null {
  const pool = avoid ? arr.filter((x) => !avoid(x)) : arr;
  const from = pool.length ? pool : arr;
  return from.length ? from[Math.floor(Math.random() * from.length)] : null;
}

export interface Recorded {
  /** maturity the card had when played (drives yields/power) */
  tier: Tier;
  /** set when this review promoted the card to a new tier it hasn't seen */
  tierUp: { card: CardRow; tier: Tier } | null;
  scholarship: number;
  practice: boolean;
}

/**
 * Record a graded card. Due cards go to FSRS exactly like Anki; practice cards
 * are not recorded at all.
 */
export async function recordGrade(app: AppCtx, card: CardRow, grade: 1 | 2 | 3 | 4, practice: boolean): Promise<Recorded> {
  const tier = tierOf(card);
  if (practice) return { tier, tierUp: null, scholarship: 0, practice };
  const out = await reviewCard(card.id!, grade, Date.now(), { dayStartHour: app.settings.dayStartHour, retention: app.settings.retention });
  await app.updateProfile((p) => void p.stats.reviews++);
  return {
    tier,
    tierUp: out.tierAfter > card.tierSeen ? { card: out.after, tier: out.tierAfter } : null,
    scholarship: SCHOLARSHIP_XP[grade] * (1 + out.tierAfter * 0.25),
    practice,
  };
}

/** Halve skill xp when practising (no scheduling benefit, so less reward). */
export function scaleXp(xp: Partial<Record<string, number>>, practice: boolean) {
  if (!practice) return xp;
  return Object.fromEntries(Object.entries(xp).map(([k, v]) => [k, Math.round((v ?? 0) / 2)]));
}

/** Bonus flags for how this answer should be rewarded (see game/rewards.ts). */
export function answerFlags(card: CardRow) {
  return { leech: isLeech(card), discovery: card.state === State.New, secondWind: card.state === State.Relearning };
}

export { isLeech };
