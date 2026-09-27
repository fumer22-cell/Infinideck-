import type { SqlJsStatic } from 'sql.js';
import { db } from '../core/db';
import { newCardRow } from '../core/srs';
import type { CardRow } from '../core/types';
import { rollStartingEffect } from '../game/effects';
import { parseApkg } from './apkg';
import { csvToNotes } from './csv';
import { extractImageRefs, mimeFor, sanitizeHtml, textToHtml } from './html';

let sqlPromise: Promise<SqlJsStatic> | null = null;
export function loadSql(): Promise<SqlJsStatic> {
  if (!sqlPromise) {
    sqlPromise = (async () => {
      const [{ default: initSqlJs }, { default: wasmUrl }] = await Promise.all([import('sql.js'), import('sql.js/dist/sql-wasm.wasm?url')]);
      return initSqlJs({ locateFile: () => wasmUrl });
    })();
  }
  return sqlPromise;
}

async function deckIdByName(name: string): Promise<number> {
  const existing = await db.decks.where('name').equals(name).first();
  if (existing) return existing.id!;
  return (await db.decks.add({ name, created: Date.now() })) as number;
}

export interface ImportSummary { decks: number; cards: number; skipped: number; media: number; reviews: number }

export async function importApkg(data: ArrayBuffer, SQL?: SqlJsStatic, now = Date.now()): Promise<ImportSummary> {
  const parsed = await parseApkg(data, SQL ?? (await loadSql()), now);
  const usedDecks = new Set(parsed.cards.map((c) => c.ankiDeckId));
  const deckMap = new Map<number, number>();
  for (const d of parsed.decks) {
    if (usedDecks.has(d.ankiId)) deckMap.set(d.ankiId, await deckIdByName(d.name));
  }
  const fallbackDeck = async () => deckMap.get(-1) ?? (deckMap.set(-1, await deckIdByName('Imported')), deckMap.get(-1)!);

  const summary: ImportSummary = { decks: new Set(deckMap.values()).size, cards: 0, skipped: 0, media: 0, reviews: 0 };
  await db.transaction('rw', db.cards, db.logs, db.media, db.decks, async () => {
    const existing = new Set((await db.cards.where('ankiId').anyOf(parsed.cards.map((c) => c.ankiId)).toArray()).map((c) => c.ankiId));
    for (const c of parsed.cards) {
      if (existing.has(c.ankiId)) {
        summary.skipped++;
        continue;
      }
      const deckId = deckMap.get(c.ankiDeckId) ?? (await fallbackDeck());
      const row: CardRow = { ...newCardRow(deckId, c.front, c.back, rollStartingEffect(), now), ...c.sched, suspended: c.suspended, ankiId: c.ankiId };
      const id = (await db.cards.add(row)) as number;
      if (c.history.length) {
        await db.logs.bulkAdd(c.history.map((h) => ({ ...h, cardId: id })));
        summary.reviews += c.history.length;
      }
      summary.cards++;
    }
    for (const [name, bytes] of parsed.media) {
      await db.media.put({ name, blob: new Blob([bytes as BlobPart], { type: mimeFor(name) }) });
      summary.media++;
    }
  });
  return summary;
}


export async function importCsv(text: string, deckId: number, now = Date.now()): Promise<ImportSummary> {
  const notes = csvToNotes(text);
  const looksHtml = (s: string) => /<[a-z][^>]*>/i.test(s);
  const rows = notes.map((n, i) =>
    newCardRow(deckId, looksHtml(n.front) ? sanitizeHtml(n.front) : textToHtml(n.front), looksHtml(n.back) ? sanitizeHtml(n.back) : textToHtml(n.back), rollStartingEffect(), now + i),
  );
  await db.cards.bulkAdd(rows);
  return { decks: 0, cards: rows.length, skipped: 0, media: 0, reviews: 0 };
}

export { extractImageRefs, mimeFor };
