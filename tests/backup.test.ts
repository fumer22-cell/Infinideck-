import 'fake-indexeddb/auto';
import { beforeEach, expect, it } from 'vitest';
import { exportSave, importSave } from '../src/core/backup';
import { db, kvSet } from '../src/core/db';
import { newCardRow } from '../src/core/srs';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

it('exports and restores the full save, including media', async () => {
  const deckId = (await db.decks.add({ name: 'D', created: 1 })) as number;
  const cardId = (await db.cards.add({ ...newCardRow(deckId, 'f', 'b', 'heal', 1000), image: 'a.png' })) as number;
  await db.logs.add({ cardId, rating: 3, state: 0, due: 1, stability: 1, difficulty: 5, elapsed_days: 0, last_elapsed_days: 0, scheduled_days: 0, learning_steps: 0, review: 1, source: 'app' });
  await db.media.put({ name: 'a.png', blob: new Blob([new Uint8Array([1, 2, 3, 250])], { type: 'image/png' }) });
  await kvSet('profile', { gold: 42 });
  const json = await exportSave();

  await db.cards.clear();
  await db.kv.clear();
  await importSave(json);

  const card = await db.cards.get(cardId);
  expect(card?.effect).toBe('heal');
  expect(card?.due).toBe(1000);
  expect(await db.logs.count()).toBe(1);
  expect((await db.kv.get('profile'))?.value).toEqual({ gold: 42 });
  const m = await db.media.get('a.png');
  expect([...new Uint8Array(await m!.blob.arrayBuffer())]).toEqual([1, 2, 3, 250]);
  await expect(importSave('{"app":"other"}')).rejects.toThrow();
});
