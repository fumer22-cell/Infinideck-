/**
 * Cloud save for the claude.ai artifact build. Uses the artifact `db`
 * capability: each signed-in person's data lives under their own private
 * `data/users/<id>/` path, which nobody else (the artifact owner included)
 * can read.
 *
 * IndexedDB stays the working copy. The whole save is gzipped, split into
 * <256 KiB documents and written under a fresh version id; the manifest
 * document is written last, so readers always see a complete save. Images
 * are stored once each, keyed by filename.
 */
import Dexie from 'dexie';
import { b64ToBytes, blobToB64, bytesToB64, exportData, importData, type SaveData } from './backup';
import { db } from './db';

type Snap = { exists: boolean; data(): Record<string, unknown> | undefined };
type DocRef = { get(): Promise<Snap>; set(d: Record<string, unknown>): Promise<void>; delete(): Promise<void> };
type CloudDb = { doc(path: string): DocRef };
type CloudUser = { id(): Promise<string | null> };
type ClaudeGlobal = { use(name: string): Promise<unknown> };

interface MediaEntry { k: string; n: number; type: string }
interface Manifest {
  v: 1;
  version: string;
  updatedAt: number;
  device: string;
  parts: number;
  gz: boolean;
  cards: number;
  media: Record<string, MediaEntry>;
}

export type CloudStatus = 'off' | 'connecting' | 'synced' | 'saving' | 'error' | 'unavailable';

const PART_CHARS = 200_000;
const MEDIA_PART_CHARS = 180_000;
const PUSH_DELAY_MS = 4000;

// Sync bookkeeping lives in its own database so it is never part of a save.
const meta = new Dexie('grimrecall-sync');
meta.version(1).stores({ kv: 'key' });
interface SyncMeta { syncedVersion: string | null; dirty: boolean; device: string; lastSyncAt: number | null }
async function loadMeta(): Promise<SyncMeta> {
  const row = (await meta.table('kv').get('meta')) as { value: SyncMeta } | undefined;
  return row?.value ?? { syncedVersion: null, dirty: false, device: Math.random().toString(36).slice(2, 10), lastSyncAt: null };
}
async function saveMeta(m: SyncMeta) {
  await meta.table('kv').put({ key: 'meta', value: m });
}

// ---------- state ----------
let store: CloudDb | null = null;
let root = '';
let state: SyncMeta | null = null;
let manifest: Manifest | null = null;
let status: CloudStatus = 'off';
let lastError = '';
let applyingRemote = false;
let pushTimer: ReturnType<typeof setTimeout> | undefined;
let pushing: Promise<void> | null = null;
let pushAgain = false;
const listeners = new Set<() => void>();

function setStatus(s: CloudStatus, err = '') {
  status = s;
  lastError = err;
  listeners.forEach((l) => l());
}
export function cloudStatus() {
  return { status, lastSyncAt: state?.lastSyncAt ?? null, error: lastError };
}
export function onCloudStatus(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ---------- helpers ----------
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function retry<T>(fn: () => Promise<T>, tries = 5): Promise<T> {
  for (let k = 0; ; k++) {
    try {
      return await fn();
    } catch (e) {
      const code = (e as { code?: string })?.code;
      if (k >= tries - 1 || (code !== 'unavailable' && code !== 'resource_exhausted')) throw e;
      await sleep(400 * 2 ** k + Math.random() * 300);
    }
  }
}

async function gzip(text: string): Promise<{ b64: string; gz: boolean }> {
  if (typeof CompressionStream === 'undefined') return { b64: bytesToB64(new TextEncoder().encode(text)), gz: false };
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return { b64: bytesToB64(new Uint8Array(await new Response(stream).arrayBuffer())), gz: true };
}
async function gunzip(b64: string, gz: boolean): Promise<string> {
  const bytes = b64ToBytes(b64);
  if (!gz) return new TextDecoder().decode(bytes);
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}
function chunks(s: string, size: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < s.length; i += size) out.push(s.slice(i, i + size));
  return out.length ? out : [''];
}
/** Doc ids allow only [A-Za-z0-9_-.~:@+]; media names can contain anything. */
function mediaKey(name: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(36) + '-' + name.length.toString(36);
}
const ref = (id: string) => store!.doc(`${root}/${id}`);

