import { useState } from 'react';
import { SHOP } from '../../game/activities';
import { ITEMS, type ItemKind } from '../../game/items';
import { randInt } from '../../game/rng';
import { addItems, canEquip, equip, hasItems, pushLog, removeItems } from '../../game/world';
import { SKILL_BY_ID, SKILLS, type SkillId } from '../../game/skills';
import { EmptyState, GoldPill, ItemIcon, NavRow, PageHeader, SectionTitle, Sprite, TopBar } from '../common';
import { useApp } from '../context';
import { sfx } from '../sfx';

const ORDER: ItemKind[] = ['legendary', 'pet', 'food', 'fish', 'ore', 'gem', 'bar', 'log', 'seed', 'crop', 'gear', 'tool', 'trinket', 'misc'];
const KIND_LABEL: Record<ItemKind, string> = { food: 'Food', fish: 'Raw fish', ore: 'Ore', gem: 'Gems', bar: 'Bars', log: 'Logs', seed: 'Seeds', crop: 'Crops', gear: 'Equipment', tool: 'Tools', trinket: 'Trinkets', legendary: 'Legendary finds', pet: 'Pets', misc: 'Other' };
/** xp from pouring out an Alembic of Insight (a quest reward) */
export const ALEMBIC_XP = 750;
const NEST_SEEDS = ['seed-potato', 'seed-potato', 'seed-onion', 'seed-onion', 'seed-cabbage', 'seed-tomato', 'seed-strawberry', 'seed-watermelon'];

