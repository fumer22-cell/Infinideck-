import JSZip from 'jszip';
import { decompress as zstdDecompress } from 'fzstd';
import type { Database, SqlJsStatic } from 'sql.js';
import { createEmptyCard, State, type FSRSHistory, type Grade } from 'ts-fsrs';
import { fsrsToFields, getScheduler } from '../core/srs';
import type { CardRow, ReviewLogRow } from '../core/types';
import { clozeOrdinals, extractImageRefs, sanitizeHtml, stripHtml } from './html';
import { pbString, readPb } from './protobuf';
import { renderTemplate } from './template';

const DAY = 86_400_000;
const ZSTD_MAGIC = [0x28, 0xb5, 0x2f, 0xfd];
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i;

export const isZstd = (b: Uint8Array) => ZSTD_MAGIC.every((v, i) => b[i] === v);
const maybeZstd = (b: Uint8Array) => (isZstd(b) ? zstdDecompress(b) : b);

type Sched = Pick<CardRow, 'due' | 'stability' | 'difficulty' | 'elapsed_days' | 'scheduled_days' | 'learning_steps' | 'reps' | 'lapses' | 'state' | 'last_review'>;

export interface ParsedCard {
  ankiId: number;
  ankiDeckId: number;
  front: string;
  back: string;
  sched: Sched;
  suspended: 0 | 1;
  history: Omit<ReviewLogRow, 'cardId'>[];
}

export interface ParsedApkg {
  format: 'anki2' | 'anki21' | 'anki21b';
  decks: { ankiId: number; name: string }[];
  cards: ParsedCard[];
  /** image media only, keyed by filename as referenced in fields */
  media: Map<string, Uint8Array>;
}

interface ModelInfo {
  cloze: boolean;
  fields: string[];
  templates: { qfmt: string; afmt: string }[];
}

function rows(db: Database, sql: string): Record<string, unknown>[] {
  const res = db.exec(sql);
  if (!res.length) return [];
  const { columns, values } = res[0];
  return values.map((v) => Object.fromEntries(columns.map((c, i) => [c, v[i]])));
}

function hasTable(db: Database, name: string): boolean {
  return rows(db, `select name from sqlite_master where type='table' and name='${name}'`).length > 0;
}

function loadModels(db: Database, colModels: string): Map<number, ModelInfo> {
  const models = new Map<number, ModelInfo>();
  if (colModels && colModels.trim().startsWith('{')) {
    const json = JSON.parse(colModels) as Record<string, { type: number; flds: { name: string; ord: number }[]; tmpls: { ord: number; qfmt: string; afmt: string }[] }>;
    for (const [id, m] of Object.entries(json)) {
      models.set(Number(id), {
        cloze: m.type === 1,
        fields: [...m.flds].sort((a, b) => a.ord - b.ord).map((f) => f.name),
        templates: [...m.tmpls].sort((a, b) => a.ord - b.ord).map((t) => ({ qfmt: t.qfmt, afmt: t.afmt })),
      });
    }
  }
  if (!models.size && hasTable(db, 'notetypes')) {
    for (const nt of rows(db, 'select id, config from notetypes')) {
      const cfg = nt.config instanceof Uint8Array ? readPb(nt.config) : [];
      const kind = cfg.find((f) => f.no === 1)?.varint ?? 0;
      models.set(Number(nt.id), { cloze: kind === 1, fields: [], templates: [] });
    }
    if (hasTable(db, 'fields')) {
      for (const f of rows(db, 'select ntid, ord, name from fields order by ntid, ord')) models.get(Number(f.ntid))?.fields.push(String(f.name));
    }
    if (hasTable(db, 'templates')) {
      for (const t of rows(db, 'select ntid, ord, config from templates order by ntid, ord')) {
        const cfg = t.config instanceof Uint8Array ? readPb(t.config) : [];
        models.get(Number(t.ntid))?.templates.push({ qfmt: pbString(cfg.find((f) => f.no === 1)), afmt: pbString(cfg.find((f) => f.no === 2)) });
      }
    }
  }
  return models;
}

function loadDecks(db: Database, colDecks: string): { ankiId: number; name: string }[] {
  if (colDecks && colDecks.trim().startsWith('{')) {
    const json = JSON.parse(colDecks) as Record<string, { id: number; name: string }>;
    return Object.values(json).map((d) => ({ ankiId: Number(d.id), name: d.name }));
  }
  if (hasTable(db, 'decks')) {
    return rows(db, 'select id, name from decks').map((d) => ({ ankiId: Number(d.id), name: String(d.name).split('\x1f').join('::') }));
  }
  return [];
}