async function readManifest(): Promise<Manifest | null> {
  const snap = await retry(() => ref('manifest').get());
  return snap.exists ? (snap.data() as unknown as Manifest) : null;
}

async function localIsEmpty(): Promise<boolean> {
  return (await db.cards.count()) === 0 && (await db.decks.count()) === 0;
}

// ---------- change tracking ----------
function markDirty() {
  if (applyingRemote || !state || !store) return;
  if (!state.dirty) {
    state.dirty = true;
    void saveMeta(state);
  }
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => void push(), PUSH_DELAY_MS);
}
function trackChanges() {
  for (const t of db.tables) {
    t.hook('creating', () => void queueMicrotask(markDirty));
    t.hook('updating', () => void queueMicrotask(markDirty));
    t.hook('deleting', () => void queueMicrotask(markDirty));
  }
}

// ---------- push / pull ----------
export async function push(): Promise<void> {
  if (!store || !state) return;
  if (pushing) {
    pushAgain = true;
    return pushing;
  }
  clearTimeout(pushTimer);
  pushing = (async () => {
    setStatus('saving');
    try {
      state!.dirty = false; // changes made during the upload mark it dirty again
      await saveMeta(state!);
      const data = await exportData({ media: false });
      const { b64, gz } = await gzip(JSON.stringify(data));
      const parts = chunks(b64, PART_CHARS);
      const version = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        await retry(() => ref(`core-${version}-${i}`).set({ i, data: part }));
      }
      // images: upload any the cloud doesn't have yet
      const media: Record<string, MediaEntry> = { ...(manifest?.media ?? {}) };
      const localNames = new Set(await db.media.toCollection().primaryKeys());
      for (const name of localNames) {
        if (media[name]) continue;
        const row = await db.media.get(name);
        if (!row) continue;
        const k = mediaKey(name);
        const mparts = chunks(await blobToB64(row.blob), MEDIA_PART_CHARS);
        for (let i = 0; i < mparts.length; i++) {
          const part = mparts[i];
          await retry(() => ref(`m-${k}-${i}`).set({ name, i, data: part }));
        }
        media[name] = { k, n: mparts.length, type: row.blob.type };
      }
      for (const name of Object.keys(media)) if (!localNames.has(name)) delete media[name];
      const next: Manifest = { v: 1, version, updatedAt: Date.now(), device: state!.device, parts: parts.length, gz, cards: data.cards.length, media };
      await retry(() => ref('manifest').set(next as unknown as Record<string, unknown>));
      const old = manifest;
      manifest = next;
      state!.syncedVersion = version;
      state!.lastSyncAt = Date.now();
      await saveMeta(state!);
      setStatus('synced');
      // clean up the previous version (best effort)
      if (old) for (let i = 0; i < old.parts; i++) await ref(`core-${old.version}-${i}`).delete().catch(() => {});
      if (old) for (const [name, e] of Object.entries(old.media)) if (!media[name]) for (let i = 0; i < e.n; i++) await ref(`m-${e.k}-${i}`).delete().catch(() => {});
    } catch (e) {
      console.error('cloud push failed', e);
      state!.dirty = true;
      await saveMeta(state!);
      const code = (e as { code?: string })?.code;
      setStatus('error', code === 'quota_exceeded' ? 'Claude storage for this app is full.' : code === 'invalid_argument' ? 'Claude refused the save (read-only access?).' : 'Could not reach Claude. Will retry.');
      if (code !== 'quota_exceeded' && code !== 'invalid_argument') {
        clearTimeout(pushTimer);
        pushTimer = setTimeout(() => void push(), 30_000);
      }
    }
  })();
  try {
    await pushing;
  } finally {
    pushing = null;
    if (pushAgain) {
      pushAgain = false;
      void push();
    }
  }
}

