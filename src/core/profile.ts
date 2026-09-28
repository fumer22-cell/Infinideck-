import { kvGet, kvSet } from './db';
import { EMPTY_XP, levelForXp, type SkillId, type SkillXp } from '../game/skills';

export interface Profile {
  xp: SkillXp;
  gold: number;
  milestonesClaimed: number[];
  streak: { count: number; lastClear: string | null; best: number };
  /** day key of a cleared-queue chest that hasn't been opened yet */
  chestPending: string | null;
  stats: { runs: number; deaths: number; bosses: number; reviews: number; victories: number };
  /** save-format version for one-time migrations */
  pv?: number;
  /** retired roguelike upgrades (refunded on migration) */
  meta?: Record<string, number>;
}

export const DEFAULT_PROFILE: Profile = {
  xp: { ...EMPTY_XP },
  gold: 0,
  milestonesClaimed: [],
  streak: { count: 0, lastClear: null, best: 0 },
  chestPending: null,
  stats: { runs: 0, deaths: 0, bosses: 0, reviews: 0, victories: 0 },
  pv: 2,
};

/** Gold spent on the retired Armoury upgrades, so it can be refunded. */
const META_COST: Record<string, (lvl: number) => number> = {
  vitality: (l) => 100 * (l + 1),
  bulwark: (l) => 150 * (l + 1),
  bargain: (l) => 120 * (l + 1),
  campfire: (l) => 100 * (l + 1),
  treasure: (l) => 120 * (l + 1),
  relicseeker: () => 500,
};
export function metaRefund(meta: Record<string, number> = {}): number {
  let total = 0;
  for (const [id, lvl] of Object.entries(meta)) for (let l = 0; l < lvl; l++) total += META_COST[id]?.(l) ?? 0;
  return total;
}

export async function loadProfile(): Promise<Profile> {
  const p = await kvGet<Partial<Profile>>('profile', {});
  const out: Profile = { ...DEFAULT_PROFILE, ...p, xp: { ...DEFAULT_PROFILE.xp, ...p.xp }, stats: { ...DEFAULT_PROFILE.stats, ...p.stats }, streak: { ...DEFAULT_PROFILE.streak, ...p.streak } };
  if ((p.pv ?? 1) < 2) {
    out.gold += metaRefund(p.meta);
    delete out.meta;
    out.pv = 2;
  }
  return out;
}

export async function saveProfile(p: Profile): Promise<void> {
  await kvSet('profile', p);
}

export interface LevelUp { skill: SkillId; level: number }

/** Add xp; returns any level-ups gained. */
export function addXp(p: Profile, gains: Partial<SkillXp>): LevelUp[] {
  const ups: LevelUp[] = [];
  for (const [k, v] of Object.entries(gains) as [SkillId, number][]) {
    if (!v) continue;
    const before = levelForXp(p.xp[k] ?? 0);
    p.xp[k] = (p.xp[k] ?? 0) + Math.round(v);
    const after = levelForXp(p.xp[k]);
    if (after > before) ups.push({ skill: k, level: after });
  }
  return ups;
}

export const SCHOLARSHIP_XP: Record<1 | 2 | 3 | 4, number> = { 1: 4, 2: 8, 3: 12, 4: 14 };

/** Called when the due queue is fully cleared for the day. */
export function registerClear(p: Profile, today: string, yesterday: string): boolean {
  if (p.streak.lastClear === today) return false;
  p.streak.count = p.streak.lastClear === yesterday ? p.streak.count + 1 : 1;
  p.streak.best = Math.max(p.streak.best, p.streak.count);
  p.streak.lastClear = today;
  p.chestPending = today;
  return true;
}

export function chestGold(streak: number): number {
  return 25 + Math.min(streak, 30) * 10;
}

export const MILESTONES: { count: number; gold: number; title: string; reward: string }[] = [
  { count: 50, gold: 250, title: 'Initiate of the Crypt', reward: '250 gold' },
  { count: 100, gold: 600, title: 'Keeper of Lore', reward: '600 gold' },
  { count: 500, gold: 3000, title: 'Grim Archivist', reward: '3,000 gold' },
  { count: 1000, gold: 8000, title: 'The Unforgetting', reward: '8,000 gold' },
];
