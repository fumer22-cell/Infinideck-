import { db } from './db';

const VERSION = 1;

async function blobToB64(b: Blob): Promise<string> {
  const buf = new Uint8Array(await b.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}
function b64ToBlob(s: string, type: string): Blob {
  const bin = atob(s);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return new Blob([buf], { type });
}

export async function exportSave(): Promise<string> {
  const [decks, cards, logs, kv, media] = await Promise.all([db.decks.toArray(), db.cards.toArray(), db.logs.toArray(), db.kv.toArray(), db.media.toArray()]);
  const mediaOut = await Promise.all(media.map(async (m) => ({ name: m.name, type: m.blob.type, data: await blobToB64(m.blob) })));
  return JSON.stringify({ app: 'grimrecall', version: VERSION, exported: new Date().toISOString(), decks, cards, logs, kv, media: mediaOut });
}

export async function importSave(json: string): Promise<void> {
  const data = JSON.parse(json);
  if (data?.app !== 'grimrecall') throw new Error('Not a Grimrecall save file.');
  await db.transaction('rw', [db.decks, db.cards, db.logs, db.kv, db.media], async () => {
    await Promise.all([db.decks.clear(), db.cards.clear(), db.logs.clear(), db.kv.clear(), db.media.clear()]);
    await db.decks.bulkAdd(data.decks);
    await db.cards.bulkAdd(data.cards);
    await db.logs.bulkAdd(data.logs);
    await db.kv.bulkAdd(data.kv);
    await db.media.bulkAdd((data.media as { name: string; type: string; data: string }[]).map((m) => ({ name: m.name, blob: b64ToBlob(m.data, m.type) })));
  });
}
