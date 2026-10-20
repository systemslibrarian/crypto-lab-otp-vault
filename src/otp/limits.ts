import { rational, type Rational } from './rational.ts';

function bits(kappa: number): void {
  if (!Number.isInteger(kappa) || kappa < 0 || kappa > 8) throw new Error('KEY_BITS_0_TO_8');
}
function byte(value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > 255) throw new Error('BYTE_REQUIRED');
}
/** Repeat the key's big-endian bit string to fill a byte; zero bits means no key. */
export function stretch(k: number, kappa: number): number {
  bits(kappa);
  if (!Number.isInteger(k) || k < 0 || k >= 2 ** kappa) throw new Error('KEY_OUT_OF_RANGE');
  if (kappa === 0) return 0;
  let out = 0;
  for (let i = 0; i < 8; i++) out = (out << 1) | ((k >> (kappa - 1 - i % kappa)) & 1);
  return out;
}
export function reachable(c: number, kappa: number): Set<number> {
  byte(c); bits(kappa);
  const messages = new Set<number>();
  for (let k = 0; k < 2 ** kappa; k++) messages.add(c ^ stretch(k, kappa));
  return messages;
}
// [extension] point: a non-uniform message prior would weight these candidates.
export function posterior(c: number, kappa: number): Rational[] {
  const candidates = reachable(c, kappa);
  return Array.from({length:256}, (_, m) => rational(candidates.has(m) ? 1n : 0n, BigInt(candidates.size)));
}
/** Enumerate every secret bit and key; a guess contributes one half-win. */
export function privKExact(m0: number, m1: number, kappa: number): Rational {
  byte(m0); byte(m1); bits(kappa);
  if (m0 === m1) throw new Error('DISTINCT_MESSAGES_REQUIRED');
  const pads = Array.from({length:2 ** kappa}, (_, k) => stretch(k, kappa));
  const image = new Set(pads);
  let halfWins = 0;
  for (const b of [0, 1]) for (const pad of pads) {
    const c = (b === 0 ? m0 : m1) ^ pad;
    const has0 = image.has(c ^ m0), has1 = image.has(c ^ m1);
    if (has0 === has1) halfWins += 1;
    else if ((has0 ? 0 : 1) === b) halfWins += 2;
  }
  return rational(BigInt(halfWins), BigInt(4 * pads.length));
}
/** K–L Example 2.8 publishes 3/4. This lab enumerates that experiment. */
export function vigenereExample28(): Rational {
  let wins = 0n, total = 0n;
  for (const b of [0, 1]) for (const period of [1, 2]) {
    for (let k0 = 0; k0 < 26; k0++) for (let k1 = 0; k1 < (period === 1 ? 1 : 26); k1++) {
      // Common denominator: period 1 has 26 keys, period 2 has 676.
      const weight = period === 1 ? 26n : 1n;
      const c0 = k0, c1 = (b + (period === 1 ? k0 : k1)) % 26;
      total += weight;
      if ((c0 === c1 ? 0 : 1) === b) wins += weight;
    }
  }
  return rational(wins, total);
}
export type Table = number[][];
/** Reading/validation is the only helper shared by the two theorem checks. */
export function readTable(table: Table, weights: bigint[]): void {
  if (table.length !== 4 || weights.length !== 4) throw new Error('FOUR_KEYS_REQUIRED');
  for (let k = 0; k < 4; k++) {
    if (table[k].length !== 4 || table[k].some(c => !Number.isInteger(c) || c < 0 || c > 3)) throw new Error(`FOUR_SYMBOLS_REQUIRED: row ${k}`);
    if (new Set(table[k]).size !== 4) throw new Error(`ROW_NOT_INVERTIBLE: row ${k}`);
    if (typeof weights[k] !== 'bigint' || weights[k] < 0n) throw new Error(`NONNEGATIVE_INTEGER_WEIGHT_REQUIRED: key ${k}`);
  }
  if (weights.every(w => w === 0n)) throw new Error('ALL_WEIGHTS_ZERO');
}
export function parseWeight(s: string): bigint {
  if (!/^\d+$/.test(s)) throw new Error('NONNEGATIVE_INTEGER_WEIGHT_REQUIRED');
  return BigInt(s);
}
/** V1: equal key probabilities and exactly one key for each (m,c). */
export function shannonConditions(table: Table, weights: bigint[]): boolean {
  readTable(table, weights);
  if (!weights.every(w => w === weights[0])) return false;
  for (let m = 0; m < 4; m++) for (let c = 0; c < 4; c++) {
    let keys = 0;
    for (let k = 0; k < 4; k++) if (table[k][m] === c) keys++;
    if (keys !== 1) return false;
  }
  return true;
}
/** V2 independently accumulates conditional ciphertext distributions. */
export function lemma25(table: Table, weights: bigint[]): boolean {
  readTable(table, weights);
  const mass = Array.from({length:4}, () => [0n, 0n, 0n, 0n]);
  for (let k = 0; k < 4; k++) for (let m = 0; m < 4; m++) mass[m][table[k][m]] += weights[k];
  // All rows have the same denominator, so compare their integer numerators.
  for (let m = 1; m < 4; m++) for (let c = 0; c < 4; c++) {
    if (mass[m][c] !== mass[0][c]) return false;
  }
  return true;
}
export const PRESETS = [
  {name:'XOR · uniform keys', table:Array.from({length:4},(_,k)=>[0,1,2,3].map(m=>m^k)), weights:[1n,1n,1n,1n]},
  {name:'XOR · biased keys', table:Array.from({length:4},(_,k)=>[0,1,2,3].map(m=>m^k)), weights:[4n,2n,2n,2n]},
  {name:'Duplicate key maps', table:[0,0,1,1].map(k=>[0,1,2,3].map(m=>m^k)), weights:[1n,1n,1n,1n]},
  {name:'Addition mod 4', table:Array.from({length:4},(_,k)=>[0,1,2,3].map(m=>(m+k)%4)), weights:[1n,1n,1n,1n]},
];
/** Exhaustive negative-claim fixture, including the uniform-message histogram. */
export function uniformCiphertextFixture(kappa: number): {roundTrips:boolean; uniformKeys:boolean; histogram:number[]; candidates:number} {
  bits(kappa);
  const histogram = Array(256).fill(0) as number[];
  const keyCounts = Array(2 ** kappa).fill(0) as number[];
  let roundTrips = true;
  for (let k = 0; k < keyCounts.length; k++) for (let m = 0; m < 256; m++) {
    const pad = stretch(k, kappa), c = m ^ pad;
    histogram[c]++; keyCounts[k]++;
    if ((c ^ pad) !== m) roundTrips = false;
  }
  return {roundTrips, uniformKeys:keyCounts.every(n=>n===keyCounts[0]),histogram,candidates:reachable(0,kappa).size};
}
