import { useEffect, useState } from 'react';
import { chestGold, MILESTONES } from '../../core/profile';
import { countDue } from '../../core/srs';
import { combatLevel, SKILLS, totalLevel } from '../../game/skills';
import { countMature } from '../actions';
import { CloudBadge } from '../CloudGate';
import { Sprite } from '../common';
import { useApp } from '../context';
import { sfx } from '../sfx';

export function JourneyTab() {
  const app = useApp();
  const { profile, lv, world, settings, go } = app;
  const [mature, setMature] = useState(0);
  const [due, setDue] = useState<{ new: number; learning: number; review: number; total: number } | null>(null);
  useEffect(() => {
    void countMature().then(setMature);
    void countDue(Date.now(), settings).then(setDue);
  }, []);

  const openChest = async () => {
    const gold = chestGold(profile.streak.count);
    await app.updateProfile((p) => {
      p.gold += gold;
      p.chestPending = null;
    });
    sfx.coin();
    app.toast(`The streak chest creaks open: +${gold} gold!`);
  };
  const claim = async (count: number, gold: number) => {
    await app.updateProfile((p) => {
      p.gold += gold;
      p.milestonesClaimed.push(count);
    });
    sfx.victory();
    app.toast(`Milestone reward: +${gold} gold!`);
  };
  const title = [...MILESTONES].reverse().find((m) => profile.milestonesClaimed.includes(m.count))?.title;

  return (
    <div className="screen">
      <div className="title-logo" style={{ fontSize: 26 }}>GRIMRECALL</div>
      {title && <div className="subtitle">{title}</div>}
      <div className="stat-pills">
        <span className="pill"><Sprite name="star" size={16} /> Total {totalLevel(lv)}</span>
        <span className="pill"><Sprite name="sword" size={16} /> Combat {combatLevel(lv)}</span>
        <span className="pill"><Sprite name="flame" size={16} /> {profile.streak.count} day streak</span>
        <CloudBadge />
      </div>
      {due && (
        <div className="stone row">
          <div className="grow">
            <h3>Today</h3>
            <div className="counts" style={{ marginTop: 4 }}>
              <span className="n">{due.new} new</span>
              <span className="l">{due.learning} learning</span>
              <span className="r">{due.review} due</span>
            </div>
          </div>
          <button className="btn" onClick={() => go({ name: 'study' })}>Study</button>
        </div>
      )}
      {profile.chestPending && (
        <button className="btn block green" onClick={openChest}>
          <Sprite name="chest" size={24} /> Open streak chest ({chestGold(profile.streak.count)}g)
        </button>
      )}
      <div className="menu-grid">
        <button className="btn" onClick={() => go({ name: 'decks' })}><Sprite name="book" size={20} /> Decks</button>
        <button className="btn" onClick={() => go({ name: 'import' })}><Sprite name="chest" size={20} /> Import</button>
        <button className="btn" onClick={() => go({ name: 'settings' })}><Sprite name="gem" size={20} /> Settings</button>
        <button className="btn" onClick={() => go({ name: 'skills' })}><Sprite name="star" size={20} /> Skills</button>
      </div>

      <h3>Milestones <span className="small muted">({mature} mature cards)</span></h3>
      <div className="list">
        {MILESTONES.map((m) => {
          const claimed = profile.milestonesClaimed.includes(m.count);
          const ready = mature >= m.count && !claimed;
          return (
            <div key={m.count} className="list-item">
              <Sprite name={claimed ? 'star' : 'chest'} size={24} />
              <div className="name">
                <div>{m.count} mature cards</div>
                <div className="small muted">“{m.title}” · {m.reward}</div>
              </div>
              <button className="btn small green" disabled={!ready} onClick={() => claim(m.count, m.gold)}>
                {claimed ? 'Claimed' : ready ? 'Claim' : `${Math.min(mature, m.count)}/${m.count}`}
              </button>
            </div>
          );
        })}
      </div>

      <h3>Levels</h3>
      <div className="level-grid">
        {SKILLS.map((s) => (
          <button key={s.id} className="level-cell" onClick={() => go({ name: 'skill', skill: s.id })}>
            <Sprite name={s.icon} size={18} /> <b>{lv[s.id]}</b>
          </button>
        ))}
      </div>

      <div className="stone grid2 small">
        <span>Reviews</span><span>{profile.stats.reviews.toLocaleString()}</span>
        <span>Actions</span><span>{world.stats.actions.toLocaleString()}</span>
        <span>Monsters slain</span><span>{world.stats.kills}</span>
        <span>Bosses slain</span><span>{world.stats.bossKills}</span>
        <span>Deaths</span><span>{world.stats.deaths}</span>
        <span>Best streak</span><span>{profile.streak.best}</span>
      </div>
    </div>
  );
}
