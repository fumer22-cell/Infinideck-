import { CLASSES, type ClassId } from '../../game/classes';
import { startRun } from '../../game/run';
import { Sprite, TopBar } from '../common';
import { useApp } from '../context';
import { sfx } from '../sfx';

export function ClassSelect({ mode }: { mode: 'dungeon' | 'endless' }) {
  const app = useApp();
  const choose = async (cls: ClassId) => {
    sfx.tap();
    await startRun(mode, cls, app.profile);
    await app.updateProfile((p) => {
      p.stats.runs++;
    });
    app.go({ name: 'run' });
  };
  return (
    <>
      <TopBar title={mode === 'endless' ? 'Endless Depths' : 'Choose your path'} />
      <div className="screen">
        <div className="serif muted center" style={{ fontSize: 16 }}>
          {mode === 'endless'
            ? 'Only your Mature and Legendary cards answer the call. Nothing here touches your schedule.'
            : "Today's due cards form the dungeon. Clear them all to win."}
        </div>
        <div className="choice-cards">
          {(Object.keys(CLASSES) as ClassId[]).map((id) => (
            <button key={id} className="choice parchment" onClick={() => choose(id)}>
              <Sprite name={id} size={56} />
              <div>
                <div className="cname" style={{ fontSize: 16 }}>{CLASSES[id].name}</div>
                <div className="cdesc" style={{ fontSize: 11 }}>{CLASSES[id].blurb}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
