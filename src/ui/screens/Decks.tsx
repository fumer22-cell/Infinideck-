import { useEffect, useState } from 'react';
import { db } from '../../core/db';
import { countDue } from '../../core/srs';
import type { Deck } from '../../core/types';
import { EmptyState, Sprite, TopBar } from '../common';
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
      <TopBar title="Decks" right={<button className="btn small plain" onClick={() => go({ name: 'import' })}>Import</button>} />
      <div className="screen">
        <div className="stone col">
          <label htmlFor="newdeck">New deck</label>
          <div className="row">
            <input id="newdeck" type="text" value={name} placeholder="e.g. Latin verbs" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} />
            <button className="btn small primary" onClick={create} disabled={!name.trim()}>Create</button>
          </div>
        </div>
        {!!decks?.length && (
          <div className="row small muted" style={{ justifyContent: 'flex-end', gap: 10 }}>
            <span style={{ color: '#7ab8ff' }}>new</span>
            <span style={{ color: '#ff7a60' }}>learning</span>
            <span className="green">due</span>
          </div>
        )}
        <div className="list">
          {decks?.length === 0 && <EmptyState icon="book" title="No decks yet">Create one above, or import an Anki deck.</EmptyState>}
          {decks?.map((d) => (
            <button key={d.id} className="list-item" onClick={() => go({ name: 'deck', deckId: d.id! })}>
              <Sprite name="book" size={24} />
              <div className="name">
                <div>{d.name}</div>
                <div className="small muted num">{d.total} cards</div>
              </div>
              <div className="counts num" aria-label={`${d.counts.new} new, ${d.counts.learning} learning, ${d.counts.review} due`}>
                <span className="n">{d.counts.new}</span>
                <span className="l">{d.counts.learning}</span>
                <span className="r">{d.counts.review}</span>
              </div>
              <span className="chev" aria-hidden>▸</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
