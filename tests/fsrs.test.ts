import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createEmptyCard, fsrs, generatorParameters, Rating, State } from 'ts-fsrs';
import { db } from '../src/core/db';
import { applyGrade, dayEnd, getDueQueue, isDue, isLeech, newCardRow, reviewCard, rowToFsrs, tierOf } from '../src/core/srs';
import type { CardRow } from '../src/core/types';

const DAY = 86_400_000;
const NOW = new Date(2026, 8, 27, 12, 0, 0).getTime(); // noon local
const opts = { now: NOW, newPerDay: 20, maxReviewsPerDay: 200, dayStartHour: 4 };

async function addCard(over: Partial<CardRow> = {}): Promise<CardRow> {
  const row = { ...newCardRow(1, 'front', 'back', 'attack', NOW - DAY), ...over };
  row.id = (await db.cards.add(row)) as number;
  return row;
}

function reviewRow(dueOffsetMs: number, ivlDays: number): Partial<CardRow> {
  return { state: State.Review, due: NOW + dueOffsetMs, scheduled_days: ivlDays, stability: ivlDays, difficulty: 5, reps: 3, last_review: NOW + dueOffsetMs - ivlDays * DAY };
}

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('FSRS grading matches ts-fsrs exactly', () => {
  it('produces the same card as calling ts-fsrs directly, for every grade', () => {
    const f = fsrs(generatorParameters({ request_retention: 0.9, enable_fuzz: true, enable_short_term: true }));
    const base = newCardRow(1, 'q', 'a', 'attack', NOW);
    for (const g of [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy] as const) {
      const ours = applyGrade(base, g, NOW);
      const theirs = f.next(createEmptyCard(new Date(NOW)), new Date(NOW), g);
      expect(ours.fields.due).toBe(theirs.card.due.getTime());
      expect(ours.fields.stability).toBeCloseTo(theirs.card.stability, 10);
      expect(ours.fields.difficulty).toBeCloseTo(theirs.card.difficulty, 10);
      expect(ours.fields.state).toBe(theirs.card.state);
    }
  });

  it('round-trips card rows through ts-fsrs', () => {
    const row = { ...newCardRow(1, 'q', 'a', 'heal', NOW), ...reviewRow(0, 10) } as CardRow;
    const c = rowToFsrs(row);
    expect(c.due.getTime()).toBe(row.due);
    expect(c.state).toBe(State.Review);
    expect(c.last_review?.getTime()).toBe(row.last_review);
  });

  it('a multi-step review sequence advances state like Anki', () => {
    let row = newCardRow(1, 'q', 'a', 'attack', NOW);
    let t = NOW;
    const g1 = applyGrade(row, Rating.Good, t);
    row = { ...row, ...g1.fields };
    expect(row.state).toBe(State.Learning);
    t = row.due;
    const g2 = applyGrade(row, Rating.Good, t);
    row = { ...row, ...g2.fields };
    expect(row.state).toBe(State.Review);
    expect(row.scheduled_days).toBeGreaterThanOrEqual(1);
    t = row.due;
    const g3 = applyGrade(row, Rating.Again, t);
    row = { ...row, ...g3.fields };
    expect(row.state).toBe(State.Relearning);
    expect(row.lapses).toBe(1);
  });
});

