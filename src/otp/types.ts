// Shared types for the OTP lab. Everything operates on raw bytes (Uint8Array)
// because the one-time pad is defined over bytes, not characters — a single
// emoji is several UTF-8 bytes, and the XOR happens on those bytes.

/** A sequence of raw bytes — the universal currency of this demo. */
export type Bytes = Uint8Array;

/**
 * This teaching UI renders one DOM column per byte, often in several parallel
 * strips. Keep user-supplied exhibits bounded so a paste cannot freeze the tab.
 * The crypto helpers themselves remain usable for larger byte arrays.
 */
export const MAX_DEMO_BYTES = 512;

/** A crib is a guessed fragment of plaintext, carried as its UTF-8 bytes. */
export type Crib = Bytes;

/** A zero-based byte offset into a strip. */
export type Offset = number;

/**
 * One byte's classification for honest rendering. We never "snap" or beautify
 * crib-drag output: a printable ASCII byte shows as its glyph, everything else
 * shows as a visible marker so a wrong guess plainly looks like garbage.
 */
export interface ByteView {
  /** The raw byte value 0..255. */
  value: number;
  /** True for printable ASCII (0x20..0x7e). */
  printable: boolean;
  /** What to display: the glyph for printables, "·" otherwise. */
  glyph: string;
  /** Two-digit hex, always available for the aligned hex row. */
  hex: string;
}

/** Printable ASCII is the visible range 0x20 (space) .. 0x7e (~). */
export function isPrintable(byte: number): boolean {
  return byte >= 0x20 && byte <= 0x7e;
}

/** Two-lowercase-hex-digit representation of a byte. */
export function toHex(byte: number): string {
  return byte.toString(16).padStart(2, "0");
}

/** Space-separated lowercase hex for a whole byte array. */
export function bytesToHex(bytes: Bytes): string {
  return Array.from(bytes, (b) => toHex(b)).join(" ");
}

/**
 * Parse a hex string into bytes. Tolerant of whitespace, commas, and an
 * optional 0x prefix. Returns null on any non-hex character or odd digit count
 * so callers can show a precise validation error instead of crashing.
 */
function normalizeHex(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed.length === 0) return "";

  // A prefix is optional at the start of each separated token. Do not remove
  // embedded `0x` text: accepting `aa0xbb` as `aabb` would silently reinterpret
  // malformed imported ciphertext.
  // Preserve the previous parser's harmless tolerance for leading/trailing
  // separators while still treating a prefix inside a token as malformed.
  const tokens = trimmed.split(/[\s,]+/).filter((token) => token.length > 0);
  const digits: string[] = [];
  for (const token of tokens) {
    const value = token.replace(/^0x/i, "");
    if (value.length === 0 || !/^[0-9a-fA-F]+$/.test(value)) return null;
    digits.push(value);
  }
  const cleaned = digits.join("");
  return cleaned.length % 2 === 0 ? cleaned : null;
}

/** Validate hex without allocating its byte array, for UI size checks. */
export function hexByteLength(input: string): number | null {
  const cleaned = normalizeHex(input);
  return cleaned === null ? null : cleaned.length / 2;
}

export function parseHex(input: string): Bytes | null {
  const cleaned = normalizeHex(input);
  if (cleaned === null) return null;
  if (cleaned.length === 0) return new Uint8Array(0);
  const out = new Uint8Array(cleaned.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(cleaned.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/** Build a ByteView for honest, non-snapping display of a single byte. */
export function viewByte(byte: number): ByteView {
  const printable = isPrintable(byte);
  return {
    value: byte,
    printable,
    glyph: printable ? String.fromCharCode(byte) : "·",
    hex: toHex(byte),
  };
}
