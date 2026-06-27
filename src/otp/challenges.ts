import { textToBytes, generateKey, encrypt } from "./otp.ts";
import { bytesToHex, type Bytes } from "./types.ts";

// Built-in cryptanalysis exercises for the import panel. Each challenge encrypts
// two known plaintexts and exposes only the ciphertext hex — the user must
// recover the plaintexts with crib-dragging. "reused" challenges share one
// keystream (attackable); the no-reuse one uses two independent keystreams and
// is meant to fail, proving the attack needs reuse.

export interface Challenge {
  id: string;
  label: string;
  difficulty: "easy" | "medium" | "hard" | "control";
  hint: string;
  reused: boolean;
  c1Hex: string;
  c2Hex: string;
  /** Ground truth so the instructor "reveal" toggle can verify a solve. */
  truth: { p1: Bytes; p2: Bytes };
}

function build(
  id: string,
  label: string,
  difficulty: Challenge["difficulty"],
  hint: string,
  p1str: string,
  p2str: string,
  reused: boolean,
): Challenge {
  const p1 = textToBytes(p1str);
  const p2 = textToBytes(p2str);
  const n = Math.max(p1.length, p2.length);
  const s = generateKey(n);
  const s2 = reused ? s : generateKey(n);
  const c1 = encrypt(p1, s.slice(0, p1.length));
  const c2 = encrypt(p2, s2.slice(0, p2.length));
  return { id, label, difficulty, hint, reused, c1Hex: bytesToHex(c1), c2Hex: bytesToHex(c2), truth: { p1, p2 } };
}

/** Build a fresh set of challenges (keys are random per call, in memory only). */
export function buildChallenges(): Challenge[] {
  return [
    build(
      "easy",
      "Easy · common words",
      "easy",
      'Try the crib " the " — common words land fast.',
      "the meeting is set for noon tomorrow",
      "please bring the signed papers along",
      true,
    ),
    build(
      "medium",
      "Medium · military-style",
      "medium",
      'Cribs like "attack", " at ", or " the " help.',
      "attack the eastern bridge at first light",
      "hold your position and await the signal!!",
      true,
    ),
    build(
      "hard",
      "Hard · unusual vocabulary",
      "hard",
      "Fewer common words — work from spaces and short cribs like ` a `.",
      "obscure vectors hide within a noisy channel",
      "the quantum cipher rotates a fragile state",
      true,
    ),
    build(
      "control",
      "Control · NO key reuse",
      "control",
      "Two independent keystreams: no crib will ever read as text. That is the point.",
      "the meeting is set for noon tomorrow",
      "please bring the signed papers along",
      false,
    ),
  ];
}
