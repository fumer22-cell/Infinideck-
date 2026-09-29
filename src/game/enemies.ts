export type Biome = 'crypt' | 'bog' | 'keep';

/**
 * What an enemy can do on its turn. It always shows the next one (its intent),
 * so you can plan: block a heavy blow, stun a wind-up, or race it down.
 */
export type Move = 'attack' | 'multi' | 'block' | 'buff' | 'windup' | 'heavy' | 'poison';

/**
 * Traits give each enemy its own puzzle.
 * - armoured: gains block after every move (break it with Cleave, or poison)
 * - enrage: grows stronger each time you answer Again
 * - regen: heals a little every turn (burst it down)
 * - venomous: its hits poison you
 */
export type Trait = 'armoured' | 'enrage' | 'regen' | 'venomous';

export const TRAIT_INFO: Record<Trait, { name: string; desc: string; icon: string }> = {
  armoured: { name: 'Armoured', desc: 'Gains block after every move. Cleave ignores block; poison goes around it.', icon: 'shield' },
  enrage: { name: 'Enrage', desc: 'Grows stronger every time you answer Again.', icon: 'up' },
  regen: { name: 'Regenerates', desc: 'Heals a little every turn. Burst it down.', icon: 'heart' },
  venomous: { name: 'Venomous', desc: 'Its hits poison you.', icon: 'skull' },
};

export interface Intent { kind: Move; value: number; hits?: number }

export interface EnemyState {
  id: string;
  name: string;
  sprite: string;
  hp: number;
  maxHp: number;
  block: number;
  atk: number;
  /** bonus damage from buffs and enrage */
  str: number;
  poison: number;
  /** turns of dealing 25% less */
  weak: number;
  /** turns of taking 50% more */
  vuln: number;
  stunned: boolean;
  patternIdx: number;
  pattern: Move[];
  /** a boss's second pattern, used below half health */
  phase2?: Move[];
  enraged?: boolean;
  traits: Trait[];
  intent: Intent;
  boss: boolean;
}

export const armourOf = (e: Pick<EnemyState, 'atk'>) => Math.ceil(e.atk * 0.8) + 1;

export function intentFor(e: Pick<EnemyState, 'pattern' | 'patternIdx' | 'atk' | 'str'>): Intent {
  const kind = e.pattern[e.patternIdx % e.pattern.length];
  const a = e.atk + (e.str ?? 0);
  switch (kind) {
    case 'attack': return { kind, value: a };
    case 'multi': return { kind, value: Math.max(1, Math.ceil(a * 0.45)), hits: 3 };
    case 'block': return { kind, value: Math.ceil(e.atk * 1.5) };
    case 'buff': return { kind, value: Math.max(1, Math.round(e.atk * 0.3)) };
    case 'windup': return { kind, value: Math.round(a * 2.5) };
    case 'heavy': return { kind, value: Math.round(a * 2.5) };
    case 'poison': return { kind, value: Math.max(1, Math.ceil(a * 0.5)), hits: Math.max(2, Math.ceil(e.atk * 0.6)) };
  }
}

/** Short label for the intent badge. */
export function intentLabel(i: Intent): string {
  switch (i.kind) {
    case 'attack': return `Attack ${i.value}`;
    case 'multi': return `${i.hits}× ${i.value}`;
    case 'block': return `Block ${i.value}`;
    case 'buff': return `Empower +${i.value}`;
    case 'windup': return `Winding up`;
    case 'heavy': return `Heavy ${i.value}`;
    case 'poison': return `Hit ${i.value} +${i.hits} poison`;
  }
}
