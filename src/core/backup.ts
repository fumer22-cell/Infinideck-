import { db } from './db';
import type { CardRow, Deck, KVRow, ReviewLogRow } from './types';

const VERSION = 1;

export interface MediaOut { name: string; type: string; data: string }
export interface SaveData {
  app: 'grimrecall';
  version: number;
  exported: string;
  decks: Deck[];
  cards: CardRow[];
  logs: ReviewLogRow[];
  kv: KVRow[];
  /** absent when media is synced separately (cloud save) */
  media?: MediaOut[];
}

export async function blobToB64(b: Blob): Promise<string> {
  return bytesToB64(new Uint8Array(await b.arrayBuffer()));
}
export function bytesToB64(buf: Uint8Array): string {
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}
export function b64ToBytes(s: string): Uint8Array {
  const bin = atob(s);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf;
}

export async function exportData({ media = true } = {}): Promise<SaveData> {
  const [decks, cards, logs, kv, mediaRows] = await Promise.all([db.decks.toArray(), db.cards.toArray(), db.logs.toArray(), db.kv.toArray(), media ? db.media.toArray() : []]);
  const out: SaveData = { app: 'grimrecall', version: VERSION, exported: new Date().toISOString(), decks, cards, logs, kv };
  if (media) out.media = await Promise.all(mediaRows.map(async (m) => ({ name: m.name, type: m.blob.type, data: await blobToB64(m.blob) })));
  return out;
}

export async function exportSave(): Promise<string> {
  return JSON.stringify(await exportData());
}

/** Replace all local data with a save. Media is only replaced when the save carries it. */
export async function importData(data: SaveData): Promise<void> {
  if (data?.app !== 'grimrecall') throw new Error('Not a Grimrecall save file.');
  await db.transaction('rw', [db.decks, db.cards, db.logs, db.kv, db.media], async () => {
    await Promise.all([db.decks.clear(), db.cards.clear(), db.logs.clear(), db.kv.clear()]);
    await db.decks.bulkAdd(data.decks);
    await db.cards.bulkAdd(data.cards);
    await db.logs.bulkAdd(data.logs);
    await db.kv.bulkAdd(data.kv);
    if (data.media) {
      await db.media.clear();
      await db.media.bulkAdd(data.media.map((m) => ({ name: m.name, blob: new Blob([b64ToBytes(m.data) as BlobPart], { type: m.type }) })));
    }
  });
}

export async function importSave(json: string): Promise<void> {
  await importData(JSON.parse(json));
}
