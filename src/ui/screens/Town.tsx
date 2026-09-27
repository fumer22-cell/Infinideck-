import { useEffect, useState } from 'react';
import { backgroundUrl } from '../../art/backgrounds';
import { kvGet } from '../../core/db';
import { chestGold, MILESTONES } from '../../core/profile';
import { countDue } from '../../core/srs';
import { db } from '../../core/db';
import { levels } from '../../game/skills';
import { countMature } from '../actions';
import { Sprite } from '../common';
import { useApp } from '../context';
import { sfx } from '../sfx';

export function Town() {
  const app = useApp();
  const { profile, settings, go } = app;
  const [due, setDue] = useState<{ new: number; learning: number; review: number; total: number } | null>(null);
  const [hasRun, setHasRun] = useState(false);
  const [matureCount, setMatureCount] = useState(0);
  const [cardCount, setCardCount] = useState(0);

  useEffect(() => {
    void (async () => {
      setDue(await countDue(Date.now(), settings));
      setHasRun(!!(await kvGet('run', null)));
      setMatureCount(await countMature());
      setCardCount(await db.cards.count());
    })();
  }, [settings]);

  const lv = levels(profile.xp);
  const total = lv.attack + lv.defence + lv.hitpoints + lv.scholarship;
  const claimable = MILESTONES.filter((m) => matureCount >= m.count && !profile.milestonesClaimed.includes(m.count)).length;

  const openChest = async () => {
    const gold = chestGold(profile.streak.count);
    await app.updateProfile((p) => {
      p.gold += gold;
      p.chestPending = null;
    });
    sfx.coin();
    app.toast(`The streak chest creaks open: +${gold} gold!`);
  };

  const endlessOk = matureCount > 0;

  return (
    <div className="screen" style={{ backgroundImage: `linear-gradient(180deg, rgba(21,17,15,0.3), rgba(21,17,15,0.95) 45%), url(${backgroundUrl('keep')})`, backgroundSize: 'cover', imageRendering: 'pixelated' }}>
      <div style={{ height: 8 }} />
      <div className="title-logo">GRIMRECALL</div>
      <div className="subtitle">Remember, or perish.</div>
      <div className="town-hero">
        <Sprite name="tomb" size={72} />
        <Sprite name="warrior" size={96} />
        <Sprite name="tomb" size={72} />
      </div>
      <div className="stat-pills">
        <span className="pill"><Sprite name="coin" size={16} /> {profile.gold}</span>
        <span className="pill"><Sprite name="flame" size={16} /> {profile.streak.count} day streak</span>
        <span className="pill"><Sprite name="star" size={16} /> Total lvl {total}</span>
      </div>

      {profile.chestPending && (
        <button className="btn block green" onClick={openChest}>
          <Sprite name="chest" size={24} /> Open streak chest ({chestGold(profile.streak.count)}g)
        </button>
      )}

      <div className="stone col">
        {due && due.total > 0 ? (
          <>
            <div className="row">
              <h3 className="grow">Today's dungeon</h3>
              <div className="counts">
                <span className="n">{due.new} new</span>
                <span className="l">{due.learning} learn</span>
                <span className="r">{due.review} due</span>
              </div>
            </div>
            <button className="btn big red block" onClick={() => { sfx.tap(); go(hasRun ? { name: 'run' } : { name: 'classSelect', mode: 'dungeon' }); }}>
              <Sprite name="sword" size={24} /> {hasRun ? 'Resume the Delve' : 'Enter the Dungeon'}
            </button>
          </>
        ) : (
          <>
            <h3>{cardCount === 0 ? 'Your grimoire is empty' : 'The dungeon lies quiet'}</h3>
            <div className="serif muted" style={{ fontSize: 15 }}>
              {cardCount === 0 ? 'Create a deck or import from Anki to begin your first delve.' : 'Nothing is due. Rest, or brave the Endless Depths with your mature cards.'}
            </div>
            {hasRun ? (
              <button className="btn big red block" onClick={() => go({ name: 'run' })}>Resume the Delve</button>
            ) : (
              <button className="btn big block" disabled={!endlessOk} onClick={() => go({ name: 'classSelect', mode: 'endless' })}>
                <Sprite name="skull" size={24} /> Endless Depths
              </button>
            )}
            {!endlessOk && cardCount > 0 && <div className="small muted center">Endless mode unlocks with your first Mature card (21+ day interval).</div>}
          </>
        )}
      </div>

      <div className="menu-grid">
        <button className="btn" onClick={() => go({ name: 'decks' })}><Sprite name="book" size={20} /> Decks</button>
        <button className="btn" onClick={() => go({ name: 'study' })} disabled={!due?.total}><Sprite name="eye" size={20} /> Study</button>
        <button className="btn" onClick={() => go({ name: 'skills' })}><Sprite name="star" size={20} /> Skills</button>
        <button className="btn" onClick={() => go({ name: 'armoury' })}>
          <Sprite name="shield" size={20} /> Armoury{claimable ? ' !' : ''}
        </button>
        <button className="btn" onClick={() => go({ name: 'import' })}><Sprite name="chest" size={20} /> Import</button>
        <button className="btn" onClick={() => go({ name: 'settings' })}><Sprite name="gem" size={20} /> Settings</button>
      </div>
      <div className="small muted center">{cardCount} cards · {matureCount} mature · best streak {profile.streak.best}</div>
    </div>
  );
}
