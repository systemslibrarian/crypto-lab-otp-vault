import { el, statusLine } from './dom.ts';
import { BIASED_PAD, freshPadPosterior, priorDistribution, reusedPadPosterior, UNIFORM_PAD } from '../otp/prior.ts';
import { compare, format } from '../otp/rational.ts';

/** A tiny, exact conditional-probability exhibit alongside the 256-byte key-space panel. */
export function priorComparison(): HTMLElement {
  const weights = [8, 4, 2, 1].map((w, m) => el('input', {
    id: `prior-weight-${m}`, type: 'number', min: 1, max: 99, step: 1, value: w,
    'aria-label': `Prior weight for message ${m}`,
  }));
  const observed = el('select', { id: 'prior-cipher', 'aria-label': 'Observed second ciphertext' },
    [0, 1, 2, 3].map(c => el('option', { value: c, text: String(c) })));
  const result = el('div', { id: 'prior-result', role: 'status', 'aria-live': 'polite' });

  function render(): void {
    result.replaceChildren();
    const valid = weights.every(input => /^(?:[1-9]|[1-9]\d)$/.test(input.value));
    weights.forEach(input => input.setAttribute('aria-invalid', String(!/^(?:[1-9]|[1-9]\d)$/.test(input.value))));
    if (!valid) {
      result.append(statusLine('✕', 'Each prior weight must be a whole number from 1 to 99. Old results cleared.', 'danger'));
      return;
    }
    const prior = weights.map(input => BigInt(input.value));
    const c = Number(observed.value);
    const before = priorDistribution(prior);
    const oneUse = freshPadPosterior(prior, UNIFORM_PAD, c);
    const biased = freshPadPosterior(prior, BIASED_PAD, c);
    const reused = reusedPadPosterior(prior, 0, 0, c);
    const table = el('table', { id: 'prior-table' }, [
      el('caption', { text: `Exact probabilities for observed second ciphertext C₂ = ${c}; each row is a possible two-bit message.` }),
      el('thead', {}, [el('tr', {}, ['Message M₂', 'Prior Pr[M₂]', 'Uniform fresh pad', 'Biased fresh pad', 'Reused known pad'].map(label => el('th', { scope: 'col', text: label })))]),
      el('tbody', {}, before.map((p, m) => el('tr', {}, [
        el('th', { scope: 'row', text: String(m) }),
        ...[p, oneUse[m], biased[m], reused[m]].map((value, column) =>
          el('td', { 'data-message': m, 'data-scenario': ['prior', 'uniform', 'biased', 'reused'][column], text: format(value) })),
      ]))),
    ]);
    const unchanged = oneUse.every((p, m) => compare(p, before[m]) === 0);
    const changed = biased.some((p, m) => compare(p, before[m]) !== 0);
    result.append(
      el('div', { class: 'limits-scroll', role: 'region', tabindex: 0, 'aria-label': 'Prior and posterior probability table' }, [table]),
      statusLine('✓', `Fresh uniform one-time pad: posterior ${unchanged ? 'equals' : 'does not equal'} the prior for every message. The ciphertext has not changed the odds.`, unchanged ? 'calm' : 'danger'),
      statusLine('✕', `Biased fresh pad: posterior ${changed ? 'differs' : 'does not differ'} from the prior. Key 0 has four times each other key’s weight.`, changed ? 'danger' : 'calm'),
      statusLine('✕', `Reused pad after known P₁ = 0, C₁ = 0: K = 0. Seeing C₂ = ${c} then pins M₂ = ${c}; this is a separate known-plaintext, two-encryption attack.`, 'danger'),
    );
  }
  weights.forEach(input => input.addEventListener('input', render));
  observed.addEventListener('change', render);
  const inputRows = el('div', { class: 'prior-controls' }, weights.map((input, i) =>
    el('label', { for: input.id, text: `Message ${i} weight` }, [input])));
  render();
  return el('div', { id: 'prior-comparison' }, [
    el('h3', { text: 'D · Prior odds and what a ciphertext changes' }),
    el('p', { text: 'A secret message need not be equally likely to be 0, 1, 2, or 3. Enter positive prior weights and observe a two-bit ciphertext. The table applies Bayes’ rule exactly: Pr[M = m | C = c] is proportional to Pr[M = m] × Pr[K = c XOR m]. A fresh, independent uniform pad keeps your prior odds; it does not make the messages equally likely.' }),
    inputRows,
    el('label', { for: 'prior-cipher', class: 'field-label', text: 'Observed ciphertext C₂ (two-bit value)' }), observed,
    el('p', { class: 'help', text: 'Fresh uniform: key weights (1, 1, 1, 1). Fresh biased: key weights (4, 1, 1, 1). Reuse: a first known plaintext/ciphertext pair P₁ = 0, C₁ = 0 reveals K = 0 before a second encryption; the second message is independent of that first known message. All four prior weights must be positive so every displayed observation is possible. These are tiny XOR models, not estimates from sampled ciphertexts.' }),
    result,
    el('p', { class: 'help' }, [
      'Source: ',
      el('a', { href: 'https://crypto.stanford.edu/~dabo/cryptobook/BonehShoup_0_6.pdf', text: 'Boneh and Shoup, A Graduate Course in Applied Cryptography, version 0.6 (January 2023), §2.1.2' }),
      '. The finite biased-pad and known-plaintext reuse comparisons are this lab’s examples of the conditional-probability definition, not worked examples quoted from the book.',
    ]),
  ]);
}
