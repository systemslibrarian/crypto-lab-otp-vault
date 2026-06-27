import type { Bytes } from "./types.ts";
import { xorEqual } from "./xor.ts";

// The one-time pad itself: encrypt is XOR with a fresh random key as long as
// the message; decrypt is the same XOR (XOR is its own inverse). Key material
// comes from the CSPRNG and lives only in memory — never persisted.

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** UTF-8 encode text to bytes. A 1-char emoji becomes several bytes. */
export function textToBytes(text: string): Bytes {
  return encoder.encode(text);
}

/** UTF-8 decode bytes back to text (lossy for non-UTF-8 byte soup, by design). */
export function bytesToText(bytes: Bytes): string {
  return decoder.decode(bytes);
}

/**
 * Generate a fresh cryptographically-random key of exactly `length` bytes.
 * This is the correct OTP path: one fresh key per message, never reused.
 */
export function generateKey(length: number): Bytes {
  const key = new Uint8Array(length);
  if (length > 0) {
    crypto.getRandomValues(key);
  }
  return key;
}

/**
 * OTP encrypt: ciphertext = message XOR key. Requires key.length === message.length.
 */
export function encrypt(message: Bytes, key: Bytes): Bytes {
  return xorEqual(message, key);
}

/**
 * OTP decrypt: plaintext = ciphertext XOR key. Exact inverse of encrypt because
 * (m ^ k) ^ k === m for every byte.
 */
export function decrypt(ciphertext: Bytes, key: Bytes): Bytes {
  return xorEqual(ciphertext, key);
}

/**
 * Perfect-secrecy key derivation: given a ciphertext and ANY target plaintext of
 * the same length, return the key k = c XOR p that would produce it. This proves
 * a single OTP ciphertext is consistent with every plaintext of its length.
 */
export function deriveKey(ciphertext: Bytes, targetPlaintext: Bytes): Bytes {
  return xorEqual(ciphertext, targetPlaintext);
}
