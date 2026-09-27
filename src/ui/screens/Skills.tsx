import { SKILLS, XP_TABLE, levels, xpProgress } from '../../game/skills';
import { Sprite, TopBar } from '../common';
import { useApp } from '../context';

export function Skills() {
  const { profile } = useApp();
  const lv = levels(profile.xp);
  const total = Object.values(lv).reduce((a, b) => a + b, 0);
  return (
    <>
      <TopBar title="Skills" />
      <div className="screen">
        <div className="col">
          {SKILLS.map((s) => {
            const pr = xpProgress(profile.xp[s.id]);
            return (
              <div key={s.id} className="skill-row">
                <Sprite name={s.icon} size={24} />
                <div>
                  <div>{s.name}</div>
                  <div className="small muted">{s.desc}</div>
                  <div className="xpbar"><i style={{ width: `${(pr.into / pr.span) * 100}%` }} /></div>
                  <div className="small muted">
                    {profile.xp[s.id].toLocaleString()} xp{pr.level < 99 ? ` · ${(XP_TABLE[pr.level + 1] - profile.xp[s.id]).toLocaleString()} to next` : ''}
                  </div>
                </div>
                <div className="lvl-big">{pr.level}</div>
              </div>
            );
          })}
        </div>
        <div className="stone">
          <div className="row"><span className="grow">Total level</span><span className="lvl-big">{total}</span></div>
          <div className="grid2 small" style={{ marginTop: 8 }}>
            <span>Reviews</span><span>{profile.stats.reviews}</span>
            <span>Delves</span><span>{profile.stats.runs}</span>
            <span>Cleared</span><span>{profile.stats.victories}</span>
            <span>Bosses slain</span><span>{profile.stats.bosses}</span>
            <span>Deaths</span><span>{profile.stats.deaths}</span>
            <span>Best streak</span><span>{profile.streak.best}</span>
          </div>
        </div>
      </div>
    </>
  );
}