async function pull(m: Manifest): Promise<void> {
  setStatus('saving');
  const parts = await Promise.all(Array.from({ length: m.parts }, (_, i) => retry(() => ref(`core-${m.version}-${i}`).get())));
  if (parts.some((p) => !p.exists)) throw new Error('Cloud save is incomplete.');
  const text = await gunzip(parts.map((p) => String(p.data()!.data)).join(''), m.gz);
  const data = JSON.parse(text) as SaveData;
  applyingRemote = true;
  try {
    await importData(data);
    // images missing locally
    for (const [name, e] of Object.entries(m.media)) {
      if (await db.media.get(name)) continue;
      const mparts = await Promise.all(Array.from({ length: e.n }, (_, i) => retry(() => ref(`m-${e.k}-${i}`).get())));
      if (mparts.some((p) => !p.exists)) continue;
      const bytes = b64ToBytes(mparts.map((p) => String(p.data()!.data)).join(''));
      await db.media.put({ name, blob: new Blob([bytes as BlobPart], { type: e.type }) });
    }
    await sleep(0); // let change hooks queued by the import run while applyingRemote is still set
  } finally {
    applyingRemote = false;
  }
  clearTimeout(pushTimer);
  manifest = m;
  state!.syncedVersion = m.version;
  state!.dirty = false;
  state!.lastSyncAt = Date.now();
  await saveMeta(state!);
  setStatus('synced');
}

// ---------- lifecycle ----------
export type SyncOutcome = 'off' | 'unavailable' | 'ok' | 'pulled' | 'conflict';
export interface Conflict { cloudCards: number; cloudUpdatedAt: number; localCards: number }
let pendingConflict: Manifest | null = null;

let starting: Promise<{ outcome: SyncOutcome; conflict?: Conflict }> | null = null;
/** Connect and reconcile. Runs before the app renders (once per page load). */
export function startCloud(): Promise<{ outcome: SyncOutcome; conflict?: Conflict }> {
  starting ??= connectAndReconcile();
  return starting;
}

async function connectAndReconcile(): Promise<{ outcome: SyncOutcome; conflict?: Conflict }> {
  const claude = (window as unknown as { claude?: ClaudeGlobal }).claude;
  if (!claude?.use) return { outcome: 'off' };
  setStatus('connecting');
  const [dbNs, userNs] = await Promise.all([claude.use('db'), claude.use('user')]);
  const uid = userNs ? await (userNs as CloudUser).id() : null;
  if (!dbNs || !uid) {
    setStatus('unavailable');
    return { outcome: 'unavailable' };
  }
  store = dbNs as CloudDb;
  root = `data/users/${uid}`;
  state = await loadMeta();
  await saveMeta(state);
  trackChanges();
  try {
    return await reconcile();
  } catch (e) {
    console.error('cloud sync failed', e);
    setStatus('error', 'Could not reach Claude. Using this device’s copy.');
    return { outcome: 'ok' };
  } finally {
    document.addEventListener('visibilitychange', onVisibility);
  }
}

async function reconcile(): Promise<{ outcome: SyncOutcome; conflict?: Conflict }> {
  const m = await readManifest();
  manifest = m;
  if (!m) {
    if (!(await localIsEmpty())) await push();
    else setStatus('synced');
    return { outcome: 'ok' };
  }
  if (m.version === state!.syncedVersion) {
    if (state!.dirty) await push();
    else setStatus('synced');
    return { outcome: 'ok' };
  }
  // the cloud has a save this device hasn't seen
  if (!state!.dirty || (await localIsEmpty())) {
    await pull(m);
    return { outcome: 'pulled' };
  }
  pendingConflict = m;
  setStatus('synced');
  return { outcome: 'conflict', conflict: { cloudCards: m.cards, cloudUpdatedAt: m.updatedAt, localCards: await db.cards.count() } };
}

/** Resolve a conflict: keep the cloud save, or overwrite it with this device's data. */
export async function resolveConflict(keep: 'cloud' | 'device'): Promise<void> {
  const m = pendingConflict;
  pendingConflict = null;
  if (!m) return;
  if (keep === 'cloud') await pull(m);
  else {
    manifest = m; // reuse its uploaded images
    await push();
  }
}

let reloadHandler: (() => void) | null = null;
export function onRemoteChange(fn: () => void) {
  reloadHandler = fn;
}

async function onVisibility() {
  if (!store || !state) return;
  if (document.visibilityState === 'hidden') {
    if (state.dirty) void push();
    return;
  }
  try {
    const m = await readManifest();
    if (m && m.version !== state.syncedVersion && m.device !== state.device && !state.dirty && !pushing) {
      await pull(m);
      reloadHandler?.();
    }
  } catch {
    /* next focus retries */
  }
}

export async function syncNow(): Promise<void> {
  if (!store || !state) return;
  const m = await readManifest().catch(() => null);
  if (m && m.version !== state.syncedVersion && !state.dirty) {
    await pull(m);
    reloadHandler?.();
  } else await push();
}
