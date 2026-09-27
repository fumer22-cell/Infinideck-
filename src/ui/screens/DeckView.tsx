import { useEffect, useMemo, useState } from 'react';
import { db } from '../../core/db';
import { countDue, formatInterval, isLeech, State, TIER_NAMES, tierOf } from '../../core/srs';
import type { CardRow, Deck } from '../../core/types';
import { EFFECTS } from '../../game/effects';
import { stripHtml } from '../../import/html';
import { Sprite, TopBar } from '../common';
import { useApp } from '../context';

export function DeckView({ deckId }: { deckId: number }) {
  const { go, back, settings, toast, ask } = useApp();
  const [deck, setDeck] = useState<Deck | null>(null);
  const [cards, setCards] = useState<CardRow[]>([]);
  const [q, setQ] = useState('');
  const [due, setDue] = useState(0);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState('');

  useEffect(() => {
    void (async () => {
      const d = await db.decks.get(deckId);
      setDeck(d ?? null);
      setNewName(d?.name ?? '');
      setCards(await db.cards.where('deckId').equals(deckId).toArray());
      setDue((await countDue(Date.now(), settings, [deckId])).total);
    })();
  }, [deckId, settings]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = needle ? cards.filter((c) => stripHtml(c.front + ' ' + c.back).toLowerCase().includes(needle)) : cards;
    return list.slice(0, 300);
  }, [cards, q]);

  if (!deck) return <TopBar title="…" />;

  const rename = async () => {
    if (!newName.trim()) return;
    await db.decks.update(deckId, { name: newName.trim() });
    setDeck({ ...deck, name: newName.trim() });
    setRenaming(false);
  };

  const remove = async () => {
    if (!(await ask(`Delete "${deck.name}" and all ${cards.length} cards? This cannot be undone.`, 'Delete deck'))) return;
    const ids = cards.map((c) => c.id!);
    await db.transaction('rw', db.cards, db.logs, db.decks, async () => {
      await db.logs.where('cardId').anyOf(ids).delete();
      await db.cards.bulkDelete(ids);
      await db.decks.delete(deckId);
    });
    toast('Deck deleted.');
    back();
  };

  const now = Date.now();
  return (
    <>
      <TopBar title={deck.name} />
      <div className="screen">
        <div className="stone col">
          {renaming ? (
            <div className="row">
              <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} />
              <button className="btn small" onClick={rename}>Save</button>
            </div>
          ) : (
            <div className="row">
              <div className="grow small muted">{cards.length} cards · {due} due now</div>
              <button className="btn small stone" onClick={() => setRenaming(true)}>Rename</button>
            </div>
          )}
          <div className="grid2">
            <button className="btn green" onClick={() => go({ name: 'editCard', deckId })}>+ Add card</button>
            <button className="btn" disabled={!due} onClick={() => go({ name: 'study', deckId })}>Study ({due})</button>
            <button className="btn stone" onClick={() => go({ name: 'import', deckId })}>Import</button>
            <button className="btn red" onClick={remove}>Delete</button>
          </div>
        </div>
        <input type="text" placeholder="Search cards…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="list">
          {filtered.map((c) => {
            const tier = tierOf(c);
            const status = c.suspended ? 'suspended' : c.state === State.New ? 'new' : c.due <= now ? 'due' : `in ${formatInterval(c.due - now)}`;
            return (
              <button key={c.id} className="list-item" style={{ textAlign: 'left', color: 'inherit', fontFamily: 'inherit' }} onClick={() => go({ name: 'editCard', deckId, cardId: c.id })}>
                <Sprite name={EFFECTS[c.effect].icon} size={24} />
                <div className="name">
                  <div className="card-preview">{stripHtml(c.front) || '(image)'}</div>
                  <div className="small muted">
                    {TIER_NAMES[tier]} · {status}
                    {isLeech(c) && <span className="red"> · leech</span>}
                  </div>
                </div>
              </button>
            );
          })}
          {cards.length > filtered.length && !q && <div className="small muted center">Showing first 300 — search to find more.</div>}
        </div>
      </div>
    </>
  );
}
