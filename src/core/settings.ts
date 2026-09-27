import { kvGet, kvSet } from './db';

export interface Settings {
  muted: boolean;
  speedBonus: boolean;
  newPerDay: number;
  maxReviewsPerDay: number;
  /** Hour at which a new study day begins (Anki default: 4am). */
  dayStartHour: number;
  retention: number;
}

export const DEFAULT_SETTINGS: Settings = {
  muted: false,
  speedBonus: false,
  newPerDay: 20,
  maxReviewsPerDay: 200,
  dayStartHour: 4,
  retention: 0.9,
};

export async function loadSettings(): Promise<Settings> {
  return { ...DEFAULT_SETTINGS, ...(await kvGet<Partial<Settings>>('settings', {})) };
}

export async function saveSettings(s: Settings): Promise<void> {
  await kvSet('settings', s);
}
