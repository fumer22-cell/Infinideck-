/**
 * Quests: stories told through problems. Each chapter's narration leads to a
 * problem that moves the plot forward. Quests are separate from flashcards and
 * never touch scheduling.
 */
import type { AbilityId } from '../abilities';
import type { Rng } from '../rng';
import type { SkillId } from '../skills';

/** The numbers in a chapter's problem. The first run uses the canonical set; practice runs roll new ones. */
export type Vars = Record<string, number>;

export type Block =
  | { kind: 'p'; text: string }
  | { kind: 'say'; text: string; who?: string }
  | { kind: 'table'; head: string[]; rows: string[][] }
  | { kind: 'eq'; text: string };

/** How an answer must be rounded: significant figures or decimal places. */
export interface Rounding { sig?: number; dp?: number }

export interface Trap { value: number; msg: string }

export interface NumberPart {
  kind: 'number';
  label: (v: Vars) => string;
  answer: (v: Vars) => number;
  unit: string;
  round: Rounding;
  /** answers that come from a common slip, with an in-character nudge */
  traps?: (v: Vars) => Trap[];
}
export interface ChoicePart {
  kind: 'choice';
  label: (v: Vars) => string;
  options: string[];
  answer: (v: Vars) => number;
  /** a nudge when the wrong option is picked */
  wrongMsg?: string;
}
export type Part = NumberPart | ChoicePart;

export interface Reward {
  gold?: number;
  items?: Record<string, number>;
  xp?: Partial<Record<SkillId, number>>;
  spells?: AbilityId[];
  qp?: number;
}

export interface Chapter {
  id: string;
  title: string;
  /** the narration that leads to the problem */
  story: (v: Vars) => Block[];
  parts: Part[];
  /** revealed one at a time: after a wrong answer, or when asked for */
  hints: (v: Vars) => string[];
  /** the worked solution, shown after three misses */
  solution: (v: Vars) => string[];
  /** what happens once it's solved */
  outcome: Block[];
  reward: Reward;
  vars: Vars;
  /** fresh numbers for a practice run */
  echo: (rng: Rng) => Vars;
}

export interface Quest {
  id: string;
  title: string;
  giver: { name: string; sprite: string; title: string };
  /** subject, for the quest board */
  subject: string;
  blurb: string;
  chapters: Chapter[];
  /** on finishing the last chapter */
  reward: Reward;
  /** a bonus for finishing without a single miss or hint */
  flawless: { text: string; upgradeSpells?: boolean; reward?: Reward };
  /** shown on the completion screen */
  epilogue: Block[];
}

export interface QuestProgress {
  /** the chapter you're on; chapters.length once complete */
  step: number;
  /** per finished chapter: solved without a miss or a hint */
  stars: boolean[];
  /** misses and hints on the current chapter */
  wrong: number;
  hints: number;
  /** parts of the current chapter already answered right */
  solved: number[];
  /** a chapter you just finished, whose outcome hasn't been read yet */
  outcome?: number;
  /** when the quest was completed */
  done?: number;
  /** practice runs finished */
  echoes?: number;
}
