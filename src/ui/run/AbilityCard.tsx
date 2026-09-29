import { ABILITIES, num, type AbilityId, type CombatStats } from '../../game/abilities';
import { ItemIcon, Sprite } from '../common';

/** One ability card, with its numbers worked out from your current stats. */
export function AbilityCard({ id, plus, food, stats, onPlay, disabled, off, note, small }: {
  id: AbilityId;
  plus?: boolean;
  food?: string;
  stats: CombatStats;
  onPlay?: () => void;
  disabled?: boolean;
  /** switched out of the deck (deck builder) */
  off?: boolean;
  /** a line under the text, e.g. where the card comes from */
  note?: string;
  small?: boolean;
}) {
  const def = ABILITIES[id];
  const n = num(stats, plus, food);
  return (
    <button
      className={`ability parchment k-${def.kind} ${plus ? 'plus' : ''} ${off ? 'off' : ''} ${small ? 'small' : ''}`}
      disabled={disabled}
      onClick={onPlay}
      aria-label={`${def.name}${plus ? ' plus' : ''}, costs ${def.cost} energy. ${def.text(n)}`}
    >
      <span className="cost num" aria-hidden>{def.cost}</span>
      {id === 'eat' && food ? <ItemIcon id={food} size={small ? 24 : 30} /> : <Sprite name={def.icon} size={small ? 24 : 30} />}
      <span className="aname">{def.name}{plus ? '+' : ''}</span>
      {!small && <span className="atext">{def.text(n)}</span>}
      {note && <span className="anote">{note}</span>}
    </button>
  );
}

/** A compact chip for a card you can't play yet (the hand preview while you answer). */
export function AbilityChip({ id, plus, food }: { id: AbilityId; plus?: boolean; food?: string }) {
  const def = ABILITIES[id];
  return (
    <span className={`ability-chip k-${def.kind}`}>
      <span className="cost num">{def.cost}</span>
      {id === 'eat' && food ? <ItemIcon id={food} size={16} /> : <Sprite name={def.icon} size={16} />}
      <span>{def.name}{plus ? '+' : ''}</span>
    </span>
  );
}
