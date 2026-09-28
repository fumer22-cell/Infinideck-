import { ITEMS, SLOTS, type Slot } from '../../game/items';
import { combatLevel, SKILL_BY_ID } from '../../game/skills';
import { bonuses, canEquip, equip, unequip, type CombatStyle } from '../../game/world';
import { ItemIcon, Sprite } from '../common';
import { useApp } from '../context';
import { HeroView } from '../HeroView';
import { heroLook } from '../heroLook';
import { sfx } from '../sfx';

const SLOT_LABEL: Record<Slot, string> = { weapon: 'Weapon', helm: 'Helm', body: 'Body', shield: 'Shield', amulet: 'Amulet', ring: 'Ring' };
const SLOT_ICON: Record<Slot, string> = { weapon: 'sword', helm: 'helm', body: 'body', shield: 'shield', amulet: 'sigil', ring: 'ring' };

export function GearTab() {
  const app = useApp();
  const { world, lv, maxHp } = app;
  const b = bonuses(world, lv);
  const equippable = Object.keys(world.bank).filter((id) => ITEMS[id]?.equip).sort((a, b2) => ITEMS[b2].value - ITEMS[a].value);
  const foods = Object.keys(world.bank).filter((id) => ITEMS[id]?.heal);

  const doEquip = async (id: string) => {
    if (await app.updateWorld((w) => equip(w, id, lv))) sfx.shield();
  };
  const doUnequip = async (slot: Slot) => app.updateWorld((w) => unequip(w, slot));
  const setStyle = (st: CombatStyle) => void app.updateWorld((w) => void (w.style = st));

  return (
    <div className="screen">
      <div className="row">
        <h1 className="grow">Gear</h1>
        <span className="pill">Combat {combatLevel(lv)}</span>
      </div>
      <div className="stone col">
        <div className="row">
          <HeroView look={heroLook(world, lv, 'sword')} size={72} label="Your character in their gear" />
          <div className="grow">
            <div className="hpbar" style={{ width: '100%' }}>
              <i style={{ width: `${(world.hp / maxHp) * 100}%` }} />
              <span>{world.hp}/{maxHp} HP</span>
            </div>
            <div className="small muted" style={{ marginTop: 4 }}>{world.combat ? 'In combat: heal by eating.' : world.hp < maxHp ? 'Recovering 1 HP every 20 seconds.' : 'Fully rested.'}</div>
          </div>
        </div>
        <div className="grid2 small">
          <span>Damage</span><span>×{b.dmgMult.toFixed(2)}</span>
          <span>Damage taken</span><span>−{Math.round(b.reduction * 100)}%</span>
          <span>Weapon</span><span>+{Math.round(b.weaponDmg * 100)}%</span>
          <span>Armour</span><span>{Math.round(b.armourDr * 100)}%</span>
        </div>
      </div>

      <div className="gear-grid">
        {SLOTS.map((slot) => {
          const id = world.equip[slot];
          return (
            <button key={slot} className="gear-slot" onClick={() => id && doUnequip(slot)} aria-label={id ? `Unequip ${ITEMS[id].name}` : `${SLOT_LABEL[slot]} slot, empty`}>
              {id ? <ItemIcon id={id} size={36} /> : <Sprite name={SLOT_ICON[slot]} size={28} className="ghost" />}
              <span className="small">{id ? ITEMS[id].name : SLOT_LABEL[slot]}</span>
            </button>
          );
        })}
      </div>
      <div className="small muted center">Tap an equipped item to take it off.</div>

      <div className="stone col">
        <h3>Combat style</h3>
        <div className="grid3">
          {(['attack', 'strength', 'defence'] as CombatStyle[]).map((st) => (
            <button key={st} className={`btn small ${world.style === st ? 'green' : 'stone'}`} onClick={() => setStyle(st)}>{SKILL_BY_ID[st].name}</button>
          ))}
        </div>
      </div>

      <div className="stone col">
        <h3>Food</h3>
        <div className="small muted">Eaten automatically below a third of your HP in combat, or tap Eat.</div>
        {foods.length ? (
          <div className="bank-grid">
            {foods.map((id) => (
              <button key={id} className={`bank-slot ${world.food === id ? 'on' : ''}`} onClick={() => app.updateWorld((w) => void (w.food = id))} aria-label={`Use ${ITEMS[id].name} as food`}>
                <ItemIcon id={id} size={32} />
                <span className="qty">{world.bank[id]}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="small">No food. Cook fish, harvest crops or buy bread.</div>
        )}
      </div>

      <h3>In your bank</h3>
      <div className="list">
        {equippable.length === 0 && <div className="small muted">Nothing to equip yet. Forge gear at the anvil, or win it in combat.</div>}
        {equippable.map((id) => {
          const e = ITEMS[id].equip!;
          const ok = canEquip(id, lv);
          return (
            <div key={id} className="list-item">
              <ItemIcon id={id} size={32} />
              <div className="name">
                <div>{ITEMS[id].name}</div>
                <div className="small muted">
                  {e.dmg ? `+${Math.round(e.dmg * 100)}% damage` : e.dr ? `${Math.round(e.dr * 100)}% armour` : ITEMS[id].desc}
                  {!ok && e.skill ? ` · needs ${SKILL_BY_ID[e.skill].name} ${e.level}` : ''}
                </div>
              </div>
              <button className="btn small green" disabled={!ok} onClick={() => doEquip(id)}>Equip</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
