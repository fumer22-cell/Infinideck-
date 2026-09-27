import Dexie, { type EntityTable } from 'dexie';
import type { CardRow, Deck, KVRow, MediaRow, ReviewLogRow } from './types';

export class GrimDB extends Dexie {
  decks!: EntityTable<Deck, 'id'>;
  cards!: EntityTable<CardRow, 'id'>;
  logs!: EntityTable<ReviewLogRow, 'id'>;
  media!: EntityTable<MediaRow, 'name'>;
  kv!: EntityTable<KVRow, 'key'>;

  constructor(name = 'grimrecall') {
    super(name);
    this.version(1).stores({
      decks: '++id, name',
      cards: '++id, deckId, due, state, ankiId',
      logs: '++id, cardId, review',
      media: 'name',
      kv: 'key',
    });
  }
}

export const db = new GrimDB();

export async function kvGet<T>(key: string, fallback: T): Promise<T> {
  const row = await db.kv.get(key);
  return row ? (row.value as T) : fallback;
}

export async function kvSet<T>(key: string, value: T): Promise<void> {
  await db.kv.put({ key, value });
}
