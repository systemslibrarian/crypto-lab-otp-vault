// Shared types for the OTP lab. Everything operates on raw bytes (Uint8Array)
// because the one-time pad is defined over bytes, not characters — a single
// emoji is several UTF-8 bytes, and the XOR happens on those bytes.

/** A sequence of raw bytes — the universal currency of this demo. */
export type Bytes = Uint8Array;

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
