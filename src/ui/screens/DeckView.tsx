import { useEffect, useMemo, useState } from 'react';
import { db } from '../../core/db';
import { countDue, formatInterval, isLeech, State, TIER_NAMES, tierOf } from '../../core/srs';
import type { CardRow, Deck } from '../../core/types';
import { EFFECTS } from '../../game/effects';
import { stripHtml } from '../../import/html';
import { EmptyState, Sprite, TopBar } from '../common';
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
      <TopBar title={deck.name} right={!renaming && <button className="btn small plain" onClick={() => setRenaming(true)}>Rename</button>} />
      <div className="screen">
        {renaming && (
          <div className="row">
            <input id="deck-name" type="text" value={newName} onChange={(e) => setNewName(e.target.value)} aria-label="Deck name" />
            <button className="btn small primary" onClick={rename}>Save</button>
          </div>
        )}
        <div className="stone gilded col">
          <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <div className="stat"><b className="num">{cards.length}</b><span>CARDS</span></div>
            <div className="stat"><b className="num">{due}</b><span>DUE NOW</span></div>
            <div className="stat"><b className="num">{cards.filter((c) => c.state === State.Review && c.scheduled_days >= 21).length}</b><span>MATURE</span></div>
          </div>
          <div className="grid2">
            <button className="btn primary" disabled={!due} onClick={() => go({ name: 'study' })}>Study</button>
            <button className="btn green" onClick={() => go({ name: 'editCard', deckId })}>+ Add card</button>
          </div>
          <button className="btn stone small block" onClick={() => go({ name: 'import', deckId })}>Import cards into this deck</button>
        </div>
        <input id="card-search" type="text" placeholder="Search cards…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search cards" />
        <div className="list">
          {filtered.map((c) => {
            const tier = tierOf(c);
            const status = c.suspended ? 'suspended' : c.state === State.New ? 'new' : c.due <= now ? 'due' : `in ${formatInterval(c.due - now)}`;
            return (
              <button key={c.id} className="list-item" onClick={() => go({ name: 'editCard', deckId, cardId: c.id })}>
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
          {cards.length > filtered.length && !q && <div className="small muted center">Showing the first 300. Search to find more.</div>}
          {!cards.length && <EmptyState icon="book" title="No cards yet">Add your first card, or import some from Anki.</EmptyState>}
        </div>
        <button className="btn danger-link" onClick={remove}>Delete this deck</button>
      </div>
    </>
  );
}
