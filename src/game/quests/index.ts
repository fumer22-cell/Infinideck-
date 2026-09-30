import { addItems, type World } from '../world';
import type { SkillId } from '../skills';
import type { Quest, QuestProgress, Reward } from './types';
import { VITRIOL } from './vitriol';

export const QUESTS: Quest[] = [VITRIOL];
export const QUEST_BY_ID = Object.fromEntries(QUESTS.map((q) => [q.id, q])) as Record<string, Quest>;

/** Misses on a chapter before the worked solution is shown. */
export const MAX_MISSES = 3;

export function progressOf(w: World, id: string): QuestProgress {
  return w.quests?.[id] ?? { step: 0, stars: [], wrong: 0, hints: 0, solved: [] };
}

function edit(w: World, id: string): QuestProgress {
  w.quests ??= {};
  return (w.quests[id] ??= { step: 0, stars: [], wrong: 0, hints: 0, solved: [] });
}

export const isDone = (w: World, id: string) => !!w.quests?.[id]?.done;
export const questPoints = (w: World) => QUESTS.reduce((n, q) => n + (isDone(w, q.id) ? q.reward.qp ?? 0 : 0), 0);
export const inProgress = (w: World) => QUESTS.filter((q) => w.quests?.[q.id] && !isDone(w, q.id));

export function recordMiss(w: World, id: string) {
  edit(w, id).wrong++;
}
export function takeHint(w: World, id: string) {
  edit(w, id).hints++;
}
export function markPart(w: World, id: string, part: number) {
  const p = edit(w, id);
  if (!p.solved.includes(part)) p.solved.push(part);
}
export function readOutcome(w: World, id: string) {
  delete edit(w, id).outcome;
}

/** Items and spells go to the world; gold and xp are the caller's to add to the profile. */
function grant(w: World, r: Reward) {
  if (r.items) addItems(w, r.items);
  for (const s of r.spells ?? []) {
    w.spells ??= [];
    if (!w.spells.some((x) => x.id === s)) w.spells.push({ id: s });
  }
}

export interface Payout {
  gold: number;
  xp: Partial<Record<SkillId, number>>;
  /** every reward handed out, for the summary */
  rewards: Reward[];
  completed: boolean;
  flawless: boolean;
  star: boolean;
}

function add(into: Payout, r: Reward) {
  into.gold += r.gold ?? 0;
  for (const [k, v] of Object.entries(r.xp ?? {})) into.xp[k as SkillId] = (into.xp[k as SkillId] ?? 0) + (v ?? 0);
  into.rewards.push(r);
}

/** Finish the current chapter: pay its reward and move on. The last chapter completes the quest. */
export function finishChapter(w: World, quest: Quest, now = Date.now()): Payout {
  const p = edit(w, quest.id);
  const idx = p.step;
  const ch = quest.chapters[idx];
  const star = p.wrong === 0 && p.hints === 0;
  p.stars[idx] = star;
  p.step = idx + 1;
  p.wrong = 0;
  p.hints = 0;
  p.solved = [];
  p.outcome = idx;
  const out: Payout = { gold: 0, xp: {}, rewards: [], completed: false, flawless: false, star };
  grant(w, ch.reward);
  add(out, ch.reward);
  if (p.step >= quest.chapters.length && !p.done) {
    p.done = now;
    out.completed = true;
    grant(w, quest.reward);
    add(out, quest.reward);
    out.flawless = quest.chapters.every((_, i) => p.stars[i]);
    if (out.flawless) {
      if (quest.flawless.upgradeSpells) {
        const learned = new Set(quest.chapters.flatMap((c) => c.reward.spells ?? []).concat(quest.reward.spells ?? []));
        for (const s of w.spells ?? []) if (learned.has(s.id)) s.plus = true;
      }
      if (quest.flawless.reward) {
        grant(w, quest.flawless.reward);
        add(out, quest.flawless.reward);
      }
    }
  }
  return out;
}

/** Practice runs with fresh numbers pay a little, more for a first-try answer. */
export function echoReward(firstTry: boolean): Reward {
  return firstTry ? { gold: 20, xp: { scholarship: 60 } } : { gold: 5, xp: { scholarship: 20 } };
}
export function finishEcho(w: World, id: string) {
  const p = edit(w, id);
  p.echoes = (p.echoes ?? 0) + 1;
}

export type { Quest } from './types';
