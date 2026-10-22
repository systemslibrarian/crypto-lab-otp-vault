import { describe, expect, it } from 'vitest';
import { BIASED_PAD, freshPadPosterior, priorDistribution, reusedPadPosterior, UNIFORM_PAD } from './prior.ts';
import { format } from './rational.ts';

const strings = (probabilities: ReturnType<typeof priorDistribution>) => probabilities.map(format);

describe('exact prior versus posterior, two-bit XOR example', () => {
  it('keeps every nonuniform prior unchanged under each ciphertext with a fresh uniform pad', () => {
    for (const prior of [[8n,4n,2n,1n], [1n,99n,1n,17n], [5n,5n,5n,5n]]) {
      for (let c = 0; c < 4; c++) {
        expect(strings(freshPadPosterior(prior, UNIFORM_PAD, c))).toEqual(strings(priorDistribution(prior)));
        // Independently count the event C=c by enumerating each of four equally likely keys.
        const rawMasses = prior.map((p, m) => p * BigInt([0,1,2,3].filter(k => (m ^ k) === c).length));
        expect(rawMasses).toEqual(prior);
      }
    }
  });

  it('shows the changed posterior for a biased fresh pad without claiming uniform messages', () => {
    const prior = [8n,4n,2n,1n];
    expect(strings(priorDistribution(prior))).toEqual(['8/15','4/15','2/15','1/15']);
    expect(strings(freshPadPosterior(prior, BIASED_PAD, 0))).toEqual(['32/39','4/39','2/39','1/39']);
    for (let c = 0; c < 4; c++) {
      const enumerated = prior.map((p, m) => p * BIASED_PAD[c ^ m]);
      const total = enumerated.reduce((a,b) => a + b,0n);
      const post = freshPadPosterior(prior, BIASED_PAD, c);
      post.forEach((fraction, m) => expect(fraction.n * total).toBe(enumerated[m] * fraction.d));
    }
  });

  it('uses a known first plaintext/ciphertext to pinpoint the second message only on reuse', () => {
    const prior = [8n,4n,2n,1n];
    for (let p1=0;p1<4;p1++) for (let c1=0;c1<4;c1++) for (let c2=0;c2<4;c2++) {
      const pad = p1 ^ c1;
      const target = c2 ^ pad;
      const expected = [0,1,2,3].map(m => m === target ? '1' : '0');
      expect(strings(reusedPadPosterior(prior,p1,c1,c2))).toEqual(expected);
      expect(target ^ pad).toBe(c2);
    }
    expect(strings(reusedPadPosterior(prior,0,0,0))).toEqual(['1','0','0','0']);
  });

  it('refuses impossible or malformed priors, key masses, and observations', () => {
    expect(() => priorDistribution([8n,4n,0n,1n])).toThrow('FOUR_POSITIVE_PRIOR_WEIGHTS_REQUIRED');
    expect(() => priorDistribution([8n,4n])).toThrow('FOUR_POSITIVE_PRIOR_WEIGHTS_REQUIRED');
    expect(() => freshPadPosterior([1n,1n,1n,1n],[0n,0n,0n,0n],0)).toThrow('FOUR_NONNEGATIVE_PAD_WEIGHTS_REQUIRED');
    expect(() => freshPadPosterior([1n,1n,1n,1n],[1n,0n,0n,0n],1.5)).toThrow('TWO_BIT_VALUE_REQUIRED');
    expect(() => reusedPadPosterior([1n,1n,1n,1n],0,0,4)).toThrow('TWO_BIT_VALUE_REQUIRED');
  });
});
