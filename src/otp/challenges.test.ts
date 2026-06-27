import { describe, it, expect } from "vitest";
import { parseHex, bytesToHex } from "./types.ts";
import { buildChallenges } from "./challenges.ts";
import { combineCiphertexts } from "./cribdrag.ts";
import { xorEqual } from "./xor.ts";
import { textToBytes } from "./otp.ts";

describe("hex parse/format", () => {
  it("round-trips bytes through hex", () => {
    const bytes = new Uint8Array([0x00, 0x0f, 0xa1, 0xff, 0x42]);
    expect(parseHex(bytesToHex(bytes))).toEqual(bytes);
  });

  it("tolerates whitespace, commas, and 0x prefixes", () => {
    expect(parseHex("0x3f, a1  09\n0xff")).toEqual(new Uint8Array([0x3f, 0xa1, 0x09, 0xff]));
  });

  it("rejects odd-length and non-hex input", () => {
    expect(parseHex("abc")).toBeNull(); // odd digits
    expect(parseHex("zz")).toBeNull(); // not hex
    expect(parseHex("")).toEqual(new Uint8Array(0)); // empty is valid-empty
  });
});

describe("challenge datasets", () => {
  const set = buildChallenges();

  it("provides easy/medium/hard plus a no-reuse control", () => {
    expect(set.map((c) => c.difficulty).sort()).toEqual(["control", "easy", "hard", "medium"]);
  });

  it("reused challenges satisfy C1^C2 === P1^P2 over the overlap", () => {
    for (const ch of set.filter((c) => c.reused)) {
      const c1 = parseHex(ch.c1Hex)!;
      const c2 = parseHex(ch.c2Hex)!;
      const overlap = Math.min(c1.length, c2.length);
      const expected = xorEqual(ch.truth.p1.slice(0, overlap), ch.truth.p2.slice(0, overlap));
      expect(combineCiphertexts(c1, c2)).toEqual(expected);
    }
  });

  it("the no-reuse control does NOT leak P1^P2 (attack fails)", () => {
    const ch = set.find((c) => !c.reused)!;
    const c1 = parseHex(ch.c1Hex)!;
    const c2 = parseHex(ch.c2Hex)!;
    const overlap = Math.min(c1.length, c2.length);
    const leaked = xorEqual(ch.truth.p1.slice(0, overlap), ch.truth.p2.slice(0, overlap));
    expect(combineCiphertexts(c1, c2)).not.toEqual(leaked);
  });

  it("a reused challenge is solvable: pinning the true P1 prefix reveals P2", () => {
    const ch = set.find((c) => c.id === "easy")!;
    const strip = combineCiphertexts(parseHex(ch.c1Hex)!, parseHex(ch.c2Hex)!);
    const crib = ch.truth.p1.slice(0, 8); // first 8 bytes of P1
    const revealed = xorEqual(crib, strip.slice(0, 8));
    expect(revealed).toEqual(ch.truth.p2.slice(0, 8));
    // sanity: it is really the start of "please ..."
    expect(textToBytes("please b")).toEqual(revealed);
  });
});
