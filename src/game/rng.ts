export type Rng = () => number;
export const rand: Rng = Math.random;
export function pick<T>(arr: readonly T[], rng: Rng = rand): T {
  return arr[Math.floor(rng() * arr.length)];
}
export function pickN<T>(arr: readonly T[], n: number, rng: Rng = rand): T[] {
  const pool = [...arr];
  const out: T[] = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  return out;
}
export function randInt(lo: number, hi: number, rng: Rng = rand): number {
  return lo + Math.floor(rng() * (hi - lo + 1));
}
