import { progressOf, questPoints, QUESTS } from '../../game/quests';
import { PageHeader, SectionTitle, Sprite, XpBar } from '../common';
import { useApp } from '../context';
import { RewardList } from './parts';

export function QuestsTab() {
  const app = useApp();
  const { world } = app;
  const qp = questPoints(world);
  return (
    <div className="screen">
      <PageHeader title="Quests" sub="Stories told in problems" right={<span className="pill gold num"><Sprite name="scroll" size={14} /> {qp} QP</span>} />
      <div className="desc small">Quests are separate from your flashcards. Each chapter is a problem that moves the story on. Solve it to see what happens next. Rewards include gold, resources and combat spells.</div>
      <SectionTitle>Quest board</SectionTitle>
      <div className="list">
        {QUESTS.map((q) => {
          const p = progressOf(world, q.id);
          const started = !!world.quests?.[q.id];
          const done = !!p.done;
          const stars = p.stars.filter(Boolean).length;
          return (
            <button key={q.id} className="stone quest-card" onClick={() => app.go({ name: 'quest', id: q.id })}>
              <Sprite name={q.giver.sprite} size={48} className="portrait" />
              <div className="grow col" style={{ gap: 4 }}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <h3>{q.title}</h3>
                  <span className={`pill small ${done ? 'green' : started ? 'gold' : ''}`}>{done ? 'Complete' : started ? `Chapter ${p.step + 1}/${q.chapters.length}` : 'New'}</span>
                </div>
                <div className="small muted">{q.subject} · {q.giver.title}</div>
                <div className="desc small">{q.blurb}</div>
                {started && <XpBar into={p.step} span={q.chapters.length} tone={done ? 'green' : 'gold'} />}
                {done && <div className="small gold">{'★'.repeat(stars)}<span className="muted">{'★'.repeat(q.chapters.length - stars)}</span></div>}
                {!done && <RewardList compact reward={{ ...q.reward, spells: q.chapters.flatMap((c) => c.reward.spells ?? []) }} />}
              </div>
            </button>
          );
        })}
      </div>
      <div className="small muted center">More quests are written from the problem sets you bring.</div>
    </div>
  );
}