describe('reviewCard persistence', () => {
  it('writes the new schedule and a review log', async () => {
    const c = await addCard();
    const out = await reviewCard(c.id!, Rating.Good, NOW);
    const stored = await db.cards.get(c.id!);
    expect(stored!.due).toBe(out.after.due);
    expect(stored!.reps).toBe(1);
    const logs = await db.logs.where('cardId').equals(c.id!).toArray();
    expect(logs).toHaveLength(1);
    expect(logs[0].rating).toBe(Rating.Good);
    expect(logs[0].state).toBe(State.New);
    expect(out.wasNew).toBe(true);
  });

  it('refuses to review a card early (the game can never pull cards forward)', async () => {
    const c = await addCard(reviewRow(3 * DAY, 5));
    await expect(reviewCard(c.id!, Rating.Good, NOW)).rejects.toThrow(/not due/);
    const stored = await db.cards.get(c.id!);
    expect(stored!.due).toBe(c.due);
    expect(await db.logs.count()).toBe(0);
  });

  it('refuses a learning card whose step has not elapsed', async () => {
    const c = await addCard({ state: State.Learning, due: NOW + 5 * 60_000, stability: 1, difficulty: 5, reps: 1 });
    await expect(reviewCard(c.id!, Rating.Good, NOW)).rejects.toThrow();
  });
});

describe('due queue', () => {
  it('only includes cards that are due now, Anki-style', async () => {
    const overdue = await addCard(reviewRow(-2 * DAY, 4));
    const laterToday = await addCard(reviewRow(6 * 3600_000, 4)); // 6pm today: due today (day-granular)
    const tomorrow = await addCard(reviewRow(dayEnd(NOW) - NOW + 3600_000, 4));
    const learnDue = await addCard({ state: State.Learning, due: NOW - 60_000, stability: 1, difficulty: 5, reps: 1 });
    const learnLater = await addCard({ state: State.Learning, due: NOW + 10 * 60_000, stability: 1, difficulty: 5, reps: 1 });
    const suspended = await addCard({ ...reviewRow(-DAY, 3), suspended: 1 });
    const fresh = await addCard();

    const q = await getDueQueue(opts);
    const ids = q.map((c) => c.id);
    expect(ids[0]).toBe(learnDue.id); // learning first
    expect(ids).toContain(overdue.id);
    expect(ids).toContain(laterToday.id);
    expect(ids).toContain(fresh.id);
    expect(ids).not.toContain(tomorrow.id);
    expect(ids).not.toContain(learnLater.id);
    expect(ids).not.toContain(suspended.id);
    expect(isDue(tomorrow, NOW)).toBe(false);
  });

  it('respects the daily new-card limit, counting cards already introduced today', async () => {
    for (let i = 0; i < 10; i++) await addCard({ due: NOW - DAY + i });
    let q = await getDueQueue({ ...opts, newPerDay: 3 });
    expect(q.filter((c) => c.state === State.New)).toHaveLength(3);
    await reviewCard(q[0].id!, Rating.Good, NOW);
    q = await getDueQueue({ ...opts, newPerDay: 3 });
    expect(q.filter((c) => c.state === State.New)).toHaveLength(2);
  });

  it('respects the daily review limit', async () => {
    for (let i = 0; i < 5; i++) await addCard(reviewRow(-DAY + i, 3));
    const q = await getDueQueue({ ...opts, maxReviewsPerDay: 2 });
    expect(q.filter((c) => c.state === State.Review)).toHaveLength(2);
  });
});

describe('maturity tiers & leeches', () => {
  it('maps FSRS intervals to tiers', () => {
    expect(tierOf({ state: State.New, scheduled_days: 0 })).toBe(0);
    expect(tierOf({ state: State.Learning, scheduled_days: 0 })).toBe(0);
    expect(tierOf({ state: State.Relearning, scheduled_days: 40 })).toBe(0);
    expect(tierOf({ state: State.Review, scheduled_days: 5 })).toBe(1);
    expect(tierOf({ state: State.Review, scheduled_days: 21 })).toBe(2);
    expect(tierOf({ state: State.Review, scheduled_days: 90 })).toBe(3);
  });
  it('flags leeches at 4 lapses since last cleared', () => {
    expect(isLeech({ lapses: 3, leechBase: 0 })).toBe(false);
    expect(isLeech({ lapses: 4, leechBase: 0 })).toBe(true);
    expect(isLeech({ lapses: 5, leechBase: 4 })).toBe(false);
  });
});
