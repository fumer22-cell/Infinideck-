import { useEffect, useState } from 'react';
import { db } from '../../core/db';
import { countDue } from '../../core/srs';
import type { Deck } from '../../core/types';
import { TopBar } from '../common';
import { useApp } from '../context';

type Row = Deck & { counts: { new: number; learning: number; review: number }; total: number };

export function Decks() {
  const { go, settings } = useApp();
  const [decks, setDecks] = useState<Row[] | null>(null);
  const [name, setName] = useState('');

  const load = async () => {
    const all = await db.decks.orderBy('name').toArray();
    const now = Date.now();
    setDecks(
      await Promise.all(
        all.map(async (d) => ({ ...d, counts: await countDue(now, settings, [d.id!]), total: await db.cards.where('deckId').equals(d.id!).count() })),
      ),
    );
  };
  useEffect(() => {
    void load();
  }, []);

  const create = async () => {
    const n = name.trim();
    if (!n) return;
    const id = (await db.decks.add({ name: n, created: Date.now() })) as number;
    setName('');
    go({ name: 'deck', deckId: id });
  };

  return (
    <>
      <TopBar title="Decks" />
      <div className="screen">
        <div className="stone col">
          <label htmlFor="newdeck">New deck</label>
          <div className="row">
            <input id="newdeck" type="text" value={name} placeholder="e.g. Latin verbs" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} />
            <button className="btn small" onClick={create} disabled={!name.trim()}>Create</button>
          </div>
          <button className="btn stone block" onClick={() => go({ name: 'import' })}>Import Anki / CSV…</button>
        </div>
        <div className="list">
          {decks?.length === 0 && <div className="muted center serif">No decks yet.</div>}
          {decks?.map((d) => (
            <button key={d.id} className="list-item" style={{ textAlign: 'left', color: 'inherit', fontFamily: 'inherit' }} onClick={() => go({ name: 'deck', deckId: d.id! })}>
              <div className="name">
                <div>{d.name}</div>
                <div className="small muted">{d.total} cards</div>
              </div>
              <div className="counts">
                <span className="n">{d.counts.new}</span>
                <span className="l">{d.counts.learning}</span>
                <span className="r">{d.counts.review}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
