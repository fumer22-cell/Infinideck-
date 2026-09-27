import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** In-memory stand-in for the artifact `db` capability (same doc API surface the app uses). */
function fakeStore(maxDocBytes = 256 * 1024) {
  const docs = new Map<string, Record<string, unknown>>();
  return {
    docs,
    doc: (path: string) => ({
      get: async () => ({ exists: docs.has(path), data: () => docs.get(path) }),
      set: async (d: Record<string, unknown>) => {
        if (JSON.stringify(d).length > maxDocBytes) throw { code: 'invalid_argument', message: 'too big' };
        docs.set(path, structuredClone(d));
      },
      delete: async () => void docs.delete(path),
    }),
  };
}

let store: ReturnType<typeof fakeStore>;

async function device(uid = 'u1') {
  // a fresh "device": new browser storage + fresh module state
  vi.resetModules();
  indexedDB.deleteDatabase('grimrecall');
  indexedDB.deleteDatabase('grimrecall-sync');
  (globalThis as Record<string, unknown>).window = globalThis;
  (globalThis as Record<string, unknown>).document = { visibilityState: 'visible', addEventListener() {} };
  (globalThis as Record<string, unknown>).claude = { use: async (n: string) => (n === 'db' ? store : n === 'user' ? { id: async () => uid } : null) };
  const cloud = await import('../src/core/cloud');
  const { db } = await import('../src/core/db');
  const srs = await import('../src/core/srs');
  return { cloud, db, srs };
}

beforeEach(() => {
  store = fakeStore();
});
afterEach(() => {
  delete (globalThis as Record<string, unknown>).claude;
});

describe('cloud save', () => {
  it('saves on one device and restores on another, images included', async () => {
    const a = await device();
    expect((await a.cloud.startCloud()).outcome).toBe('ok');
    const deckId = (await a.db.decks.add({ name: 'Latin', created: 1 })) as number;
    // enough cards to need several chunks
    const rows = Array.from({ length: 3000 }, (_, i) => a.srs.newCardRow(deckId, `front ${i} ${Math.random()}`, `back ${Math.random()}`, 'attack', 1000 + i));
    await a.db.cards.bulkAdd(rows);
    const img = new Uint8Array(300_000).map(() => Math.floor(Math.random() * 256));
    await a.db.media.put({ name: 'my pic (1).png', blob: new Blob([img], { type: 'image/png' }) });
    await a.cloud.push();
    expect(a.cloud.cloudStatus().status).toBe('synced');
    const manifest = store.docs.get('data/users/u1/manifest') as { parts: number };
    expect(manifest).toBeTruthy();
    for (const k of store.docs.keys()) expect(k.startsWith('data/users/u1/')).toBe(true);

    const b = await device();
    expect(await b.db.cards.count()).toBe(0);
    expect((await b.cloud.startCloud()).outcome).toBe('pulled');
    expect(await b.db.cards.count()).toBe(3000);
    expect((await b.db.decks.toArray())[0].name).toBe('Latin');
    const m = await b.db.media.get('my pic (1).png');
    expect(new Uint8Array(await m!.blob.arrayBuffer())).toEqual(img);
  });

  it('replaces old versions instead of piling up documents', async () => {
    const a = await device();
    await a.cloud.startCloud();
    await a.db.decks.add({ name: 'D', created: 1 });
    await a.cloud.push();
    const n1 = store.docs.size;
    await a.db.decks.add({ name: 'E', created: 2 });
    await a.cloud.push();
    await a.cloud.push();
    expect(store.docs.size).toBe(n1);
  });

  it('asks which save to keep when both sides changed', async () => {
    const a = await device();
    await a.cloud.startCloud();
    await a.db.decks.add({ name: 'From A', created: 1 });
    await a.cloud.push();

    // device B worked offline before ever syncing
    vi.resetModules();
    indexedDB.deleteDatabase('grimrecall');
    indexedDB.deleteDatabase('grimrecall-sync');
    const saved = (globalThis as Record<string, unknown>).claude;
    delete (globalThis as Record<string, unknown>).claude;
    const { db } = await import('../src/core/db');
    await db.decks.add({ name: 'From B', created: 2 });
    // mark B as having unsynced work, as the change hooks would once connected
    const Dexie = (await import('dexie')).default;
    const meta = new Dexie('grimrecall-sync');
    meta.version(1).stores({ kv: 'key' });
    await meta.table('kv').put({ key: 'meta', value: { syncedVersion: null, dirty: true, device: 'b', lastSyncAt: null } });
    meta.close();
    (globalThis as Record<string, unknown>).claude = saved;
    const cloud = await import('../src/core/cloud');
    const r = await cloud.startCloud();
    expect(r.outcome).toBe('conflict');
    await cloud.resolveConflict('cloud');
    expect((await db.decks.toArray()).map((d) => d.name)).toEqual(['From A']);
  });

  it('stays off outside claude.ai', async () => {
    vi.resetModules();
    delete (globalThis as Record<string, unknown>).claude;
    const cloud = await import('../src/core/cloud');
    expect((await cloud.startCloud()).outcome).toBe('off');
  });
});
