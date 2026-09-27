// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { zstdCompressSync } from 'node:zlib';
import JSZip from 'jszip';
import initSqlJs, { type SqlJsStatic } from 'sql.js';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { State } from 'ts-fsrs';
import { db } from '../src/core/db';
import { parseApkg } from '../src/import/apkg';
import { importApkg, importCsv } from '../src/import/importer';
import { csvToNotes } from '../src/import/csv';
import { sanitizeHtml } from '../src/import/html';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 8, 27, 12);
const CRT = Math.floor(Date.UTC(2026, 0, 1, 4) / 1000); // collection created Jan 1 2026
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

let SQL: SqlJsStatic;
beforeAll(async () => {
  SQL = await initSqlJs();
});
beforeEach(async () => {
  await db.delete();
  await db.open();
});

// ---------- tiny protobuf writer for anki21b fixtures ----------
function varint(n: number): number[] {
  const out: number[] = [];
  while (n >= 0x80) {
    out.push((n % 128) | 0x80);
    n = Math.floor(n / 128);
  }
  out.push(n);
  return out;
}
const pbVarint = (no: number, v: number) => [...varint(no * 8), ...varint(v)];
const pbBytes = (no: number, b: Uint8Array | number[]) => [...varint(no * 8 + 2), ...varint(b.length), ...b];
const pbStr = (no: number, s: string) => pbBytes(no, [...new TextEncoder().encode(s)]);
const zstd = (b: Uint8Array) => new Uint8Array(zstdCompressSync(b));

const BASIC_Q = '{{Front}}';
const BASIC_A = '{{FrontSide}}<hr id=answer>{{Back}}';
const REV_Q = '{{Back}}';
const REV_A = '{{FrontSide}}<hr id=answer>{{Front}}';
const CLOZE_Q = '{{cloze:Text}}';
const CLOZE_A = '{{cloze:Text}}<br>{{Extra}}';

// review card due in 3 days from NOW, relative to crt
const dueDays = Math.floor((NOW + 3 * DAY - CRT * 1000) / DAY);
const REV1 = Date.UTC(2026, 7, 1, 10);
const REV2 = Date.UTC(2026, 7, 3, 10);
const REV3 = Date.UTC(2026, 7, 20, 10);

