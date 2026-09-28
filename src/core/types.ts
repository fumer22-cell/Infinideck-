import type { State } from 'ts-fsrs';

export type EffectId =
  // common
  | 'attack' | 'heal' | 'shield' | 'poison' | 'draw'
  // rare (mature+)
  | 'doublehit' | 'lifesteal' | 'cleave'
  // epic (legendary)
  | 'meteor' | 'phoenix' | 'soulrend' | 'plague';

/** 0 = New/Learning, 1 = Young, 2 = Mature, 3 = Legendary */
export type Tier = 0 | 1 | 2 | 3;

export interface Deck {
  id?: number;
  name: string;
  created: number;
  /** type answers and have the app check them ("verified" answers earn extra) */
  typeAnswers?: boolean;
}

/** A card row. FSRS fields mirror ts-fsrs `Card`, with dates stored as epoch ms. */
export interface CardRow {
  id?: number;
  deckId: number;
  front: string; // sanitized HTML
  back: string; // sanitized HTML
  image?: string; // media key (optional picture shown on the front)
  created: number;
  suspended: 0 | 1;
  // --- FSRS state ---
  due: number;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: State;
  last_review?: number;
  // --- game state (never affects scheduling) ---
  effect: EffectId;
  tierSeen: Tier;
  /** lapses at which leech status was last cleared */
  leechBase: number;
  ankiId?: number;
}

export interface ReviewLogRow {
  id?: number;
  cardId: number;
  rating: number;
  state: State;
  due: number;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  last_elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  review: number;
  source: 'app' | 'anki';
}

export interface MediaRow {
  name: string;
  blob: Blob;
}

export interface KVRow {
  key: string;
  value: unknown;
}
