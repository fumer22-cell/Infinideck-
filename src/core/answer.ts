import { stripHtml } from '../import/html';

/** Lowercase, strip accents, punctuation and extra spaces. */
export function normalizeAnswer(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function distance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

/** The acceptable answers on a card's back: the whole text, and each part split by , ; / or "or". */
export function acceptedAnswers(backHtml: string): string[] {
  const text = stripHtml(backHtml).replace(/\([^)]*\)/g, ' ');
  const whole = normalizeAnswer(text);
  const parts = text
    .split(/[\n,;/]|\bor\b/i)
    .map(normalizeAnswer)
    .filter(Boolean);
  return [...new Set([whole, ...parts])].filter(Boolean);
}

export interface AnswerCheck {
  correct: boolean;
  /** correct apart from a small typo */
  close: boolean;
  expected: string;
}

/** Compare a typed answer to the card's back. A one-letter slip on answers of 5+ letters still counts. */
export function checkAnswer(typed: string, backHtml: string): AnswerCheck {
  const t = normalizeAnswer(typed);
  const accepted = acceptedAnswers(backHtml);
  const expected = stripHtml(backHtml).trim();
  if (!t) return { correct: false, close: false, expected };
  if (accepted.includes(t)) return { correct: true, close: false, expected };
  const close = accepted.some((a) => a.length >= 5 && distance(a, t) <= 1);
  return { correct: close, close, expected };
}
