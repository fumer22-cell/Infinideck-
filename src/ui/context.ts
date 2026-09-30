import { createContext, useContext } from 'react';
import type { LevelUp, Profile } from '../core/profile';
import type { Settings } from '../core/settings';
import type { Levels, SkillId } from '../game/skills';
import type { World } from '../game/world';

export type Tab = 'study' | 'skills' | 'quests' | 'bank' | 'gear' | 'journey';

export type Screen =
  | { name: Tab }
  | { name: 'skill'; skill: SkillId }
  | { name: 'shop' }
  | { name: 'decks' }
  | { name: 'deck'; deckId: number }
  | { name: 'editCard'; deckId: number; cardId?: number }
  | { name: 'import'; deckId?: number }
  | { name: 'settings' }
  | { name: 'quest'; id: string; echo?: boolean };

export interface AppCtx {
  settings: Settings;
  setSettings: (s: Settings) => void;
  profile: Profile;
  /** mutate a copy of the profile, persist it, and return any level-ups */
  updateProfile: (fn: (p: Profile) => LevelUp[] | void) => Promise<LevelUp[]>;
  world: World;
  /** mutate a copy of the world and persist it */
  updateWorld: <T>(fn: (w: World) => T) => Promise<T>;
  /** current skill levels and max HP */
  lv: Levels;
  maxHp: number;
  /** add xp to skills, celebrating level-ups */
  gainXp: (gains: Partial<Record<SkillId, number>>) => Promise<LevelUp[]>;
  go: (s: Screen) => void;
  back: () => void;
  tab: Tab;
  toast: (msg: string) => void;
  celebrate: (ups: LevelUp[]) => void;
  /** in-app confirmation dialog (browser confirm() is unavailable in some hosts) */
  ask: (message: string, confirmLabel?: string) => Promise<boolean>;
}

export const Ctx = createContext<AppCtx>(null!);
export const useApp = () => useContext(Ctx);
