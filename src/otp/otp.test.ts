import { describe, it, expect } from "vitest";
import { xorEqual, xorWindow } from "./xor.ts";
import {
  encrypt,
  decrypt,
  generateKey,
  deriveKey,
  textToBytes,
  bytesToText,
} from "./otp.ts";
import {
  combineCiphertexts,
  dragCrib,
  revealAt,
  validOffsets,
  emptyReconstruction,
  pinCrib,
} from "./cribdrag.ts";
import { isPrintable } from "./types.ts";

function randomBytes(n: number): Uint8Array {
  const b = new Uint8Array(n);
  for (let i = 0; i < n; i++) b[i] = Math.floor(Math.random() * 256);
  return b;
}

describe("xor", () => {
  it("xorEqual throws on length mismatch", () => {
    expect(() => xorEqual(new Uint8Array(3), new Uint8Array(4))).toThrow();
  });

  it("xorWindow rejects out-of-bounds offsets", () => {
    const strip = new Uint8Array(4);
    expect(() => xorWindow(new Uint8Array(3), strip, 2)).toThrow();
    expect(() => xorWindow(new Uint8Array(2), strip, -1)).toThrow();
  });
});

describe("OTP correctness (invariant 1)", () => {
  it("decrypt(encrypt(m,k),k) === m for random byte inputs (property test)", () => {
    for (let trial = 0; trial < 500; trial++) {
      const len = Math.floor(Math.random() * 64);
      const m = randomBytes(len);
      const k = generateKey(len);
      const c = encrypt(m, k);
      const back = decrypt(c, k);
      expect(back).toEqual(m);
    }
  });

  it("key length always equals message length", () => {
    for (let len = 0; len < 20; len++) {
      const k = generateKey(len);
      expect(k.length).toBe(len);
    }
  });
});

describe("Perfect secrecy", () => {
  it("for fixed c, any chosen p yields a valid key k = c^p with c^k === p", () => {
    const c = randomBytes(16);
    for (let trial = 0; trial < 200; trial++) {
      const p = randomBytes(16);
      const k = deriveKey(c, p);
      // The derived key really turns this ciphertext into the chosen plaintext.
      expect(decrypt(c, k)).toEqual(p);
    }
  });
});

describe("Two-time-pad key cancellation (invariant 3)", () => {
  it("C1^C2 === P1^P2 when the key is reused", () => {
    const p1 = randomBytes(32);
    const p2 = randomBytes(32);
    const key = generateKey(32);
    const c1 = encrypt(p1, key);
    const c2 = encrypt(p2, key);
    expect(combineCiphertexts(c1, c2)).toEqual(xorEqual(p1, p2));
  });

  it("unequal-length messages: only the overlapping prefix combines", () => {
    const p1 = randomBytes(40);
    const p2 = randomBytes(25);
    const key = generateKey(40);
    const c1 = encrypt(p1, key);
    const c2 = encrypt(p2, key.slice(0, 25));
    const combined = combineCiphertexts(c1, c2);
    expect(combined.length).toBe(25);
    expect(combined).toEqual(xorEqual(p1.slice(0, 25), p2));
  });
});

