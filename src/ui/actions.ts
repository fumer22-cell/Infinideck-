import { db } from '../core/db';
import { registerClear } from '../core/profile';
import { countDue, dayKey, dayStart, State } from '../core/srs';
import type { EffectId, Tier } from '../core/types';
import type { AppCtx } from './context';

/** If nothing is due any more today, count the day toward the streak. */
export async function checkQueueCleared(app: AppCtx): Promise<boolean> {
  const now = Date.now();
  const s = app.settings;
  if ((await countDue(now, s)).total > 0) return false;
  const doneToday = await db.logs.where('review').aboveOrEqual(dayStart(now, s.dayStartHour)).filter((l) => l.source === 'app').count();
  if (!doneToday) return false;
  const today = dayKey(now, s.dayStartHour);
  const yesterday = dayKey(now - 86_400_000, s.dayStartHour);
  let fresh = false;
  await app.updateProfile((p) => {
    fresh = registerClear(p, today, yesterday);
  });
  if (fresh) app.toast('Due queue cleared! A streak chest awaits in Journey.');
  return fresh;
}

/** Change only the game effect of a card (never its schedule). */
export async function setCardEffect(cardId: number, effect: EffectId, tier: Tier) {
  await db.cards.update(cardId, { effect, tierSeen: tier });
}

export async function countMature(): Promise<number> {
  return db.cards.where('state').equals(State.Review).filter((c) => c.scheduled_days >= 21).count();
}
