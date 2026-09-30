/** Reading and grading numeric answers the way a chemistry homework system does. */
import type { NumberPart, Rounding, Vars } from './types';

/** Parse "26.4", "2.64e1", "2.64 x 10^1", "2.64×10^1", "−3". Returns null if it isn't a number. */
export function parseNumber(raw: string): number | null {
  const s = raw.trim().replace(/[−–]/g, '-').replace(/\s+/g, '').replace(/,/g, '');
  if (!s) return null;
  const sci = /^([-+]?\d*\.?\d+)(?:[x×*]10\^?([-+]?\d+))$/i.exec(s);
  if (sci) return Number(sci[1]) * 10 ** Number(sci[2]);
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return null;
  return Number(s);
}

/** The mantissa as typed, without sign or exponent. */
function mantissa(raw: string): string {
  return raw.trim().replace(/[−–+-]/g, '').replace(/\s+/g, '').split(/[eE]|[x×*]10/)[0];
}

/** Significant figures as typed: [least, most]. Trailing zeros without a decimal point are ambiguous. */
export function sigFigs(raw: string): [number, number] {
  const m = mantissa(raw);
  const digits = m.replace('.', '').replace(/^0+/, '');
  if (!digits) return [1, 1];
  if (m.includes('.')) return [digits.length, digits.length];
  const trimmed = digits.replace(/0+$/, '');
  return [Math.max(1, trimmed.length), digits.length];
}

export function decimals(raw: string): number {
  const m = mantissa(raw);
  const i = m.indexOf('.');
  return i < 0 ? 0 : m.length - i - 1;
}

/** Size of one unit in the last place the answer should show. */
export function lastPlace(x: number, r: Rounding): number {
  if (r.dp != null) return 10 ** -r.dp;
  if (!x) return 10 ** -((r.sig ?? 3) - 1);
  return 10 ** (Math.floor(Math.log10(Math.abs(x))) - (r.sig ?? 3) + 1);
}

export function roundTo(x: number, r: Rounding): number {
  const step = lastPlace(x, r);
  return Math.round(x / step) * step;
}

/** The expected answer as text, e.g. "26.3" or "0.5". */
export function formatAnswer(x: number, r: Rounding): string {
  if (r.dp != null) return roundTo(x, r).toFixed(r.dp);
  if (!x) return '0';
  const v = roundTo(x, r);
  const places = Math.max(0, -Math.floor(Math.log10(lastPlace(x, r)) + 1e-9));
  return Math.abs(v) >= 1e6 || Math.abs(v) < 1e-3 ? v.toExponential((r.sig ?? 3) - 1) : v.toFixed(places);
}

export type Verdict =
  | { kind: 'ok' }
  /** the right value, rounded wrong: not counted as a miss */
  | { kind: 'rounding'; msg: string }
  | { kind: 'trap'; msg: string }
  | { kind: 'close'; msg: string }
  | { kind: 'wrong' }
  | { kind: 'invalid'; msg: string };

/**
 * Grade one numeric answer. It's right if it lands within one unit in the last
 * place of the rounded answer (molar masses differ slightly between tables) and
 * is rounded as asked.
 */
export function checkNumber(raw: string, part: NumberPart, v: Vars): Verdict {
  const x = parseNumber(raw);
  if (x == null) return { kind: 'invalid', msg: 'That isn’t a number I can read. Try something like 26.4 or 2.64e1.' };
  const exact = part.answer(v);
  const r = part.round;
  const step = lastPlace(exact, r);
  const target = roundTo(exact, r);
  const within = (a: number, b: number) => Math.abs(a - b) <= step * 1.001;
  if (Math.abs(target) < step / 2) {
    // an answer of zero: any way of writing zero is fine
    if (Math.abs(x) <= step * 1.001) return { kind: 'ok' };
  } else if (within(x, target) || within(x, exact)) {
    if (r.sig != null) {
      const [lo, hi] = sigFigs(raw);
      if (r.sig < lo || r.sig > hi) return { kind: 'rounding', msg: `Right value, but round it to ${r.sig} significant figure${r.sig > 1 ? 's' : ''}.` };
    } else if (r.dp != null && decimals(raw) !== r.dp) {
      return { kind: 'rounding', msg: r.dp ? `Right value, but give it to the nearest ${formatAnswer(10 ** -r.dp, { dp: r.dp })}.` : 'Right value, but round it to a whole number.' };
    }
    return { kind: 'ok' };
  }
  for (const t of part.traps?.(v) ?? []) {
    const ts = lastPlace(t.value, r);
    if (Math.abs(x - t.value) <= ts * 1.5) return { kind: 'trap', msg: t.msg };
  }
  if (exact && Math.abs(x - exact) / Math.abs(exact) < 0.03) return { kind: 'close', msg: 'Very close. Check your molar masses, and don’t round until the last step.' };
  return { kind: 'wrong' };
}