describe("Crib-drag correctness (invariant 4)", () => {
  it("at the true offset, crib^(P1^P2)window === the other plaintext exactly", () => {
    const p1 = textToBytes("the quick brown fox jumps over the lazy dog");
    const p2 = textToBytes("pack my box with five dozen liquor jugs!!!!");
    expect(p1.length).toBe(p2.length);
    const key = generateKey(p1.length);
    const strip = combineCiphertexts(encrypt(p1, key), encrypt(p2, key));

    // Crib "the" belongs to P1 at offset 0; revealing should give P2's bytes.
    const crib = textToBytes("the");
    const hit = revealAt(strip, crib, 0);
    expect(hit.revealed).toEqual(p2.slice(0, 3));
    expect(bytesToText(hit.revealed)).toBe("pac");
  });

  it("wrong offsets do not reproduce real plaintext bytes", () => {
    const p1 = textToBytes("attack at dawn, hold the north ridge ok");
    const p2 = textToBytes("retreat now, regroup behind the river!!!");
    const len = Math.min(p1.length, p2.length);
    const key = generateKey(len);
    const strip = combineCiphertexts(
      encrypt(p1.slice(0, len), key),
      encrypt(p2.slice(0, len), key),
    );
    const crib = textToBytes("attack");
    const all = dragCrib(strip, crib);
    // The true offset (0) reproduces P2's prefix; a different offset must not.
    const atZero = all.find((h) => h.offset === 0)!;
    const atFive = all.find((h) => h.offset === 5)!;
    expect(atZero.revealed).toEqual(p2.slice(0, 6));
    expect(atFive.revealed).not.toEqual(p2.slice(5, 11));
  });

  it("validOffsets never allows the crib to read past the strip", () => {
    expect(validOffsets(5, 3)).toEqual([0, 1, 2]);
    expect(validOffsets(3, 5)).toEqual([]);
    expect(validOffsets(4, 0)).toEqual([]);
  });
});

describe("No-reuse case (edge case)", () => {
  it("two independent keys: C1^C2 does not reveal either plaintext", () => {
    const p1 = textToBytes("the quick brown fox jumps over xx");
    const p2 = textToBytes("pack my box with five dozen jugs!");
    const len = Math.min(p1.length, p2.length);
    const k1 = generateKey(len);
    const k2 = generateKey(len); // independent fresh key — the correct behavior
    const strip = combineCiphertexts(
      encrypt(p1.slice(0, len), k1),
      encrypt(p2.slice(0, len), k2),
    );
    const crib = textToBytes("the");
    // Revealing at the true P1 offset should NOT yield P2's bytes anymore.
    const hit = revealAt(strip, crib, 0);
    expect(hit.revealed).not.toEqual(p2.slice(0, 3));
  });
});

describe("UTF-8 byte handling (edge case)", () => {
  it("multi-byte chars expand correctly and round-trip", () => {
    const text = "café 🔐 over";
    const bytes = textToBytes(text);
    expect(bytes.length).toBeGreaterThan([...text].length); // bytes > code points
    const key = generateKey(bytes.length);
    const restored = bytesToText(decrypt(encrypt(bytes, key), key));
    expect(restored).toBe(text);
  });

  it("a single emoji is several bytes", () => {
    expect(textToBytes("🔐").length).toBe(4);
  });
});

describe("Reconstruction: pinning a crib fixes BOTH plaintexts", () => {
  it("pinning crib as P1 fills P1 with the crib and P2 with the reveal", () => {
    const p1 = textToBytes("meet me at the old mill at midnight ok");
    const p2 = textToBytes("bring the documents and tell no one!!!");
    const len = Math.min(p1.length, p2.length);
    const key = generateKey(len);
    const strip = combineCiphertexts(
      encrypt(p1.slice(0, len), key),
      encrypt(p2.slice(0, len), key),
    );
    let recon = emptyReconstruction(len);
    const crib = textToBytes("meet");
    recon = pinCrib(recon, strip, crib, 0, /* cribIsP1 */ true);
    expect(recon.p1.slice(0, 4)).toEqual(p1.slice(0, 4));
    expect(recon.p2.slice(0, 4)).toEqual(p2.slice(0, 4));
    expect(recon.known.slice(0, 4)).toEqual([true, true, true, true]);
    expect(recon.known[4]).toBe(false);
  });
});

describe("isPrintable classification", () => {
  it("flags printable ASCII range", () => {
    expect(isPrintable(0x20)).toBe(true);
    expect(isPrintable(0x7e)).toBe(true);
    expect(isPrintable(0x1f)).toBe(false);
    expect(isPrintable(0x7f)).toBe(false);
  });
});
