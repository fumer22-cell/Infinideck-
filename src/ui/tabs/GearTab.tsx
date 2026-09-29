import { ABILITIES, activeDeck, cardPool, itemCards, MIN_DECK, TECHNIQUES, type PoolCard } from '../../game/abilities';
import { ITEMS, SLOTS, type Slot } from '../../game/items';
import { combatLevel, SKILL_BY_ID } from '../../game/skills';
import { canEquip, equip, loadout, statsFor, unequip, type CombatStyle } from '../../game/world';
import { ItemIcon, PageHeader, SectionTitle, Sprite } from '../common';
import { useApp } from '../context';
import { HeroView } from '../HeroView';
import { heroLook } from '../heroLook';
import { AbilityCard } from '../run/AbilityCard';
import { sfx } from '../sfx';

const SLOT_LABEL: Record<Slot, string> = { weapon: 'Weapon', helm: 'Helm', body: 'Body', shield: 'Shield', amulet: 'Amulet', ring: 'Ring' };
const SLOT_ICON: Record<Slot, string> = { weapon: 'sword', helm: 'helm', body: 'body', shield: 'shield', amulet: 'sigil', ring: 'ring' };
const STYLE_NOTE: Record<CombatStyle, string> = { attack: 'Damage xp trains Attack.', strength: 'Damage xp trains Strength.', defence: 'Damage xp trains Defence.' };

const cardsText = (id: string) => {
  const ids = itemCards(id);
  const counts: Record<string, number> = {};
  for (const a of ids) counts[a] = (counts[a] ?? 0) + 1;
  return Object.entries(counts).map(([a, n]) => `${ABILITIES[a as keyof typeof ABILITIES].name}${n > 1 ? ` ×${n}` : ''}`).join(', ');
};

function sourceName(c: PoolCard) {
  if (c.source === 'basic') return 'Basic';
  if (c.source === 'technique') return 'Technique';
  if (c.source === 'food') return 'Packed food';
  if (c.source === 'fists') return 'Bare hands';
  return ITEMS[c.source]?.name ?? c.source;
}

