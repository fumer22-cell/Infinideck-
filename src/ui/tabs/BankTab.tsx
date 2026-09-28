import { useState } from 'react';
import { SHOP } from '../../game/activities';
import { ITEMS, type ItemKind } from '../../game/items';
import { randInt } from '../../game/rng';
import { addItems, canEquip, equip, pushLog, removeItems } from '../../game/world';
import { ItemIcon, Sprite, TopBar } from '../common';
import { useApp } from '../context';
import { sfx } from '../sfx';

const ORDER: ItemKind[] = ['food', 'fish', 'ore', 'gem', 'bar', 'log', 'seed', 'crop', 'gear', 'tool', 'trinket', 'misc'];
const KIND_LABEL: Record<ItemKind, string> = { food: 'Food', fish: 'Raw fish', ore: 'Ore', gem: 'Gems', bar: 'Bars', log: 'Logs', seed: 'Seeds', crop: 'Crops', gear: 'Equipment', tool: 'Tools', trinket: 'Trinkets', misc: 'Other' };
const NEST_SEEDS = ['seed-potato', 'seed-potato', 'seed-onion', 'seed-onion', 'seed-cabbage', 'seed-tomato', 'seed-strawberry', 'seed-watermelon'];

export function BankTab() {
  const app = useApp();
  const { world, profile } = app;
  const [sel, setSel] = useState<string | null>(null);
  const ids = Object.keys(world.bank).filter((id) => ITEMS[id]);
  const worth = ids.reduce((a, id) => a + ITEMS[id].value * world.bank[id], 0);
  return (
    <div className="screen">
      <div className="row">
        <h1 className="grow">Bank</h1>
        <span className="pill"><Sprite name="coin" size={16} /> {profile.gold.toLocaleString()}</span>
      </div>
      <button className="btn block" onClick={() => app.go({ name: 'shop' })}><Sprite name="coin" size={18} /> General store</button>
      <div className="small muted">{ids.length} kinds of item · worth {worth.toLocaleString()} gold</div>
      {ORDER.map((k) => {
        const group = ids.filter((id) => ITEMS[id].kind === k).sort((a, b) => ITEMS[a].value - ITEMS[b].value);
        if (!group.length) return null;
        return (
          <div key={k} className="col">
            <h3>{KIND_LABEL[k]}</h3>
            <div className="bank-grid">
              {group.map((id) => (
                <button key={id} className={`bank-slot ${sel === id ? 'on' : ''}`} onClick={() => setSel(id)} aria-label={ITEMS[id].name}>
                  <ItemIcon id={id} size={32} />
                  <span className="qty">{fmtQty(world.bank[id])}</span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
      {!ids.length && <div className="serif muted center">Your bank is empty.</div>}
      {sel && world.bank[sel] ? <ItemSheet id={sel} onClose={() => setSel(null)} /> : null}
    </div>
  );
}

function fmtQty(n: number) {
  return n >= 100_000 ? `${Math.floor(n / 1000)}k` : String(n);
}

function ItemSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const app = useApp();
  const { world, lv, maxHp } = app;
  const d = ITEMS[id];
  const n = world.bank[id] ?? 0;
  const e = d.equip;

  const sell = async (qty: number) => {
    if (qty > 1 && (d.kind === 'gear' || d.kind === 'trinket' || d.kind === 'tool') && !(await app.ask(`Sell ${qty} ${d.name} for ${qty * d.value} gold?`, 'Sell'))) return;
    await app.updateWorld((w) => removeItems(w, { [id]: qty }));
    await app.updateProfile((p) => void (p.gold += qty * d.value));
    sfx.coin();
    if (qty >= n) onClose();
  };
  const doEquip = async () => {
    const ok = await app.updateWorld((w) => equip(w, id, lv));
    if (ok) {
      sfx.shield();
      app.toast(`Equipped ${d.name}.`);
      onClose();
    }
  };
  const setFood = async () => {
    await app.updateWorld((w) => void (w.food = id));
    app.toast(`${d.name} set as your food.`);
  };
  const eatNow = async () => {
    const healed = await app.updateWorld((w) => {
      if (w.hp >= maxHp) return 0;
      removeItems(w, { [id]: 1 });
      const before = w.hp;
      w.hp = Math.min(maxHp, w.hp + (d.heal ?? 0));
      return w.hp - before;
    });
    if (healed) sfx.heal();
    else app.toast('Already at full health.');
  };
  const open = async () => {
    let msg = '';
    let gold = 0;
    await app.updateWorld((w) => {
      removeItems(w, { [id]: 1 });
      if (id === 'bird-nest') {
        const seed = NEST_SEEDS[Math.floor(Math.random() * NEST_SEEDS.length)];
        const q = randInt(1, 3);
        addItems(w, { [seed]: q });
        msg = `The nest holds ${q} ${ITEMS[seed].name.toLowerCase()}${q > 1 ? 's' : ''}.`;
      } else {
        gold = randInt(30, 250);
        msg = `The casket holds ${gold} gold.`;
      }
      pushLog(w, msg, 'gold');
    });
    if (gold) await app.updateProfile((p) => void (p.gold += gold));
    sfx.coin();
    app.toast(msg);
  };

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal stone" onClick={(ev) => ev.stopPropagation()}>
        <div className="row">
          <ItemIcon id={id} size={48} />
          <div className="grow">
            <h2>{d.name}</h2>
            <div className="small muted">You have {n} · worth {d.value} gold each</div>
          </div>
        </div>
        {d.desc && <div className="serif" style={{ fontSize: 15 }}>{d.desc}</div>}
        {d.heal ? <div className="small green">Heals {d.heal} HP</div> : null}
        {e?.dmg ? <div className="small">+{Math.round(e.dmg * 100)}% damage · needs Attack {e.level}</div> : null}
        {e?.dr ? <div className="small">{Math.round(e.dr * 100)}% damage reduction · needs Defence {e.level}</div> : null}
        {d.tool ? <div className="small">+{Math.round(d.tool.bonus * 100)}% double yield · works from {d.tool.skill} {d.tool.level}. Tools work straight from the bank.</div> : null}
        <div className="grid2">
          {e && <button className="btn green" disabled={!canEquip(id, lv)} onClick={doEquip}>Equip</button>}
          {d.heal ? <button className="btn" disabled={world.food === id} onClick={setFood}>{world.food === id ? 'Your food' : 'Set as food'}</button> : null}
          {d.heal ? <button className="btn green" onClick={eatNow}>Eat</button> : null}
          {(id === 'bird-nest' || id === 'casket') && <button className="btn green" onClick={open}>Open</button>}
          <button className="btn stone" onClick={() => sell(1)}>Sell 1 ({d.value}g)</button>
          {n > 1 && <button className="btn stone" onClick={() => sell(n)}>Sell all ({(n * d.value).toLocaleString()}g)</button>}
        </div>
        <button className="btn block stone small" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

export function Shop() {
  const app = useApp();
  const { profile, lv } = app;
  const buy = async (item: string, price: number, qty: number) => {
    if (profile.gold < price * qty) return;
    await app.updateProfile((p) => void (p.gold -= price * qty));
    await app.updateWorld((w) => addItems(w, { [item]: qty }));
    sfx.coin();
    app.toast(`Bought ${qty} ${ITEMS[item].name}.`);
  };
  return (
    <>
      <TopBar title="General store" right={<span className="pill"><Sprite name="coin" size={16} /> {profile.gold.toLocaleString()}</span>} />
      <div className="screen">
        <div className="serif muted" style={{ fontSize: 15 }}>“Seeds, bread and tools. Better gear you’ll have to make yourself.”</div>
        <div className="list">
          {SHOP.map((s) => {
            const locked = s.level && lv[s.level.skill] < s.level.level;
            return (
              <div key={s.item} className={`list-item ${locked ? 'locked' : ''}`}>
                <ItemIcon id={s.item} size={32} />
                <div className="name">
                  <div>{ITEMS[s.item].name}</div>
                  <div className="small muted">{locked ? `Needs ${s.level!.skill} ${s.level!.level}` : `${s.price} gold`}</div>
                </div>
                <button className="btn small" disabled={!!locked || profile.gold < s.price} onClick={() => buy(s.item, s.price, 1)}>Buy</button>
                {ITEMS[s.item].kind !== 'tool' && <button className="btn small stone" disabled={!!locked || profile.gold < s.price * 5} onClick={() => buy(s.item, s.price, 5)}>×5</button>}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
