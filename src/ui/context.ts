import { createContext, useContext } from 'react';
import type { LevelUp, Profile } from '../core/profile';
import type { Settings } from '../core/settings';

export type Screen =
  | { name: 'town' }
  | { name: 'decks' }
  | { name: 'deck'; deckId: number }
  | { name: 'editCard'; deckId: number; cardId?: number }
  | { name: 'study'; deckId?: number }
  | { name: 'import'; deckId?: number }
  | { name: 'settings' }
  | { name: 'skills' }
  | { name: 'armoury' }
  | { name: 'classSelect'; mode: 'dungeon' | 'endless' }
  | { name: 'run' };

export interface AppCtx {
  settings: Settings;
  setSettings: (s: Settings) => void;
  profile: Profile;
  /** mutate a copy of the profile, persist it, and return any level-ups */
  updateProfile: (fn: (p: Profile) => LevelUp[] | void) => Promise<LevelUp[]>;
  go: (s: Screen) => void;
  back: () => void;
  toast: (msg: string) => void;
  celebrate: (ups: LevelUp[]) => void;
  /** in-app confirmation dialog (browser confirm() is unavailable in some hosts) */
  ask: (message: string, confirmLabel?: string) => Promise<boolean>;
}

export const Ctx = createContext<AppCtx>(null!);
export const useApp = () => useContext(Ctx);
