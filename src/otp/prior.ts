import { rational, type Rational } from './rational.ts';

/** Four two-bit messages and four two-bit XOR pad values. Masses are exact counts. */
function validatePrior(prior: readonly bigint[]): void {
  if (prior.length !== 4 || prior.some(x => typeof x !== 'bigint' || x <= 0n)) {
    throw new Error('FOUR_POSITIVE_PRIOR_WEIGHTS_REQUIRED');
  }
}
function validateByte2(value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > 3) throw new Error('TWO_BIT_VALUE_REQUIRED');
}
export function priorDistribution(prior: readonly bigint[]): Rational[] {
  validatePrior(prior);
  const total = prior.reduce((a, b) => a + b, 0n);
  return prior.map(w => rational(w, total));
}

/** Bayes' rule, enumerated for c = m XOR k, independent M and freshly drawn K. */
export function freshPadPosterior(
  prior: readonly bigint[], keyWeights: readonly bigint[], ciphertext: number,
): Rational[] {
  validatePrior(prior);
  validateByte2(ciphertext);
  if (keyWeights.length !== 4 || keyWeights.some(w => typeof w !== 'bigint' || w < 0n)
      || keyWeights.every(w => w === 0n)) throw new Error('FOUR_NONNEGATIVE_PAD_WEIGHTS_REQUIRED');
  const masses = prior.map((weight, m) => weight * keyWeights[ciphertext ^ m]);
  const total = masses.reduce((a, b) => a + b, 0n);
  if (total === 0n) throw new Error('IMPOSSIBLE_CIPHERTEXT');
  return masses.map(w => rational(w, total));
}

/** Known P₁,C₁ reveal the reused two-bit pad; M₂ = C₂ XOR P₁ XOR C₁. */
export function reusedPadPosterior(
  prior: readonly bigint[], firstPlaintext: number, firstCiphertext: number, secondCiphertext: number,
): Rational[] {
  validatePrior(prior);
  [firstPlaintext, firstCiphertext, secondCiphertext].forEach(validateByte2);
  const message = secondCiphertext ^ firstPlaintext ^ firstCiphertext;
  return prior.map((_, m) => rational(m === message ? 1n : 0n));
}

export const UNIFORM_PAD = [1n, 1n, 1n, 1n] as const;
export const BIASED_PAD = [4n, 1n, 1n, 1n] as const;
