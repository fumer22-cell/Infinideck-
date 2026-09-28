export type Biome = 'crypt' | 'bog' | 'keep';

export type IntentKind = 'attack' | 'block' | 'buff';
export interface Intent { kind: IntentKind; value: number }

export interface EnemyState {
  id: string;
  name: string;
  sprite: string;
  hp: number;
  maxHp: number;
  block: number;
  atk: number;
  poison: number;
  patternIdx: number;
  pattern: IntentKind[];
  intent: Intent;
  boss: boolean;
}

export function intentFor(e: Pick<EnemyState, 'pattern' | 'patternIdx' | 'atk'>): Intent {
  const kind = e.pattern[e.patternIdx % e.pattern.length];
  if (kind === 'attack') return { kind, value: e.atk };
  if (kind === 'block') return { kind, value: Math.ceil(e.atk * 1.5) };
  return { kind, value: 1 };
}