export function BankTab() {
  const app = useApp();
  const { world, profile } = app;
  const [sel, setSel] = useState<string | null>(null);
  const ids = Object.keys(world.bank).filter((id) => ITEMS[id]);
  const worth = ids.reduce((a, id) => a + ITEMS[id].value * world.bank[id], 0);
  return (
    <div className="screen">
      <PageHeader title="Bank" sub={`${ids.length} kinds of item · worth ${worth.toLocaleString()} gold`} right={<GoldPill amount={profile.gold} />} />
      <nav className="nav-list">
        <NavRow icon="coin" title="General store" sub="Seeds, bread, rods and starter tools" onClick={() => app.go({ name: 'shop' })} />
      </nav>
      {ORDER.map((k) => {
        const group = ids.filter((id) => ITEMS[id].kind === k).sort((a, b) => ITEMS[a].value - ITEMS[b].value);
        if (!group.length) return null;
        return (
          <section key={k} className="col">
            <SectionTitle note={String(group.reduce((a, id) => a + world.bank[id], 0))}>{KIND_LABEL[k]}</SectionTitle>
            <div className="bank-grid">
              {group.map((id) => (
                <button key={id} className={`bank-slot rarity-${ITEMS[id].kind} ${sel === id ? 'on' : ''}`} onClick={() => { sfx.tap(); setSel(id); }} aria-label={`${ITEMS[id].name}, ${world.bank[id]}`}>
                  <ItemIcon id={id} size={34} />
                  <span className="qty">{fmtQty(world.bank[id])}</span>
                </button>
              ))}
            </div>
          </section>
        );
      })}
      {!ids.length && <EmptyState icon="chest" title="Your bank is empty">Train a gathering skill and your haul lands here.</EmptyState>}
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
  const [pouring, setPouring] = useState(false);

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

  const pour = async (skill: SkillId) => {
    await app.updateWorld((w) => {
      removeItems(w, { alembic: 1 });
      pushLog(w, `The alembic’s insight pours into your ${SKILL_BY_ID[skill].name}: +${ALEMBIC_XP} xp.`, 'xp');
    });
    await app.gainXp({ [skill]: ALEMBIC_XP });
    setPouring(false);
    onClose();
  };

  if (pouring)
    return (
      <div className="modal-back" onClick={() => setPouring(false)}>
        <div className="modal stone gilded" role="dialog" aria-label="Choose a skill" onClick={(ev) => ev.stopPropagation()}>
          <h2>Pour into which skill?</h2>
          <div className="desc small">{ALEMBIC_XP} xp, all at once.</div>
          <div className="level-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
            {SKILLS.map((s) => (
              <button key={s.id} className="level-cell" onClick={() => pour(s.id)} aria-label={`${s.name}, level ${lv[s.id]}`}>
                <Sprite name={s.icon} size={18} /> <span className="small">{s.name}</span>
              </button>
            ))}
          </div>
          <button className="btn block plain small" onClick={() => setPouring(false)}>Cancel</button>
        </div>
      </div>
    );

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal stone gilded" role="dialog" aria-label={d.name} onClick={(ev) => ev.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="row" style={{ gap: 12 }}>
          <ItemIcon id={id} size={48} className="icon-tile" />
          <div className="grow">
            <h2>{d.name}</h2>
            <div className="small muted num" style={{ marginTop: 4 }}>You have {n.toLocaleString()} · {d.value ? `${d.value} gold each` : 'cannot be sold'}</div>
          </div>
        </div>
        {d.desc && <div className="desc">{d.desc}</div>}
        <div className="row wrap">
          {d.heal ? <span className="pill green">Heals {d.heal} HP</span> : null}
          {e?.dmg ? <span className="pill">+{Math.round(e.dmg * 100)}% damage</span> : null}
          {e?.dr ? <span className="pill">{Math.round(e.dr * 100)}% armour</span> : null}
          {e?.skill ? <span className={`pill ${canEquip(id, lv) ? '' : 'red'}`}>Needs {e.skill} {e.level}</span> : null}
          {d.tool ? <span className="pill">+{Math.round(d.tool.bonus * 100)}% double yield</span> : null}
          {d.tool ? <span className="pill">{d.tool.skill} {d.tool.level}+</span> : null}
        </div>
        {d.tool ? <div className="desc small">Tools work straight from the bank: your best usable one is always used.</div> : null}
        <div className="grid2">
          {e && <button className="btn green" disabled={!canEquip(id, lv)} onClick={doEquip}>Equip</button>}
          {d.heal ? <button className="btn" disabled={world.food === id} onClick={setFood}>{world.food === id ? 'Your food' : 'Set as food'}</button> : null}
          {d.heal ? <button className="btn green" onClick={eatNow}>Eat</button> : null}
          {(id === 'bird-nest' || id === 'casket') && <button className="btn green" onClick={open}>Open</button>}
          {id === 'alembic' && <button className="btn green" onClick={() => setPouring(true)}>Pour it out</button>}
          {d.value > 0 && <button className="btn stone" onClick={() => sell(1)}>Sell 1 ({d.value}g)</button>}
          {d.value > 0 && n > 1 && <button className="btn stone" onClick={() => sell(n)}>Sell all ({(n * d.value).toLocaleString()}g)</button>}
        </div>
        <button className="btn block plain small" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

export function Shop() {
  const app = useApp();
  const { profile, lv } = app;
  const buy = async (item: string, price: number, qty: number, trade?: Record<string, number>) => {
    if (profile.gold < price * qty || (trade && !hasItems(app.world, trade, qty))) return;
    await app.updateProfile((p) => void (p.gold -= price * qty));
    await app.updateWorld((w) => {
      if (trade) removeItems(w, trade, qty);
      addItems(w, { [item]: qty });
    });
    sfx.coin();
    app.toast(`Bought ${qty} ${ITEMS[item].name}.`);
  };
  return (
    <>
      <TopBar title="General store" right={<GoldPill amount={profile.gold} />} />
      <div className="screen">
        <div className="desc" style={{ fontStyle: 'italic' }}>“Seeds, bread and tools. Better gear you’ll have to make yourself.”</div>
        <div className="list">
          {SHOP.map((s) => {
            const locked = s.level && lv[s.level.skill] < s.level.level;
            const tradeText = s.trade ? Object.entries(s.trade).map(([id, n]) => ` + ${n} ${ITEMS[id].name.toLowerCase()} (${app.world.bank[id] ?? 0})`).join('') : '';
            const canTrade = !s.trade || hasItems(app.world, s.trade);
            return (
              <div key={s.item} className={`list-item ${locked ? 'locked' : ''}`}>
                <ItemIcon id={s.item} size={32} />
                <div className="name">
                  <div>{ITEMS[s.item].name}</div>
                  <div className="small muted">{locked ? `Needs ${s.level!.skill} ${s.level!.level} · ` : ''}{`${s.price} gold${tradeText}`}</div>
                </div>
                <button className="btn small" disabled={!!locked || profile.gold < s.price || !canTrade} onClick={() => buy(s.item, s.price, 1, s.trade)}>Buy</button>
                {ITEMS[s.item].kind !== 'tool' && <button className="btn small stone" disabled={!!locked || profile.gold < s.price * 5} onClick={() => buy(s.item, s.price, 5)}>×5</button>}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
