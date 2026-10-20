/** Exact fractions: no floating-point probabilities or tolerance comparisons. */
export interface Rational { n: bigint; d: bigint }
export function rational(n: bigint, d = 1n): Rational {
  if (d === 0n) throw new Error('ZERO_DENOMINATOR');
  if (d < 0n) { n = -n; d = -d; }
  let a = n < 0n ? -n : n, b = d;
  while (b) [a, b] = [b, a % b];
  return { n: n / a, d: d / a };
}
export const add = (a: Rational, b: Rational): Rational => rational(a.n*b.d+b.n*a.d,a.d*b.d);
export const multiply = (a: Rational, b: Rational): Rational => rational(a.n*b.n,a.d*b.d);
export const compare = (a: Rational, b: Rational): number => a.n*b.d < b.n*a.d ? -1 : a.n*b.d > b.n*a.d ? 1 : 0;
export const format = (a: Rational): string => a.d === 1n ? String(a.n) : `${a.n}/${a.d}`;
