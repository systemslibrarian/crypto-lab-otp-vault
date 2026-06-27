import type { Bytes, Offset } from "./types.ts";
import { isPrintable } from "./types.ts";
import { xorWindow } from "./xor.ts";

// The two-time-pad attack. This module is deliberately NOT OTP-specific: it
// works on ANY two equal-length ciphertext byte arrays, so a future "import two
// same-nonce ChaCha20 / AES-CTR ciphertexts" feature can reuse it unchanged.

/**
 * Form the combined strip C1 XOR C2. When the same keystream encrypts both
 * messages, the key cancels and this equals P1 XOR P2 exactly.
 *
 * keystream-reuse extension point: any two ciphertexts produced under the same
 * keystream (OTP key reuse, ChaCha20/AES-CTR nonce reuse) combine here the same
 * way — the function does not care where the bytes came from.
 */
export function combineCiphertexts(c1: Bytes, c2: Bytes): Bytes {
  // Only the overlapping prefix is attackable; the tail of the longer
  // ciphertext has no counterpart to cancel against and stays secret.
  const n = Math.min(c1.length, c2.length);
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = c1[i] ^ c2[i];
  }
  return out;
}

/** The result of placing a crib at one offset on the combined strip. */
export interface CribHit {
  offset: Offset;
  /** crib XOR strip[offset..] — the other plaintext's bytes at this position. */
  revealed: Bytes;
  /** Fraction (0..1) of revealed bytes that are printable ASCII. */
  printableRatio: number;
  /** True if every revealed byte is printable — a strong "looks like text" cue. */
  allPrintable: boolean;
}

/**
 * The set of valid offsets for a crib over a strip: every position where the
 * crib fits fully inside the strip. Partial-overlap offsets are excluded so we
 * never read out of bounds.
 */
export function validOffsets(stripLength: number, cribLength: number): Offset[] {
  if (cribLength === 0 || cribLength > stripLength) return [];
  const offsets: Offset[] = [];
  for (let i = 0; i + cribLength <= stripLength; i++) offsets.push(i);
  return offsets;
}

/** Reveal the other plaintext's bytes for a single crib placement. */
export function revealAt(strip: Bytes, crib: Bytes, offset: Offset): CribHit {
  const revealed = xorWindow(crib, strip, offset);
  let printableCount = 0;
  for (const b of revealed) if (isPrintable(b)) printableCount++;
  const printableRatio = revealed.length === 0 ? 0 : printableCount / revealed.length;
  return {
    offset,
    revealed,
    printableRatio,
    allPrintable: printableCount === revealed.length && revealed.length > 0,
  };
}

/**
 * Drag a crib across every valid offset of the strip. Returns one CribHit per
 * offset. The math is honest: a wrong guess yields non-printable noise, a right
 * guess yields legible text — we do not snap or fake-confirm anything.
 */
export function dragCrib(strip: Bytes, crib: Bytes): CribHit[] {
  return validOffsets(strip.length, crib.length).map((offset) =>
    revealAt(strip, crib, offset),
  );
}

/**
 * Rank offsets by how text-like the revealed bytes are (most printable first).
 * A ranking heuristic for the UI only — it never auto-confirms a guess.
 */
export function rankByPrintability(hits: CribHit[]): CribHit[] {
  return [...hits].sort((a, b) => b.printableRatio - a.printableRatio);
}

/**
 * Reconstruction state: as the user confirms cribs, known bytes accumulate in
 * BOTH plaintexts simultaneously. `p1` holds confirmed bytes of plaintext 1,
 * `p2` of plaintext 2; `known[i]` marks whether position i is solved.
 */
export interface Reconstruction {
  length: number;
  p1: Uint8Array;
  p2: Uint8Array;
  known: boolean[];
}

export function emptyReconstruction(length: number): Reconstruction {
  return {
    length,
    p1: new Uint8Array(length),
    p2: new Uint8Array(length),
    known: new Array(length).fill(false),
  };
}

/**
 * Pin a confirmed crib at an offset. The crib IS one plaintext's bytes there;
 * XORing it into the strip reveals the OTHER plaintext's bytes — so confirming
 * one crib fixes a stretch of BOTH messages at once.
 *
 * `cribIsP1` says which message the crib belongs to (the chip can target either
 * P1 or P2). Returns a new Reconstruction; does not mutate the input.
 */
export function pinCrib(
  recon: Reconstruction,
  strip: Bytes,
  crib: Bytes,
  offset: Offset,
  cribIsP1: boolean,
): Reconstruction {
  const revealed = xorWindow(crib, strip, offset); // the other plaintext here
  const next: Reconstruction = {
    length: recon.length,
    p1: recon.p1.slice(),
    p2: recon.p2.slice(),
    known: recon.known.slice(),
  };
  for (let i = 0; i < crib.length; i++) {
    const pos = offset + i;
    if (cribIsP1) {
      next.p1[pos] = crib[i];
      next.p2[pos] = revealed[i];
    } else {
      next.p2[pos] = crib[i];
      next.p1[pos] = revealed[i];
    }
    next.known[pos] = true;
  }
  return next;
}
