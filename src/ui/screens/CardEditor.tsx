import { useEffect, useRef, useState } from 'react';
import { db } from '../../core/db';
import { newCardRow, TIER_NAMES, tierOf } from '../../core/srs';
import type { CardRow } from '../../core/types';
import { EFFECTS, rollStartingEffect, TIER_POWER } from '../../game/effects';
import { editorToHtml, htmlToEditable, mimeFor, stripHtml } from '../../import/html';
import { CardFace, Sprite, TopBar } from '../common';
import { useApp } from '../context';

export function CardEditor({ deckId, cardId }: { deckId: number; cardId?: number }) {
  const { back, toast, ask } = useApp();
  const [card, setCard] = useState<CardRow | null>(null);
  const [front, setFront] = useState('');
  const [backText, setBackText] = useState('');
  const [image, setImage] = useState<string | undefined>();
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (cardId == null) return;
    void db.cards.get(cardId).then((c) => {
      if (!c) return;
      setCard(c);
      setFront(htmlToEditable(c.front));
      setBackText(htmlToEditable(c.back));
      setImage(c.image);
    });
  }, [cardId]);

  const pickImage = async (f: File | undefined) => {
    if (!f) return;
    const ext = (f.name.split('.').pop() || 'png').toLowerCase();
    const name = `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    await db.media.put({ name, blob: new Blob([await f.arrayBuffer()], { type: f.type || mimeFor(name) }) });
    setImage(name);
  };

  const save = async (addAnother: boolean) => {
    const f = editorToHtml(front);
    const b = editorToHtml(backText);
    if (!stripHtml(f) && !image && !f.includes('<img')) {
      toast('The front needs some text or an image.');
      return;
    }
    setSaving(true);
    try {
      await persist(f, b, addAnother);
    } finally {
      setSaving(false);
    }
  };

  const persist = async (f: string, b: string, addAnother: boolean) => {
    if (card) {
      // edits change content only; scheduling is untouched
      await db.cards.update(card.id!, { front: f, back: b, image });
      toast('Card saved.');
      back();
    } else {
      await db.cards.add({ ...newCardRow(deckId, f, b, rollStartingEffect()), image });
      toast('Card added.');
      if (addAnother) {
        setFront('');
        setBackText('');
        setImage(undefined);
      } else back();
    }
  };

  const remove = async () => {
    if (!card || !(await ask('Delete this card and its review history?', 'Delete card'))) return;
    await db.transaction('rw', db.cards, db.logs, async () => {
      await db.logs.where('cardId').equals(card.id!).delete();
      await db.cards.delete(card.id!);
    });
    toast('Card deleted.');
    back();
  };

  const toggleSuspend = async () => {
    if (!card) return;
    const suspended = card.suspended ? 0 : 1;
    await db.cards.update(card.id!, { suspended });
    setCard({ ...card, suspended });
  };

  const tier = card ? tierOf(card) : 0;
  return (
    <>
      <TopBar title={card ? 'Edit card' : 'New card'} right={<button className="btn small stone" onClick={() => setPreview((p) => !p)}>{preview ? 'Edit' : 'Preview'}</button>} />
      <div className="screen">
        {preview ? (
          <CardFace front={editorToHtml(front)} back={editorToHtml(backText)} image={image} revealed />
        ) : (
          <div className="stone col">
            <div>
              <label htmlFor="front">Front</label>
              <textarea id="front" value={front} onChange={(e) => setFront(e.target.value)} placeholder="Question" />
            </div>
            <div>
              <label htmlFor="back">Back</label>
              <textarea id="back" value={backText} onChange={(e) => setBackText(e.target.value)} placeholder="Answer" />
            </div>
            <div className="small muted">Basic formatting allowed: &lt;b&gt; &lt;i&gt; &lt;u&gt; &lt;sub&gt; &lt;sup&gt;</div>
            <div className="row wrap">
              <button className="btn small stone" onClick={() => fileRef.current?.click()}>{image ? 'Change image' : 'Add image'}</button>
              {image && <button className="btn small stone" onClick={() => setImage(undefined)}>Remove image</button>}
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => pickImage(e.target.files?.[0])} />
            </div>
          </div>
        )}
        {card && (
          <div className="leather row">
            <Sprite name={EFFECTS[card.effect].icon} size={32} />
            <div className="grow small">
              <div className="gold">{EFFECTS[card.effect].name} · {TIER_NAMES[tier]}</div>
              <div>{EFFECTS[card.effect].desc(TIER_POWER[tier])}</div>
              <div className="muted">Reps {card.reps} · Lapses {card.lapses} · Interval {card.scheduled_days}d</div>
            </div>
          </div>
        )}
        <div className="grid2">
          <button className="btn green" disabled={saving} onClick={() => save(false)}>Save</button>
          {!card && <button className="btn" disabled={saving} onClick={() => save(true)}>Save + next</button>}
          {card && <button className="btn stone" onClick={toggleSuspend}>{card.suspended ? 'Unsuspend' : 'Suspend'}</button>}
          {card && <button className="btn red" onClick={remove}>Delete</button>}
        </div>
      </div>
    </>
  );
}
