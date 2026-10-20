# OTP Vault — limits of perfect secrecy

Brief: `brief-extension.md`. Slug: `crypto-lab-otp-vault`.
Starting main: `726d4b9a65d99c01ab31525212aee8bc3a345ce1`.
Pages: https://systemslibrarian.github.io/crypto-lab-otp-vault/

## Delivered

Panel 2b sits between the original panels 2 and 3 without renumbering anything.
Act A exhaustively enumerates reachable messages for repeating-key XOR with
0–8 key bits, prints exact posteriors, and takes a real ciphertext from the
existing generator/encrypt functions. The 256-cell table has real headers,
textual possible/ruled-out states and a labelled keyboard scroller.

Act B enumerates both secret bits and every key, including half-win guesses.
The separate two-letter Vigenère experiment derives the published 3/4 value
from the period/key probabilities. Act C checks Shannon's conditions and the
weighted ciphertext distributions independently, with exact BigInt weights,
four presets, row-invertibility checks and explicit input errors. Changes retire
relevant verdicts; a no-op key-size event preserves the current game result.

The κ=4 negative fixture enumerates all 4,096 message/key combinations: correct
round trips, equal key weights and a flat ciphertext histogram coexist with
240 impossible messages and an explicit warning. Possible grid cells remain
neutral; short-key and distinguishable-pair verdicts are alarms.

The hero's uniqueness claim is replaced by a scoped perfect-secrecy statement.
README restatements are corrected. Original panels 1, 3, 4, 5, their numbering,
workbench, imports/challenges, theme and header are unchanged. The walkthrough
is unchanged. README has no Exhibits or Build & Verify section; neither was
invented or restructured.

## Verification

- Build passed; 55 unit tests passed.
- Every distinct full-byte message pair gives exactly 1/2; 500 pairs per shorter
  key size match an independently written string-repetition membership test.
  Nine key sizes × 50 ciphertexts exhaustively check candidates and posteriors.
- Independent V1/V2 checks agree on all presets and 1,000 valid seeded tables,
  including zero weights and an exact near-miss above the safe Number range.
- A spy verifies the original generateKey/encrypt path creates Act A's ciphertext.
- §4.1a: boot adds only panel/grid/closed-disclosure structural assertions.
- §4.1b: all 21 browser claim tests pass. New tests independently enumerate the
  grid and game, recompute weighted distributions from displayed cells/weights,
  check every verdict tone, failure path, retirement and no-op behavior.
- §4.1c: 6/6 mutations killed. `mutation-evidence.json` records nonempty source
  patches, successful builds, changed SHA-256 artifact hashes, named zero-retry
  assertion failures, restored exact hashes and restored passing tests.
  One initial negative-claim run was inconclusive and not counted. Direct
  reproduction confirmed the empty sentence is caught. The final complete run
  adds a served-script SHA-256 guard; artifact mismatch cannot count as a kill.
- §4.1d: all three positive fixture checks coexist with the 240 exclusions and
  warning sentence. Deleting the sentence is caught by visibility/text checks.
- All four accessibility tests pass, covering desktop, 380px, baseline staleness
  and all new states at 320px. New link/input contrast was fixed with existing
  palette tokens; no baseline exemptions added. Narrow views inspected visually.
- Local Chromium 153.0.8010.0 uses an ignored config because the pinned download
  endpoint was unavailable. Original CI and Playwright config are preserved.
- Sources: the supplied brief's checked Katz–Lindell chapter references and
  published Example 2.8 value; author-hosted 3rd-edition book page checked; Shannon
  DOI is linked. No unverified quotation from the book or paper is reproduced.

## Catalog handoff — no shared catalog edits

Suggested card sentence: “Shrink the pad's key space, enumerate the messages a
ciphertext rules out, and test Shannon's perfect-secrecy conditions exactly.”
Add chip `Shannon's Theorem`; keep the existing four chips.
Implemented call sites: `src/otp/limits.ts:10` stretch, :18 reachable, :25
posterior, :30 exact game, :45 Vigenère enumeration, :74 V1, :85 V2, :102
negative fixture; `src/ui/limitsPanel.ts:9` original-OTP ciphertext path;
`src/otp/rational.ts:3` exact fractions. No new production cipher primitive.
Prose/seams only: non-uniform message priors, |K|>|M|, sampled advantage games.
Concept deepened: **1. Perfect secrecy**.

Final remote SHA and served-byte proof are recorded after publication. The
shared fleet deploy-sync checker is blocked by missing unrelated sibling clones;
shared catalog, counsel, census and checker content remain unchanged.
