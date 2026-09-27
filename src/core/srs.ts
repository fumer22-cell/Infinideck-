/**
 * FSRS integration. This module is the ONLY place card scheduling is changed.
 * The game layer reads due cards and reports grades; it never alters due dates,
 * never pulls cards early, and never reviews a card that is not due.
 */
import { createEmptyCard, fsrs, generatorParameters, Rating, State, type Card, type FSRS, type Grade, type ReviewLog } from 'ts-fsrs';
import { db } from './db';
import type { CardRow, EffectId, ReviewLogRow, Tier } from './types';

export { Rating, State };
export type { Grade };

const schedulers = new Map<number, FSRS>();
export function getScheduler(retention = 0.9): FSRS {
  let s = schedulers.get(retention);
  if (!s) {
    s = fsrs(generatorParameters({ request_retention: retention, enable_fuzz: true, enable_short_term: true }));
    schedulers.set(retention, s);
  }
  return s;
}

export function rowToFsrs(row: CardRow): Card {
  return {
    due: new Date(row.due),
    stability: row.stability,
    difficulty: row.difficulty,
    elapsed_days: row.elapsed_days,
    scheduled_days: row.scheduled_days,
    learning_steps: row.learning_steps,
    reps: row.reps,
    lapses: row.lapses,
    state: row.state,
    last_review: row.last_review != null ? new Date(row.last_review) : undefined,
  };
}

export function fsrsToFields(c: Card): Pick<CardRow, 'due' | 'stability' | 'difficulty' | 'elapsed_days' | 'scheduled_days' | 'learning_steps' | 'reps' | 'lapses' | 'state' | 'last_review'> {
  return {
    due: c.due.getTime(),
    stability: c.stability,
    difficulty: c.difficulty,
    elapsed_days: c.elapsed_days,
    scheduled_days: c.scheduled_days,
    learning_steps: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state,
    last_review: c.last_review ? c.last_review.getTime() : undefined,
  };
}

export function logToRow(cardId: number, log: ReviewLog, source: ReviewLogRow['source'] = 'app'): ReviewLogRow {
  return {
    cardId,
    rating: log.rating,
    state: log.state,
    due: log.due.getTime(),
    stability: log.stability,
    difficulty: log.difficulty,
    elapsed_days: log.elapsed_days,
    last_elapsed_days: log.last_elapsed_days,
    scheduled_days: log.scheduled_days,
    learning_steps: log.learning_steps,
    review: log.review.getTime(),
    source,
  };
}

/** Fresh FSRS fields for a brand-new card. */
export function newCardFields(now = Date.now()) {
  return fsrsToFields(createEmptyCard(new Date(now)));
}

export function newCardRow(deckId: number, front: string, back: string, effect: EffectId, now = Date.now()): CardRow {
  return { deckId, front, back, created: now, suspended: 0, ...newCardFields(now), effect, tierSeen: 0, leechBase: 0 };
}

/** Pure: apply a grade to a card exactly like Anki+FSRS would. */
export function applyGrade(row: CardRow, grade: Grade, now: number, retention = 0.9): { fields: ReturnType<typeof fsrsToFields>; log: ReviewLog } {
  const { card, log } = getScheduler(retention).next(rowToFsrs(row), new Date(now), grade);
  return { fields: fsrsToFields(card), log };
}

/** Preview the next interval for each grade (shown on the buttons, like Anki). */
export function previewIntervals(row: CardRow, now: number, retention = 0.9): Record<1 | 2 | 3 | 4, number> {
  const prev = getScheduler(retention).repeat(rowToFsrs(row), new Date(now));
  return {
    1: prev[Rating.Again].card.due.getTime() - now,
    2: prev[Rating.Hard].card.due.getTime() - now,
    3: prev[Rating.Good].card.due.getTime() - now,
    4: prev[Rating.Easy].card.due.getTime() - now,
  };
}

export function formatInterval(ms: number): string {
  const m = ms / 60000;
  if (m < 1) return '<1m';
  if (m < 60) return `${Math.round(m)}m`;
  const h = m / 60;
  if (h < 24) return `${Math.round(h)}h`;
  const d = h / 24;
  if (d < 30) return `${Math.round(d)}d`;
  if (d < 365) return `${(d / 30).toFixed(1).replace(/\.0$/, '')}mo`;
  return `${(d / 365).toFixed(1).replace(/\.0$/, '')}y`;
}

// ---------- study-day boundaries (Anki style) ----------

export function dayStart(now: number, dayStartHour = 4): number {
  const d = new Date(now);
  d.setHours(dayStartHour, 0, 0, 0);
  if (d.getTime() > now) d.setDate(d.getDate() - 1);
  return d.getTime();
}

export function dayEnd(now: number, dayStartHour = 4): number {
  const d = new Date(dayStart(now, dayStartHour));
  d.setDate(d.getDate() + 1);
  return d.getTime();
}