function createCommonTables(d: import('sql.js').Database, withData: boolean) {
  d.run(`create table notes (id integer primary key, guid text, mid integer, mod integer, usn integer, tags text, flds text, sfld text, csum integer, flags integer, data text)`);
  d.run(`create table cards (id integer primary key, nid integer, did integer, ord integer, mod integer, usn integer, type integer, queue integer, due integer, ivl integer, factor integer, reps integer, lapses integer, left integer, odue integer, odid integer, flags integer, data text)`);
  d.run(`create table revlog (id integer primary key, cid integer, usn integer, ease integer, ivl integer, lastIvl integer, factor integer, time integer, type integer)`);
  const note = (id: number, mid: number, flds: string[]) => d.run('insert into notes values (?,?,?,?,?,?,?,?,?,?,?)', [id, `g${id}`, mid, 0, 0, '', flds.join('\x1f'), flds[0], 0, 0, '']);
  const card = (id: number, nid: number, did: number, ord: number, type: number, queue: number, due: number, ivl: number, reps: number, lapses: number, data = '') =>
    d.run('insert into cards values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [id, nid, did, ord, 0, 0, type, queue, due, ivl, 2500, reps, lapses, 0, 0, 0, 0, withData ? data : '']);
  note(1, 100, ['What is the capital of <b>France</b>?<script>alert(1)</script>', 'Paris <img src="paris.png" onerror="evil()">']);
  note(2, 200, ['The {{c1::mitochondria}} is the {{c2::powerhouse::role}} of the cell', 'biology']);
  card(11, 1, 10, 0, 2, 2, dueDays, 19, 3, 0, '{"s":21.5,"d":4.2}'); // review card, forward
  card(12, 1, 10, 1, 0, 0, 5, 0, 0, 0); // new, reversed template
  card(21, 2, 20, 0, 0, 0, 1, 0, 0, 0); // new cloze c1
  card(22, 2, 20, 1, 2, -1, dueDays, 40, 5, 4); // suspended cloze c2, leech
  const rev = (id: number, cid: number, ease: number, ivl: number, type: number) => d.run('insert into revlog values (?,?,?,?,?,?,?,?,?)', [id, cid, 0, ease, ivl, 0, 2500, 5000, type]);
  rev(REV1, 11, 3, -600, 0);
  rev(REV2, 11, 3, 2, 0);
  rev(REV3, 11, 3, 19, 1);
  rev(REV3 + 5, 11, 0, 0, 4); // manual reschedule entry: ignored
}

async function buildLegacyApkg(): Promise<Uint8Array> {
  const d = new SQL.Database();
  d.run(`create table col (id integer primary key, crt integer, mod integer, scm integer, ver integer, dty integer, usn integer, ls integer, conf text, models text, decks text, dconf text, tags text)`);
  const models = {
    100: { id: 100, type: 0, flds: [{ name: 'Front', ord: 0 }, { name: 'Back', ord: 1 }], tmpls: [{ ord: 0, qfmt: BASIC_Q, afmt: BASIC_A }, { ord: 1, qfmt: REV_Q, afmt: REV_A }] },
    200: { id: 200, type: 1, flds: [{ name: 'Text', ord: 0 }, { name: 'Extra', ord: 1 }], tmpls: [{ ord: 0, qfmt: CLOZE_Q, afmt: CLOZE_A }] },
  };
  const decks = { 1: { id: 1, name: 'Default' }, 10: { id: 10, name: 'Geography' }, 20: { id: 20, name: 'Science::Biology' } };
  d.run('insert into col values (1,?,0,0,11,0,0,0,?,?,?,?,?)', [CRT, '{}', JSON.stringify(models), JSON.stringify(decks), '{}', '{}']);
  createCommonTables(d, false);
  const zip = new JSZip();
  zip.file('collection.anki2', d.export());
  zip.file('media', JSON.stringify({ 0: 'paris.png', 1: 'sound.mp3' }));
  zip.file('0', PNG);
  zip.file('1', new Uint8Array([1, 2, 3]));
  d.close();
  return zip.generateAsync({ type: 'uint8array' });
}

async function buildAnki21bApkg(): Promise<Uint8Array> {
  const d = new SQL.Database();
  d.run(`create table col (id integer primary key, crt integer, mod integer, scm integer, ver integer, dty integer, usn integer, ls integer, conf text, models text, decks text, dconf text, tags text)`);
  d.run('insert into col values (1,?,0,0,18,0,0,0,?,?,?,?,?)', [CRT, '', '', '', '', '']);
  d.run('create table decks (id integer primary key, name text, mtime_secs integer, usn integer, common blob, kind blob)');
  d.run('insert into decks values (1, ?, 0, 0, null, null)', ['Default']);
  d.run('insert into decks values (10, ?, 0, 0, null, null)', ['Geography']);
  d.run('insert into decks values (20, ?, 0, 0, null, null)', ['Science\x1fBiology']);
  d.run('create table notetypes (id integer primary key, name text, mtime_secs integer, usn integer, config blob)');
  d.run('insert into notetypes values (100, ?, 0, 0, ?)', ['Basic (and reversed)', new Uint8Array(pbVarint(1, 0))]);
  d.run('insert into notetypes values (200, ?, 0, 0, ?)', ['Cloze', new Uint8Array(pbVarint(1, 1))]);
  d.run('create table fields (ntid integer, ord integer, name text, config blob)');
  for (const [nt, ord, name] of [[100, 0, 'Front'], [100, 1, 'Back'], [200, 0, 'Text'], [200, 1, 'Extra']] as const) d.run('insert into fields values (?,?,?,null)', [nt, ord, name]);
  d.run('create table templates (ntid integer, ord integer, name text, mtime_secs integer, usn integer, config blob)');
  const tmpl = (q: string, a: string) => new Uint8Array([...pbStr(1, q), ...pbStr(2, a)]);
  d.run('insert into templates values (100,0,?,0,0,?)', ['Card 1', tmpl(BASIC_Q, BASIC_A)]);
  d.run('insert into templates values (100,1,?,0,0,?)', ['Card 2', tmpl(REV_Q, REV_A)]);
  d.run('insert into templates values (200,0,?,0,0,?)', ['Cloze', tmpl(CLOZE_Q, CLOZE_A)]);
  createCommonTables(d, true);

  const zip = new JSZip();
  zip.file('collection.anki21b', zstd(d.export()));
  zip.file('collection.anki2', new Uint8Array([0])); // dummy "please update" collection
  const entry = (name: string, size: number) => pbBytes(1, [...pbStr(1, name), ...pbVarint(2, size)]);
  zip.file('media', zstd(new Uint8Array([...entry('paris.png', PNG.length), ...entry('clip.mp3', 3)])));
  zip.file('0', zstd(PNG));
  zip.file('1', zstd(new Uint8Array([1, 2, 3])));
  d.close();
  return zip.generateAsync({ type: 'uint8array' });
}

describe.each([
  ['legacy collection.anki2', buildLegacyApkg, 'anki2'],
  ['zstd collection.anki21b', buildAnki21bApkg, 'anki21b'],
] as const)('parseApkg: %s', (_label, build, format) => {
  it('reads decks, notes, templates, scheduling, history and media', async () => {
    const p = await parseApkg(await build(), SQL, NOW);
    expect(p.format).toBe(format);
    expect(p.decks.map((d) => d.name).sort()).toEqual(['Default', 'Geography', 'Science::Biology']);
    expect(p.cards).toHaveLength(4);
    const byId = new Map(p.cards.map((c) => [c.ankiId, c]));

    // basic forward card: sanitized html, answer part only on back
    const fwd = byId.get(11)!;
    expect(fwd.front).toContain('<b>France</b>');
    expect(fwd.front).not.toContain('script');
    expect(fwd.front).not.toContain('alert');
    expect(fwd.back).toContain('Paris');
    expect(fwd.back).toContain('data-media="paris.png"');
    expect(fwd.back).not.toContain('onerror');
    expect(fwd.back).not.toContain('France');

    // reversed card uses template 2
    const rev = byId.get(12)!;
    expect(rev.front).toContain('Paris');
    expect(rev.back).toContain('France');
    expect(rev.sched.state).toBe(State.New);

    // cloze
    const c1 = byId.get(21)!;
    expect(c1.front).toContain('[...]');
    expect(c1.front).toContain('powerhouse');
    expect(c1.back).toContain('mitochondria');
    const c2 = byId.get(22)!;
    expect(c2.front).toContain('[role]');
    expect(c2.front).toContain('mitochondria');
    expect(c2.suspended).toBe(1);
    expect(c2.sched.lapses).toBe(4);

    // review card keeps Anki's due date and interval, with FSRS memory state from history
    expect(fwd.sched.state).toBe(State.Review);
    expect(fwd.sched.due).toBe(CRT * 1000 + dueDays * DAY);
    expect(fwd.sched.scheduled_days).toBe(19);
    expect(fwd.sched.reps).toBe(3);
    expect(fwd.sched.stability).toBeGreaterThan(0);
    expect(fwd.sched.last_review).toBe(REV3);
    expect(fwd.history).toHaveLength(3); // manual entry dropped
    expect(fwd.history.map((h) => h.review)).toEqual([REV1, REV2, REV3]);
    expect(fwd.history.every((h) => h.source === 'anki')).toBe(true);
    if (format === 'anki21b') {
      expect(fwd.sched.stability).toBe(21.5); // Anki's own FSRS state from cards.data
      expect(fwd.sched.difficulty).toBe(4.2);
    }

    // new cards keep Anki's order
    expect(c1.sched.due).toBeLessThan(rev.sched.due);

    // only images are imported
    expect([...p.media.keys()]).toEqual(['paris.png']);
    expect([...p.media.get('paris.png')!]).toEqual([...PNG]);
  });
});

describe('importApkg into IndexedDB', () => {
  it('creates decks, cards, logs and media, and skips duplicates on re-import', async () => {
    const bytes = await buildAnki21bApkg();
    const s = await importApkg(bytes.slice().buffer, SQL, NOW);
    expect(s).toMatchObject({ cards: 4, skipped: 0, media: 1, reviews: 3, decks: 2 });
    const decks = (await db.decks.toArray()).map((d) => d.name).sort();
    expect(decks).toEqual(['Geography', 'Science::Biology']);
    const card = await db.cards.where('ankiId').equals(11).first();
    expect(card!.due).toBe(CRT * 1000 + dueDays * DAY);
    expect(card!.effect).toBeTruthy();
    expect(card!.tierSeen).toBe(1); // imported at its current tier: no retroactive tier-up
    expect(await db.logs.where('cardId').equals(card!.id!).count()).toBe(3);
    expect(await db.media.get('paris.png')).toBeTruthy();

    const again = await importApkg(bytes.slice().buffer, SQL, NOW);
    expect(again.cards).toBe(0);
    expect(again.skipped).toBe(4);
    expect(await db.cards.count()).toBe(4);
  });
});

describe('CSV / TSV import', () => {
  it('parses quoted CSV, TSV and skips header rows', () => {
    expect(csvToNotes('front,back\n"Hello, world","Bonjour ""le"" monde"\nb,c\n')).toEqual([
      { front: 'Hello, world', back: 'Bonjour "le" monde' },
      { front: 'b', back: 'c' },
    ]);
    expect(csvToNotes('#separator:tab\nuno\tone\ndos\ttwo')).toEqual([
      { front: 'uno', back: 'one' },
      { front: 'dos', back: 'two' },
    ]);
    expect(csvToNotes('"multi\nline",x')).toEqual([{ front: 'multi\nline', back: 'x' }]);
  });

  it('imports rows as new cards', async () => {
    const deckId = (await db.decks.add({ name: 'CSV', created: NOW })) as number;
    const s = await importCsv('a,b\n<b>c</b><script>x</script>,d\n1 < 2,yes', deckId, NOW);
    expect(s.cards).toBe(3);
    const cards = await db.cards.where('deckId').equals(deckId).sortBy('due');
    expect(cards[1].front).toBe('<b>c</b>');
    expect(cards[2].front).toBe('1 &lt; 2');
    expect(cards.every((c) => c.state === State.New)).toBe(true);
  });
});

describe('sanitizeHtml', () => {
  it('keeps basic formatting and strips anything dangerous', () => {
    const out = sanitizeHtml('<div onclick="x()"><i>hi</i> <a href="javascript:x">link</a><style>b{}</style><img src="https://evil/x.png"><img src="ok.jpg"></div>[sound:a.mp3]');
    expect(out).toBe('<div><i>hi</i> link<img data-media="ok.jpg" alt=""></div>');
  });
});