export function GearTab() {
  const app = useApp();
  const { world, lv, maxHp } = app;
  const stats = statsFor(world, lv, maxHp);
  const pool = cardPool(loadout(world), lv);
  const deck = activeDeck(loadout(world), lv, world.deckOff);
  const inDeck = new Set(deck.map((c) => c.key));
  const equippable = Object.keys(world.bank).filter((id) => ITEMS[id]?.equip).sort((a, b2) => ITEMS[b2].value - ITEMS[a].value);
  const foods = Object.keys(world.bank).filter((id) => ITEMS[id]?.heal);
  const locked = TECHNIQUES.filter((t) => lv[t.skill] < t.level);

  const doEquip = async (id: string) => {
    if (await app.updateWorld((w) => equip(w, id, lv))) sfx.shield();
  };
  const doUnequip = async (slot: Slot) => app.updateWorld((w) => unequip(w, slot));
  const setStyle = (st: CombatStyle) => void app.updateWorld((w) => void (w.style = st));
  const toggle = async (key: string) => {
    const on = inDeck.has(key);
    if (on && deck.length <= MIN_DECK) {
      app.toast(`A deck needs at least ${MIN_DECK} cards.`);
      return;
    }
    await app.updateWorld((w) => {
      const off = new Set(w.deckOff ?? []);
      if (on) off.add(key);
      else off.delete(key);
      w.deckOff = [...off];
    });
    sfx.tap();
  };

  return (
    <div className="screen">
      <PageHeader title="Gear" sub="Your loadout is your combat deck" right={<span className="pill gold num">Combat {combatLevel(lv)}</span>} />
      <div className="stone gilded col">
        <div className="row" style={{ gap: 12 }}>
          <HeroView look={heroLook(world, lv, 'sword')} size={78} label="Your character in their gear" />
          <div className="grow col" style={{ gap: 6 }}>
            <div className="hpbar" style={{ width: '100%', height: 16 }}>
              <i style={{ width: `${(world.hp / maxHp) * 100}%` }} />
              <span style={{ lineHeight: '12px', fontSize: 10 }}>{world.hp} / {maxHp} HP</span>
            </div>
            <div className="small muted">{world.combat ? 'In combat: heal with Eat cards.' : world.hp < maxHp ? 'Recovering 1 HP every 20 seconds.' : 'Fully rested.'}</div>
          </div>
        </div>
        <div className="stat-grid">
          <div className="stat"><b className="num">{Math.round(stats.power)}</b><span>POWER</span></div>
          <div className="stat"><b className="num">{Math.round(stats.guard)}</b><span>GUARD</span></div>
          <div className="stat"><b className="num">−{Math.round(stats.reduction * 100)}%</b><span>HITS TAKEN</span></div>
          <div className="stat"><b className="num">{deck.length}</b><span>DECK</span></div>
        </div>
        <div className="desc small">Power sets your attack cards’ damage: your weapon’s metal, Attack and Strength. Guard sets your block cards: armour and Defence.</div>
      </div>

      <SectionTitle note="tap to take off">Equipped</SectionTitle>
      <div className="gear-grid">
        {SLOTS.map((slot) => {
          const id = world.equip[slot];
          return (
            <button key={slot} className={`gear-slot ${id ? 'filled' : ''}`} onClick={() => id && doUnequip(slot)} aria-label={id ? `Unequip ${ITEMS[id].name}` : `${SLOT_LABEL[slot]} slot, empty`}>
              {id ? <ItemIcon id={id} size={36} /> : <Sprite name={SLOT_ICON[slot]} size={28} className="ghost" />}
              <span className="small">{id ? ITEMS[id].name : SLOT_LABEL[slot]}</span>
            </button>
          );
        })}
      </div>

      <SectionTitle note={`${deck.length} of ${pool.length} cards · tap to switch`}>Combat deck</SectionTitle>
      <div className="desc small">Every flashcard you answer in combat gives energy (Hard 1, Good 2, Easy 3, +1 for a mature card). You spend it on these. A thinner deck draws your best cards more often.</div>
      <div className="deck-grid">
        {pool.map((c) => (
          <AbilityCard key={c.key} id={c.id} plus={c.plus} food={c.food} stats={stats} off={!inDeck.has(c.key)} note={sourceName(c)} onPlay={() => toggle(c.key)} />
        ))}
      </div>
      {locked.length > 0 && (
        <div className="stone col">
          <h3>Techniques to learn</h3>
          {locked.map((t) => (
            <div key={t.id} className="row small">
              <Sprite name={ABILITIES[t.id].icon} size={18} />
              <span className="grow">{ABILITIES[t.id].name}</span>
              <span className="muted num">{SKILL_BY_ID[t.skill].name} {t.level}</span>
            </div>
          ))}
        </div>
      )}

      <div className="stone col">
        <h3>Combat style</h3>
        <div className="grid3">
          {(['attack', 'strength', 'defence'] as const).map((st) => (
            <button key={st} className={`btn small ${world.style === st ? 'green' : 'stone'}`} onClick={() => setStyle(st)}>{SKILL_BY_ID[st].name}</button>
          ))}
        </div>
        <div className="desc small">{STYLE_NOTE[world.style]} Blocking always trains Defence.</div>
      </div>

      <div className="stone col">
        <h3>Packed food</h3>
        <div className="desc small">Adds 2 Eat cards to your deck. Each one eats 1 from your bank.</div>
        {foods.length ? (
          <div className="bank-grid">
            {foods.map((id) => (
              <button key={id} className={`bank-slot ${world.food === id ? 'on' : ''}`} onClick={() => app.updateWorld((w) => void (w.food = id))} aria-label={`Pack ${ITEMS[id].name}, heals ${ITEMS[id].heal}`}>
                <ItemIcon id={id} size={32} />
                <span className="qty">{world.bank[id]}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="small">No food. Cook fish, harvest crops or buy bread.</div>
        )}
      </div>

      <SectionTitle>In your bank</SectionTitle>
      <div className="list">
        {equippable.length === 0 && <div className="desc small">Nothing to equip yet. Forge gear at the anvil, or win it in combat.</div>}
        {equippable.map((id) => {
          const e = ITEMS[id].equip!;
          const ok = canEquip(id, lv);
          return (
            <div key={id} className="list-item">
              <ItemIcon id={id} size={32} />
              <div className="name">
                <div>{ITEMS[id].name}</div>
                <div className="small muted">
                  {cardsText(id) ? `Cards: ${cardsText(id)}` : ITEMS[id].desc}
                  {e.dr ? ` · +${Math.round(e.dr * 100)} guard` : ''}
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