function answerPart(backHtml: string, frontHtml: string): string {
  const m = backHtml.split(/<hr[^>]*id\s*=\s*["']?answer["']?[^>]*>/i);
  if (m.length > 1) return m.slice(1).join('');
  return backHtml.replace(frontHtml, '');
}

export function renderFaces(model: ModelInfo | undefined, flds: string[], ord: number): { front: string; back: string } {
  const fields: Record<string, string> = {};
  (model?.fields ?? []).forEach((name, i) => (fields[name] = flds[i] ?? ''));
  const isCloze = model?.cloze || (!model && clozeOrdinals(flds[0] ?? '').length > 0);
  if (model && model.templates.length) {
    const tmpl = isCloze ? model.templates[0] : model.templates[ord] ?? model.templates[0];
    const front = renderTemplate(tmpl.qfmt, fields, ord + 1, 'front');
    const backFull = renderTemplate(tmpl.afmt, fields, ord + 1, 'back', front);
    const back = answerPart(backFull, front);
    if (stripHtml(front).trim() || extractImageRefs(front).length) return { front, back };
  }
  if (isCloze) {
    const text = flds[0] ?? '';
    const cz = (side: 'front' | 'back') => renderTemplate('{{cloze:T}}', { T: text }, ord + 1, side);
    return { front: cz('front'), back: cz('back') + (flds[1] ? `<br>${flds[1]}` : '') };
  }
  // fallback: basic / reversed
  return ord === 1 && flds.length >= 2 ? { front: flds[1], back: flds[0] } : { front: flds[0] ?? '', back: flds[1] ?? '' };
}

const REVLOG_STATE: Record<number, State> = { 0: State.Learning, 1: State.Review, 2: State.Relearning, 3: State.Review };

/** Convert Anki scheduling + review history into FSRS state without changing the due date. */
export function convertScheduling(
  card: { type: number; queue: number; due: number; ivl: number; reps: number; lapses: number; data?: string },
  revlog: { id: number; ease: number; type: number; ivl: number }[],
  crtSec: number,
  now: number,
): { sched: Sched; history: Omit<ReviewLogRow, 'cardId'>[] } {
  const graded = revlog.filter((r) => r.ease >= 1 && r.ease <= 4 && r.type <= 3).sort((a, b) => a.id - b.id);
  const history: Omit<ReviewLogRow, 'cardId'>[] = graded.map((r, i) => ({
    rating: r.ease,
    state: i === 0 ? State.New : REVLOG_STATE[r.type] ?? State.Review,
    due: r.id,
    stability: 0,
    difficulty: 0,
    elapsed_days: 0,
    last_elapsed_days: 0,
    scheduled_days: Math.max(0, r.ivl),
    learning_steps: 0,
    review: r.id,
    source: 'anki',
  }));

  if (card.type === 0) {
    return { sched: fsrsToFields(createEmptyCard(new Date(now))), history };
  }

  // 1) memory state: replay the review history through FSRS
  let sched: Sched;
  if (graded.length) {
    const reviews: FSRSHistory[] = graded.map((r) => ({ rating: r.ease as Grade, review: new Date(r.id) }));
    const res = getScheduler().reschedule(createEmptyCard(new Date(graded[0].id)), reviews, { skipManual: true, update_memory_state: true, now: new Date(now) });
    const last = res.collections[res.collections.length - 1];
    sched = fsrsToFields(last.card);
    res.collections.forEach((c, i) => {
      history[i].stability = c.log.stability;
      history[i].difficulty = c.log.difficulty;
    });
  } else {
    sched = { ...fsrsToFields(createEmptyCard(new Date(now))), stability: Math.max(1, card.ivl), difficulty: 5 };
  }
  // Anki 23.10+ stores its own FSRS memory state in cards.data — prefer it.
  if (card.data) {
    try {
      const d = JSON.parse(card.data) as { s?: number; d?: number };
      if (typeof d.s === 'number') sched.stability = d.s;
      if (typeof d.d === 'number') sched.difficulty = d.d;
    } catch {
      /* ignore */
    }
  }

  // 2) keep Anki's actual due date & counters so importing never reschedules anything
  const crtMs = crtSec * 1000;
  const dayBased = card.queue === 2 || card.queue === 3 || (card.queue < 0 && card.type === 2) || card.due < 1_000_000_000;
  const due = dayBased ? crtMs + card.due * DAY : card.due * 1000;
  const state = card.type === 1 ? State.Learning : card.type === 3 ? State.Relearning : State.Review;
  sched = {
    ...sched,
    state,
    due,
    scheduled_days: state === State.Review ? card.ivl : 0,
    reps: card.reps,
    lapses: card.lapses,
    learning_steps: 0,
    last_review: graded.length ? graded[graded.length - 1].id : state === State.Review ? due - card.ivl * DAY : undefined,
  };
  return { sched, history };
}

function readMediaManifest(raw: Uint8Array | null): Map<string, string> {
  const map = new Map<string, string>(); // zip entry -> filename
  if (!raw || !raw.length) return map;
  if (isZstd(raw)) {
    // anki21b: zstd-compressed protobuf MediaEntries { repeated MediaEntry entries = 1 }
    const entries = readPb(zstdDecompress(raw)).filter((f) => f.no === 1 && f.bytes);
    entries.forEach((e, i) => {
      const fields = readPb(e.bytes!);
      const name = pbString(fields.find((f) => f.no === 1));
      const legacy = fields.find((f) => f.no === 255)?.varint;
      map.set(String(legacy ?? i), name);
    });
    return map;
  }
  const json = JSON.parse(new TextDecoder().decode(raw)) as Record<string, string>;
  for (const [k, v] of Object.entries(json)) map.set(k, v);
  return map;
}

export async function parseApkg(data: ArrayBuffer | Uint8Array, SQL: SqlJsStatic, now = Date.now()): Promise<ParsedApkg> {
  const zip = await JSZip.loadAsync(data);
  const fileNames = ['collection.anki21b', 'collection.anki21', 'collection.anki2'] as const;
  const colName = fileNames.find((n) => zip.file(n));
  if (!colName) throw new Error('Not an Anki package: no collection file found.');
  const colBytes = maybeZstd(await zip.file(colName)!.async('uint8array'));
  const db = new SQL.Database(colBytes);
  try {
    const col = rows(db, 'select crt, decks, models from col')[0] ?? { crt: 0, decks: '', models: '' };
    const crt = Number(col.crt);
    const models = loadModels(db, String(col.models ?? ''));
    const decks = loadDecks(db, String(col.decks ?? ''));

    const notes = new Map<number, { mid: number; flds: string[] }>();
    for (const n of rows(db, 'select id, mid, flds from notes')) notes.set(Number(n.id), { mid: Number(n.mid), flds: String(n.flds).split('\x1f') });

    const revByCard = new Map<number, { id: number; ease: number; type: number; ivl: number }[]>();
    if (hasTable(db, 'revlog')) {
      for (const r of rows(db, 'select id, cid, ease, type, ivl from revlog')) {
        const list = revByCard.get(Number(r.cid)) ?? [];
        list.push({ id: Number(r.id), ease: Number(r.ease), type: Number(r.type), ivl: Number(r.ivl) });
        revByCard.set(Number(r.cid), list);
      }
    }

    const cardCols = rows(db, 'pragma table_info(cards)').map((c) => String(c.name));
    const hasData = cardCols.includes('data');
    const cards: ParsedCard[] = [];
    let newPos = 0;
    for (const c of rows(db, `select id, nid, did, ord, type, queue, due, ivl, reps, lapses, odue, odid${hasData ? ', data' : ''} from cards order by due, id`)) {
      const note = notes.get(Number(c.nid));
      if (!note) continue;
      const model = models.get(note.mid);
      const faces = renderFaces(model, note.flds, Number(c.ord));
      const inFiltered = Number(c.odid) !== 0;
      const { sched, history } = convertScheduling(
        {
          type: Number(c.type),
          queue: Number(c.queue),
          due: inFiltered && Number(c.odue) ? Number(c.odue) : Number(c.due),
          ivl: Number(c.ivl),
          reps: Number(c.reps),
          lapses: Number(c.lapses),
          data: hasData ? String(c.data ?? '') : undefined,
        },
        revByCard.get(Number(c.id)) ?? [],
        crt,
        now,
      );
      if (sched.state === State.New) sched.due = now + newPos++; // preserve Anki's new-card order
      cards.push({
        ankiId: Number(c.id),
        ankiDeckId: inFiltered ? Number(c.odid) : Number(c.did),
        front: sanitizeHtml(faces.front),
        back: sanitizeHtml(faces.back),
        sched,
        suspended: Number(c.queue) === -1 ? 1 : 0,
        history,
      });
    }

    // media (images only)
    const manifest = readMediaManifest(zip.file('media') ? await zip.file('media')!.async('uint8array') : null);
    const media = new Map<string, Uint8Array>();
    for (const [entry, name] of manifest) {
      if (!IMAGE_EXT.test(name)) continue;
      const f = zip.file(entry);
      if (!f) continue;
      media.set(name, maybeZstd(await f.async('uint8array')));
    }

    return { format: colName.endsWith('21b') ? 'anki21b' : colName.endsWith('21') ? 'anki21' : 'anki2', decks, cards, media };
  } finally {
    db.close();
  }
}
