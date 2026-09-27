import { useEffect, useState } from 'react';
import { db } from '../../core/db';
import type { Deck } from '../../core/types';
import type { ImportSummary } from '../../import/importer';
import { TopBar } from '../common';
import { useApp } from '../context';

export function ImportScreen({ deckId }: { deckId?: number }) {
  const { toast } = useApp();
  const [decks, setDecks] = useState<Deck[]>([]);
  const [target, setTarget] = useState<string>(deckId != null ? String(deckId) : 'new');
  const [newName, setNewName] = useState('Imported');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void db.decks.orderBy('name').toArray().then(setDecks);
  }, []);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const { importApkg, importCsv } = await import('../../import/importer');
      if (/\.(apkg|colpkg)$/i.test(f.name)) {
        setResult(await importApkg(await f.arrayBuffer()));
      } else {
        let id = Number(target);
        if (target === 'new') id = (await db.decks.add({ name: newName.trim() || f.name.replace(/\.\w+$/, ''), created: Date.now() })) as number;
        setResult(await importCsv(await f.text(), id));
      }
      toast('Import complete.');
      setDecks(await db.decks.orderBy('name').toArray());
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <TopBar title="Import" />
      <div className="screen">
        <div className="stone col">
          <h3>Anki package (.apkg)</h3>
          <div className="serif muted" style={{ fontSize: 15 }}>
            Decks, notes, images and review history are imported. Supports old (.anki2/.anki21) and new zstd (.anki21b) packages. Existing due dates are kept.
          </div>
          <label className="btn block" style={{ color: 'var(--gold-hi)', fontSize: 14 }}>
            {busy ? 'Deciphering…' : 'Choose .apkg file'}
            <input type="file" accept=".apkg,.colpkg" hidden disabled={busy} onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
        </div>
        <div className="stone col">
          <h3>CSV / TSV (front, back)</h3>
          <label htmlFor="target">Into deck</label>
          <select id="target" value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="new">+ New deck…</option>
            {decks.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          {target === 'new' && <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Deck name" />}
          <label className="btn block" style={{ color: 'var(--gold-hi)', fontSize: 14 }}>
            {busy ? 'Reading…' : 'Choose .csv / .tsv / .txt'}
            <input type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain" hidden disabled={busy} onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
        </div>
        {result && (
          <div className="leather">
            <h3>Import complete</h3>
            <div className="small" style={{ marginTop: 6 }}>
              {result.cards} cards added{result.skipped ? `, ${result.skipped} duplicates skipped` : ''}
              {result.decks ? ` · ${result.decks} decks` : ''}
              {result.media ? ` · ${result.media} images` : ''}
              {result.reviews ? ` · ${result.reviews} past reviews` : ''}
            </div>
          </div>
        )}
        {error && <div className="leather red small">Import failed: {error}</div>}
      </div>
    </>
  );
}
