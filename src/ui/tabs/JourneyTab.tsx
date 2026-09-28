import { useEffect, useState } from 'react';
import { db } from '../../core/db';
import { chestGold, MILESTONES } from '../../core/profile';
import { countDue, dayStart } from '../../core/srs';
import { combatLevel, SKILLS, totalLevel } from '../../game/skills';
import { countMature } from '../actions';
import { CloudBadge } from '../CloudGate';
import { COLLECTION, ITEMS } from '../../game/items';
import { GoldPill, ItemIcon, NavRow, PageHeader, SectionTitle, Sprite, XpBar } from '../common';
import { useApp } from '../context';
import { HeroView } from '../HeroView';
import { heroLook } from '../heroLook';
import { sfx } from '../sfx';

export function JourneyTab() {
  const app = useApp();
  const { profile, lv, world, settings, go } = app;
  const [mature, setMature] = useState(0);
  const [cards, setCards] = useState(0);
  const [doneToday, setDoneToday] = useState(0);
  const [due, setDue] = useState<{ new: number; learning: number; review: number; total: number } | null>(null);
  useEffect(() => {
    void countMature().then(setMature);
    void db.cards.count().then(setCards);
    void countDue(Date.now(), settings).then(setDue);
    void db.logs
      .where('review')
      .aboveOrEqual(dayStart(Date.now(), settings.dayStartHour))
      .filter((l) => l.source === 'app')
      .count()
      .then(setDoneToday);
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
  const todayTotal = doneToday + (due?.total ?? 0);

  return (
    <div className="screen">
      <PageHeader title="Journey" sub={title ?? 'An unremarkable adventurer'} right={<GoldPill amount={profile.gold} />} />

      <div className="stone gilded profile-card">
        <HeroView look={heroLook(world, lv, 'sword')} size={78} label="Your character" />
        <div>
          <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
            <span className="pill"><Sprite name="flame" size={14} /> {profile.streak.count} day streak</span>
            <CloudBadge />
          </div>
          <div className="levels">
            <div><b className="num">{totalLevel(lv)}</b><span>TOTAL LEVEL</span></div>
            <div><b className="num">{combatLevel(lv)}</b><span>COMBAT</span></div>
            <div><b className="num">{mature}</b><span>MATURE CARDS</span></div>
          </div>
        </div>
      </div>

      {due && (
        <div className="stone today">
          <div className="row">
            <h2 className="grow">Today</h2>
            <div className="counts num">
              <span className="n">{due.new} new</span>
              <span className="l">{due.learning} learn</span>
              <span className="r">{due.review} due</span>
            </div>
          </div>
          <XpBar into={doneToday} span={Math.max(1, todayTotal)} tone="green" />
          <div className="row">
            <span className="small muted grow num">{due.total ? `${doneToday} of ${todayTotal} reviews done` : doneToday ? `All ${doneToday} reviews done. Well fought.` : 'Nothing due today.'}</span>
            <button className="btn small primary" onClick={() => go({ name: 'study' })}>{due.total ? 'Study' : 'Practice'}</button>
          </div>
        </div>
      )}

      {profile.chestPending && (
        <button className="stone chest-card" onClick={openChest} style={{ color: 'inherit', textAlign: 'left' }}>
          <Sprite name="chest" size={40} className="bob" />
          <div className="grow">
            <h2>Streak chest</h2>
            <div className="desc small">You cleared your queue. Open it for {chestGold(profile.streak.count)} gold.</div>
          </div>
          <span className="btn small green">Open</span>
        </button>
      )}

      <nav className="nav-list" aria-label="Library">
        <NavRow icon="book" title="Decks" sub={`${cards} cards`} onClick={() => go({ name: 'decks' })} />
        <NavRow icon="chest" title="Import" sub="Anki .apkg, CSV or TSV" onClick={() => go({ name: 'import' })} />
        <NavRow icon="gem" title="Settings" sub="Scheduling, sound, backups" onClick={() => go({ name: 'settings' })} />
      </nav>

      <SectionTitle note={`${mature} mature cards`}>Milestones</SectionTitle>
      <div className="list">
        {MILESTONES.map((m) => {
          const claimed = profile.milestonesClaimed.includes(m.count);
          const ready = mature >= m.count && !claimed;
          return (
            <div key={m.count} className={`list-item milestone ${ready ? 'on' : ''}`}>
              <Sprite name={claimed ? 'star' : 'chest'} size={26} />
              <div className="name">
                <div>{m.count} mature cards</div>
                <div className="small muted">“{m.title}” · {m.reward}</div>
                {!claimed && <XpBar into={Math.min(mature, m.count)} span={m.count} tone="gold" />}
              </div>
              {claimed ? (
                <span className="small green">Claimed</span>
              ) : (
                <button className="btn small green" disabled={!ready} onClick={() => claim(m.count, m.gold)}>{ready ? 'Claim' : `${Math.min(mature, m.count)}/${m.count}`}</button>
              )}
            </div>
          );
        })}
      </div>

      <SectionTitle>Levels</SectionTitle>
      <div className="level-grid">
        {SKILLS.map((s) => (
          <button key={s.id} className="level-cell" onClick={() => go({ name: 'skill', skill: s.id })} aria-label={`${s.name} level ${lv[s.id]}`}>
            <Sprite name={s.icon} size={18} /> <span className="num">{lv[s.id]}</span>
          </button>
        ))}
      </div>

      <SectionTitle note={`${COLLECTION.filter((id) => world.collection?.[id]).length} / ${COLLECTION.length}`}>Collection log</SectionTitle>
      <div className="collection">
        {COLLECTION.map((id) => {
          const found = world.collection?.[id];
          return (
            <div key={id} className={`slot ${found ? 'found' : 'missing'}`} title={found ? `${ITEMS[id].name}: found ${new Date(found).toLocaleDateString()}` : 'Not found yet'} aria-label={found ? ITEMS[id].name : 'Not found yet'}>
              <ItemIcon id={id} size={30} />
            </div>
          );
        })}
      </div>
      <div className="desc small">Rare finds, legendaries and pets only turn up on right answers. Streaks, Easy answers, verified answers and mature cards all improve the odds.</div>

      <SectionTitle>Records</SectionTitle>
      <div className="stat-grid">
        <div className="stat"><b>{profile.stats.reviews.toLocaleString()}</b><span>REVIEWS</span></div>
        <div className="stat"><b>{world.stats.actions.toLocaleString()}</b><span>ACTIONS</span></div>
        <div className="stat"><b>{world.stats.kills}</b><span>SLAIN</span></div>
        <div className="stat"><b>{world.stats.bossKills}</b><span>BOSSES</span></div>
        <div className="stat"><b>{world.stats.deaths}</b><span>DEATHS</span></div>
        <div className="stat"><b>{profile.streak.best}</b><span>BEST DAYS</span></div>
        <div className="stat"><b>{world.bestChain ?? 0}</b><span>BEST STREAK</span></div>
        <div className="stat"><b>{totalLevel(lv)}</b><span>TOTAL LVL</span></div>
      </div>
    </div>
  );
}
