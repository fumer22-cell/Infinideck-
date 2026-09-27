import { useEffect, useState } from 'react';
import { MILESTONES } from '../../core/profile';
import { ALL_META, META } from '../../game/meta';
import { countMature } from '../actions';
import { Sprite, TopBar } from '../common';
import { useApp } from '../context';
import { sfx } from '../sfx';

export function Armoury() {
  const app = useApp();
  const { profile } = app;
  const [mature, setMature] = useState(0);
  useEffect(() => {
    void countMature().then(setMature);
  }, []);

  const buy = async (id: (typeof ALL_META)[number]) => {
    const lvl = profile.meta[id] ?? 0;
    const cost = META[id].cost(lvl);
    if (profile.gold < cost || lvl >= META[id].max) return;
    await app.updateProfile((p) => {
      p.gold -= cost;
      p.meta[id] = lvl + 1;
    });
    sfx.coin();
    app.toast(`${META[id].name} upgraded.`);
  };

  const claim = async (count: number, gold: number) => {
    await app.updateProfile((p) => {
      p.gold += gold;
      p.milestonesClaimed.push(count);
    });
    sfx.victory();
    app.toast(`Milestone reward: +${gold} gold!`);
  };

  return (
    <>
      <TopBar title="Armoury" right={<span className="pill"><Sprite name="coin" size={16} /> {profile.gold}</span>} />
      <div className="screen">
        <h3>Permanent upgrades</h3>
        <div className="list">
          {ALL_META.map((id) => {
            const m = META[id];
            const lvl = profile.meta[id] ?? 0;
            const maxed = lvl >= m.max;
            const cost = m.cost(lvl);
            return (
              <div key={id} className="list-item">
                <div className="name">
                  <div>{m.name} <span className="small muted">{lvl}/{m.max}</span></div>
                  <div className="small muted">{lvl ? m.desc(lvl) : 'Not learned'}{!maxed && ` → ${m.desc(lvl + 1)}`}</div>
                </div>
                <button className="btn small" disabled={maxed || profile.gold < cost} onClick={() => buy(id)}>
                  {maxed ? 'Max' : `${cost}g`}
                </button>
              </div>
            );
          })}
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
      </div>
    </>
  );
}
