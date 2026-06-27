import type { Bytes } from "./types.ts";

// Hand-rolled byte-wise XOR. This is the entire mathematical core of the
// one-time pad — no library, no abstraction, so every byte is inspectable.

/**
 * XOR two equal-length byte arrays, byte by byte.
 * Throws on length mismatch: an OTP key must be exactly as long as the message,
 * and silently truncating would hide the very mistake this lab teaches.
 */
export function xorEqual(a: Bytes, b: Bytes): Bytes {
  if (a.length !== b.length) {
    throw new Error(
      `xorEqual: length mismatch (${a.length} vs ${b.length}); OTP requires equal lengths`,
    );
  }
  const out = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) {
    out[i] = a[i] ^ b[i];
  }
  return out;
}

/**
 * XOR a crib against the window of `strip` starting at `offset`.
 * Returns the revealed bytes (crib XOR window). Used by crib-dragging:
 * given strip = P1⊕P2, this yields the OTHER plaintext at that position.
 * Throws if the crib would read past the end of the strip (no out-of-bounds).
 */
export function xorWindow(crib: Bytes, strip: Bytes, offset: number): Bytes {
  if (offset < 0 || offset + crib.length > strip.length) {
    throw new Error(
      `xorWindow: crib of length ${crib.length} at offset ${offset} exceeds strip length ${strip.length}`,
    );
  }
  const out = new Uint8Array(crib.length);
  for (let i = 0; i < crib.length; i++) {
    out[i] = crib[i] ^ strip[offset + i];
  }
  return out;
}
