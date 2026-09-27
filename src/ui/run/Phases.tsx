import { useEffect, useState } from 'react';
import { formatInterval, nextLearningDue } from '../../core/srs';
import { CLASSES } from '../../game/classes';
import { RELICS, type RelicId } from '../../game/relics';
import type { RunState } from '../../game/run';
import { Sprite } from '../common';

function RelicButton({ id, price, disabled, onClick }: { id: RelicId; price?: number; disabled?: boolean; onClick: () => void }) {
  const r = RELICS[id];
  return (
    <button className="choice parchment" disabled={disabled} onClick={onClick}>
      <Sprite name={r.icon} size={36} />
      <div style={{ flex: 1 }}>
        <div className="cname">{r.name}</div>
        <div className="cdesc">{r.desc}</div>
      </div>
      {price != null && <div className="cname" style={{ color: disabled ? '#888' : '#7a5a00' }}>{price}g</div>}
    </button>
  );
}

export function RestStop({ onRest, onShop, healPct, run }: { onRest: () => void; onShop: () => void; healPct: number; run: RunState }) {
  return (
    <div className="modal-back center">
      <div className="modal stone">
        <h2 className="center">A Moment's Respite</h2>
        <div className="row" style={{ justifyContent: 'center' }}><Sprite name="flame" size={48} /></div>
        <div className="serif center" style={{ fontSize: 16 }}>HP {run.player.hp}/{run.player.maxHp} · {run.gold} gold</div>
        <button className="btn big green block" onClick={onRest}><Sprite name="heart" size={20} /> Rest (+{healPct}% HP)</button>
        <button className="btn big block" onClick={onShop}><Sprite name="coin" size={20} /> Visit the merchant</button>
      </div>
    </div>
  );
}

export function Shop({ run, discount, onBuy, onPotion, onLeave }: { run: RunState; discount: number; onBuy: (id: RelicId) => void; onPotion: () => void; onLeave: () => void }) {
  const potion = Math.round(20 * discount);
  return (
    <div className="modal-back center">
      <div className="modal stone">
        <div className="row">
          <h2 className="grow">The Merchant</h2>
          <span className="pill"><Sprite name="coin" size={16} />{run.gold}</span>
        </div>
        <div className="serif muted" style={{ fontSize: 15 }}>“Trinkets for the forgetful, friend.”</div>
        <div className="choice-cards">
          {run.choices.map((id) => {
            const price = Math.round(RELICS[id].cost * discount);
            return <RelicButton key={id} id={id} price={price} disabled={run.gold < price} onClick={() => onBuy(id)} />;
          })}
          <button className="choice parchment" disabled={run.potionBought || run.gold < potion} onClick={onPotion}>
            <Sprite name="potion" size={36} />
            <div style={{ flex: 1 }}>
              <div className="cname">Red Draught</div>
              <div className="cdesc">{run.potionBought ? 'Sold out.' : 'Restore 15 HP.'}</div>
            </div>
            <div className="cname">{potion}g</div>
          </button>
        </div>
        <button className="btn block" onClick={onLeave}>Onward</button>
      </div>
    </div>
  );
}

export function BossReward({ choices, onPick }: { choices: RelicId[]; onPick: (id: RelicId | null) => void }) {
  return (
    <div className="modal-back center">
      <div className="modal stone">
        <h2 className="center">The Boss Falls!</h2>
        <div className="serif center" style={{ fontSize: 15 }}>Its hoard glitters. Take one relic.</div>
        <div className="choice-cards">
          {choices.map((id) => (
            <RelicButton key={id} id={id} onClick={() => onPick(id)} />
          ))}
        </div>
        {!choices.length && <button className="btn block" onClick={() => onPick(null)}>Continue</button>}
      </div>
    </div>
  );
}

export function WaitingScreen({ onResume, onLeave }: { onResume: () => void; onLeave: () => void }) {
  const [next, setNext] = useState<number | null>(null);
  const [, tick] = useState(0);
  useEffect(() => {
    void nextLearningDue(Date.now()).then(setNext);
    const t = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const left = next ? next - Date.now() : 0;
  useEffect(() => {
    if (next && left <= 0) onResume();
  }, [next, left <= 0]);
  return (
    <div className="modal-back center">
      <div className="modal stone center">
        <h2>Catch Your Breath</h2>
        <div className="row" style={{ justifyContent: 'center' }}><Sprite name="hourglass" size={48} /></div>
        <div className="serif" style={{ fontSize: 16 }}>
          Your learning cards are still settling. The dungeon never pulls cards early — they return in
        </div>
        <div className="lvl-big">{left > 0 ? formatInterval(left) : 'moments'}</div>
        <button className="btn block stone" onClick={onLeave}>Leave the dungeon</button>
      </div>
    </div>
  );
}

function RunStats({ run }: { run: RunState }) {
  const acc = run.stats.reviews ? Math.round((run.stats.correct / run.stats.reviews) * 100) : 0;
  return (
    <div className="grid2 small" style={{ width: '100%' }}>
      <span>Class</span><span>{CLASSES[run.cls].name}</span>
      <span>Cards played</span><span>{run.stats.reviews}</span>
      <span>Recall</span><span>{acc}%</span>
      <span>Foes slain</span><span>{run.stats.kills}</span>
      <span>Gold</span><span>{run.gold}</span>
    </div>
  );
}

export function VictoryScreen({ run, onDone }: { run: RunState; onDone: () => void }) {
  return (
    <div className="modal-back center">
      <div className="modal stone col" style={{ alignItems: 'center' }}>
        <h1>{run.retreated ? 'You Escaped' : run.mode === 'endless' ? 'Depths Survived' : 'Dungeon Cleared!'}</h1>
        <Sprite name={run.retreated ? 'flame' : 'chest'} size={64} />
        {!run.retreated && run.mode === 'dungeon' && <div className="serif center" style={{ fontSize: 16 }}>Every due card has been faced. The dead rest easy — for today.</div>}
        <RunStats run={run} />
        <button className="btn big block" onClick={onDone}>Bank {run.gold} gold &amp; return</button>
      </div>
    </div>
  );
}

export function DeathScreen({ run, onDone }: { run: RunState; onDone: () => void }) {
  return (
    <div className="death">
      <Sprite name="tomb" size={96} />
      <h1>You have fallen.</h1>
      <div className="serif muted center" style={{ fontSize: 16 }}>
        Your reviews were recorded. Any cards still due await your next delve.
      </div>
      <RunStats run={run} />
      <div className="small gold">{Math.floor(run.gold / 2)} gold salvaged</div>
      <button className="btn big red block" onClick={onDone}>Rise again</button>
    </div>
  );
}

export function MenuModal({ run, onClose, onRetreat }: { run: RunState; onClose: () => void; onRetreat: () => void }) {
  return (
    <div className="modal-back center" onClick={onClose}>
      <div className="modal stone" onClick={(e) => e.stopPropagation()}>
        <h2>Paused</h2>
        <div className="small muted">{CLASSES[run.cls].name} · {CLASSES[run.cls].blurb}</div>
        {run.relics.length > 0 && (
          <div className="col">
            {run.relics.map((id) => (
              <div key={id} className="row small">
                <Sprite name={RELICS[id].icon} size={20} />
                <span><span className="gold">{RELICS[id].name}</span> — {RELICS[id].desc}</span>
              </div>
            ))}
          </div>
        )}
        <button className="btn block" onClick={onClose}>Resume</button>
        <button className="btn block red" onClick={onRetreat}>{run.mode === 'endless' ? 'Return to town' : 'Flee (lose half gold)'}</button>
      </div>
    </div>
  );
}