export function dayKey(now: number, dayStartHour = 4): string {
  const d = new Date(dayStart(now, dayStartHour));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Is a (non-new) card due? Like Anki: day-interval Review cards are due for the whole
 * study day they fall on; (re)learning cards are due only once their minute-step has passed.
 */
export function isDue(row: CardRow, now: number, dayStartHour = 4): boolean {
  if (row.suspended) return false;
  if (row.state === State.New) return false; // new cards are gated by the daily limit instead
  if (row.state === State.Review) return row.due < dayEnd(now, dayStartHour);
  return row.due <= now;
}

// ---------- maturity tiers ----------

export const TIER_NAMES = ['Novice', 'Young', 'Mature', 'Legendary'] as const;

export function intervalDays(row: Pick<CardRow, 'state' | 'scheduled_days'>): number {
  return row.state === State.Review ? row.scheduled_days : 0;
}

export function tierOf(row: Pick<CardRow, 'state' | 'scheduled_days'>): Tier {
  const ivl = intervalDays(row);
  if (row.state !== State.Review) return 0;
  if (ivl >= 90) return 3;
  if (ivl >= 21) return 2;
  return 1;
}

export const LEECH_THRESHOLD = 4;
export function isLeech(row: Pick<CardRow, 'lapses' | 'leechBase'>): boolean {
  return row.lapses - row.leechBase >= LEECH_THRESHOLD;
}

// ---------- queue building ----------

export interface QueueOptions {
  now: number;
  deckIds?: number[];
  newPerDay: number;
  maxReviewsPerDay: number;
  dayStartHour: number;
  exclude?: Set<number>;
}

/** Number of new cards introduced (first-reviewed) today. */
export async function newIntroducedToday(now: number, dayStartHour: number, deckIds?: number[]): Promise<number> {
  const logs = await db.logs.where('review').aboveOrEqual(dayStart(now, dayStartHour)).toArray();
  const newLogs = logs.filter((l) => l.state === State.New && l.source === 'app');
  if (!deckIds) return newLogs.length;
  const ids = new Set(deckIds);
  const cards = await db.cards.bulkGet(newLogs.map((l) => l.cardId));
  return cards.filter((c) => c && ids.has(c.deckId)).length;
}

export async function reviewsDoneToday(now: number, dayStartHour: number): Promise<number> {
  const logs = await db.logs.where('review').aboveOrEqual(dayStart(now, dayStartHour)).toArray();
  return logs.filter((l) => l.state !== State.New && l.source === 'app').length;
}

/**
 * Today's due queue: learning cards first, then reviews by due date, with new
 * cards (up to the daily limit) mixed in. Only contains cards that are due NOW.
 */
export async function getDueQueue(opts: QueueOptions): Promise<CardRow[]> {
  const { now, dayStartHour } = opts;
  const end = dayEnd(now, dayStartHour);
  const deckSet = opts.deckIds ? new Set(opts.deckIds) : null;
  const ok = (c: CardRow) => !c.suspended && (!deckSet || deckSet.has(c.deckId)) && !opts.exclude?.has(c.id!);

  const candidates = await db.cards.where('due').below(end).toArray();
  const learning = candidates
    .filter((c) => ok(c) && (c.state === State.Learning || c.state === State.Relearning) && c.due <= now)
    .sort((a, b) => a.due - b.due);

  const reviewsLeft = Math.max(0, opts.maxReviewsPerDay - (await reviewsDoneToday(now, dayStartHour)));
  const reviews = candidates
    .filter((c) => ok(c) && c.state === State.Review)
    .sort((a, b) => a.due - b.due)
    .slice(0, reviewsLeft);

  const newLeft = Math.max(0, opts.newPerDay - (await newIntroducedToday(now, dayStartHour, opts.deckIds)));
  const fresh = newLeft
    ? (await db.cards.where('state').equals(State.New).toArray())
        .filter(ok)
        .sort((a, b) => a.due - b.due || a.id! - b.id!)
        .slice(0, newLeft)
    : [];

  // Interleave: one new card after every 4 reviews (Anki "mix with reviews").
  const mixed: CardRow[] = [];
  let ni = 0;
  reviews.forEach((r, i) => {
    mixed.push(r);
    if ((i + 1) % 4 === 0 && ni < fresh.length) mixed.push(fresh[ni++]);
  });
  while (ni < fresh.length) mixed.push(fresh[ni++]);
  return [...learning, ...mixed];
}

/** Earliest due time of a learning card that is not yet due (for "come back in N min"). */
export async function nextLearningDue(now: number, deckIds?: number[]): Promise<number | null> {
  const deckSet = deckIds ? new Set(deckIds) : null;
  const rows = await db.cards.where('due').above(now).toArray();
  const learn = rows.filter((c) => !c.suspended && (c.state === State.Learning || c.state === State.Relearning) && (!deckSet || deckSet.has(c.deckId)));
  if (!learn.length) return null;
  return Math.min(...learn.map((c) => c.due));
}

export interface ReviewOutcome {
  before: CardRow;
  after: CardRow;
  tierBefore: Tier;
  tierAfter: Tier;
  wasNew: boolean;
}

/**
 * Record a review. Refuses to grade a card that is not due (the game can never pull cards early).
 */
export async function reviewCard(cardId: number, grade: Grade, now = Date.now(), opts: { dayStartHour?: number; retention?: number; allowNew?: boolean } = {}): Promise<ReviewOutcome> {
  return db.transaction('rw', db.cards, db.logs, async () => {
    const before = await db.cards.get(cardId);
    if (!before) throw new Error(`card ${cardId} not found`);
    const wasNew = before.state === State.New;
    if (!wasNew && !isDue(before, now, opts.dayStartHour ?? 4)) {
      throw new Error('Card is not due; refusing to review early.');
    }
    const { fields, log } = applyGrade(before, grade, now, opts.retention ?? 0.9);
    const after: CardRow = { ...before, ...fields };
    await db.cards.put(after);
    await db.logs.add(logToRow(cardId, log));
    return { before, after, tierBefore: tierOf(before), tierAfter: tierOf(after), wasNew };
  });
}

export async function countDue(now: number, s: { newPerDay: number; maxReviewsPerDay: number; dayStartHour: number }, deckIds?: number[]) {
  const q = await getDueQueue({ now, deckIds, ...s });
  let n = 0, l = 0, r = 0;
  for (const c of q) {
    if (c.state === State.New) n++;
    else if (c.state === State.Review) r++;
    else l++;
  }
  return { new: n, learning: l, review: r, total: q.length };
}
