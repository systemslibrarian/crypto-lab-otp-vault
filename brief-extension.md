# Extension brief — `crypto-lab-otp-vault`

**2026-10-20. Extension to a live lab; no new repository.** Written against
`crypto-lab-otp-vault` at `726d4b9a65d9` and `audits/_MASTER-TEMPLATE.md` (catalog
`f48d9d2f2f06`). Template §5: "Extend, never restructure." Source of the gap: Katz–Lindell,
*Introduction to Modern Cryptography*, 3rd ed. (CRC Press, 2021), Chapter 2:

- Definition 2.3 (perfect secrecy) and Lemma 2.5 (the equivalent "every message gives the same
  ciphertext distribution" form).
- Definition 2.6 (perfect indistinguishability, the `PrivK^eav` experiment), Lemma 2.7
  (the two definitions are equivalent), and Example 2.8 (an exact 3/4 for a Vigenère variant).
- Theorem 2.11 (**|K| ≥ |M|**), Theorem 2.12 (Shannon's theorem), and Exercises 2.14 and 2.15.

**Verdict: extension — one new panel, "2b · Limits of perfect secrecy", placed directly after
the existing Panel 2.**

## What the lab has now

Read at `726d4b9a65d9`:

- **Panel 2, "Perfect secrecy — every plaintext is possible"** (`src/ui/perfectSecrecyPanel.ts`,
  title at `:85`). It fixes one ciphertext and lets the reader type any same-length plaintext.
  It derives `k = c ⊕ p` (`deriveKey`, `src/otp/otp.ts:53`) and verifies `c ⊕ k = p`. That is
  the **sufficiency** half: with |K| = |M|, every plaintext is possible.
- **Nothing shows the other half.** Shrink the key and some plaintexts become impossible
  (Theorem 2.11). Nothing shows Shannon's characterisation either (Theorem 2.12), or the
  indistinguishability game (Definition 2.6), which the rest of the catalog's
  computational-security labs build on.
- **Panel assembly:** `src/main.ts:66–76` appends hero, intro, walkthrough, panels 1–5 and the
  grounding paragraph. `panelShell(spec)` (`src/ui/otpPanel.ts:122`) builds each panel with tone,
  icon, title, badge and a "What this isn't" line.
- **Walkthrough steps** target panel ids (`src/ui/walkthrough.ts:15–42`). The claims suite
  checks that the walkthrough "advances, finishes and closes" (`e2e/claims.spec.ts:678`).
- **Claims suite** exists (`e2e/claims.spec.ts`). Panel 2's claims are at `:152` and `:190`.
  A grep for `negative|NEG-|4.1d` in `e2e/` and `src/` finds **no §4.1d negative claim** at
  this commit, so this extension supplies the lab's first.
- **No mutation runner:** `package.json` scripts are `dev`, `build`, `preview`, `test`,
  `test:watch` and `test:a11y`.
- **README** sections: What It Is, When to Use It, Live Demo, What Can Go Wrong, Real-World
  Usage, How to Run Locally, Related Demos (`README.md:3–68`). There is no Exhibits section and
  no Build & Verify section.
- **A sentence this extension contradicts.** The hero's why-text (`src/main.ts:30`) says "The
  one-time pad is the only cipher proven unbreakable". K-L Exercise 2.14 asks the reader to
  prove the single-character shift cipher and the Vigenère cipher on length-t messages perfectly
  secret. The new panel's Shannon preset (addition mod 4) is a perfectly secret scheme that
  isn't XOR. Fix the sentence in the same change (see README and card follow-up). Leaving it
  would put a claim and its counterexample on one page.

## What to add — Panel 2b, three acts

**Plain-language intro:** Panel 2 showed that a one-time pad ciphertext could be any message of
its length. That only works because there are as many keys as messages. Give the pad fewer keys
and the ciphertext starts ruling messages out. That's not a weakness of one scheme: it's a
theorem about all of them.

**Act A — Shorten the key (Theorem 2.11).** This is the headline mechanism.

- The message space is all 256 one-byte messages, drawn as a 16×16 grid.
- The key is κ bits, with a slider from 8 down to 0. The scheme is **repeating-key XOR**:
  `Enc_k(m) = m ⊕ stretch_κ(k)`, where `stretch_κ` repeats the κ key bits to fill 8. At κ = 8
  it is the lab's one-time pad. Name it honestly on the page as repeating-key XOR, the key reuse
  of Panel 3 shrunk to one byte.
- Fix one ciphertext `c` (a random message under a random key). By **exhaustive enumeration**,
  light every cell `m` for which some key maps `c` to `m`. That is the set `M(c)` from the proof
  of Theorem 2.11.
- The readout shows `|M(c)| = 2^κ` lit cells. With a uniform prior, `Pr[M = m | C = c]` is
  `1/2^κ` on lit cells and **0** on dark ones, against a prior of `1/256`. These are exact
  fractions.
- Break it yourself: type a target character. The page reports whether any key reaches it from
  `c`. This is Panel 2's experiment, which now fails for most targets once κ < 8.

**Act B — The indistinguishability game (Definition 2.6, Lemma 2.7).**

- The reader picks two distinct bytes `m₀ ≠ m₁`. The adversary on the page decrypts `c` under
  every key. If exactly one of `m₀`, `m₁` is reachable it names that one; otherwise it guesses.
- The page computes `Pr[PrivK^eav = 1]` **exactly**, by enumerating both values of `b` and every
  key. It does not sample. Expected results, checked by the author with exact rational
  arithmetic:
  - κ = 8 gives exactly **1/2** for every pair.
  - For κ < 8, `stretch_κ` is linear over GF(2), so its image `S` is a subspace. The probability
    is exactly **1** when `m₀ ⊕ m₁ ∉ S`, and exactly **1/2** when `m₀ ⊕ m₁ ∈ S`.
- That second fact is worth a sentence on the page: a broken scheme can still hide *some* pairs.
  The definition quantifies over *every* adversary, so one winning pair is enough.
- This adversary is one valid answer to K-L Exercise 2.15. Don't present it as the book's
  solution.
- **Preset: K-L Example 2.8.** The Vigenère cipher on two-letter messages, period chosen
  uniformly from {1, 2}, adversary "output 0 iff `c₁ = c₂`", with `m₀ = aa` and `m₁ = ab`. The
  page's exact enumeration must print **3/4**, the value the book publishes.

**Act C — Shannon's theorem (Theorem 2.12).**

- A 4×4 encryption table (rows are keys, columns are 2-bit messages, cells are ciphertexts) and
  integer key weights. |M| = |K| = |C| = 4, so the theorem's hypothesis holds by construction.
- The page computes **two verdicts by separate code paths**:
  - **V1, Shannon's conditions:** every key has equal weight, and every (m, c) pair has exactly
    one key.
  - **V2, Lemma 2.5:** for every c, `Pr[Enc_K(m) = c]` is the same for all m, summed from the
    key weights.
- Theorem 2.12 says V1 ⇔ V2. The page shows both, and that they agree.
- Presets:
  1. 2-bit XOR, uniform keys → both hold.
  2. XOR with weights (4, 2, 2, 2) → both fail.
  3. `Enc_k(m) = m ⊕ g(k)` with `g = [0, 0, 1, 1]` → both fail. Some (m, c) pairs have two keys
     and others none.
  4. Addition mod 4, uniform keys → both hold. This is a perfectly secret scheme that isn't XOR.
- The reader can edit cells. A row that repeats a ciphertext is refused, because decryption
  would be ambiguous.

## SECURITY / CORRECTNESS INVARIANTS

1. Every probability on the panel is an exact rational computed by enumeration. Use BigInt
   numerator/denominator or integer counts over a common denominator. **No floating point and
   no sampling.** Print fractions; decimals only alongside.
2. Act A's `M(c)` is computed by trying every key, never from the formula `2^κ`. The `2^κ` in
   the readout is a cross-check against the count.
3. V1 and V2 share no helper beyond reading the table. A test asserts they agree on all four
   presets and on 1,000 random valid tables.
4. The fixed ciphertext in Act A comes from a real encryption under a real random key
   (`generateKey`, `src/otp/otp.ts:25`), as Panel 2's does.
5. `m₀ = m₁` is refused in Act B. The game is meaningless there.
6. No claim of "secure" for any κ < 8. The κ = 8 state reads "perfectly secret (Theorem 2.10)";
   everything else reads with the exact number of excluded messages.

## ARCHITECTURE

- `src/otp/limits.ts` — `stretch(k, κ)`, `reachable(c, κ)` (enumeration),
  `posterior(c, κ)`, `privKExact(m0, m1, κ)`, `vigenereExample28()`, `shannonConditions(table,
  weights)` (V1) and `lemma25(table, weights)` (V2). All pure.
- `src/otp/rational.ts` — a minimal exact fraction type (add, multiply, compare, reduce, format).
- `src/otp/limits.test.ts`.
- `src/ui/limitsPanel.ts` — built with `panelShell`, with `id: "panel-limits"` and title
  "2b · Limits of perfect secrecy".
- `src/main.ts` — insert `limitsPanel()` between `perfectSecrecyPanel()` and `twoTimePadPanel()`
  (`main.ts:71–72`). **Don't renumber panels 3–5.** Their titles and the claims tests named
  "panel 3: …", "panel 4: …" key on those numbers. That's why the new panel is "2b".
- `src/ui/walkthrough.ts` — optionally add one step, "Why the key must be this long", targeting
  `panel-limits`. If you do, update the walkthrough claim at `claims.spec.ts:678`.
- `// [extension] point` in `limits.ts`: a non-uniform message prior (see EXTENSION SEAMS).

## UI

- Act A: the κ slider (with keyboard step and value text), the 16×16 grid as a real table with
  row and column headers (hex high nibble × low nibble), a target-character input, and the
  exact posterior readout.
- Act B: two byte inputs (accept a character or two hex digits), "Compute exactly", the result
  as a fraction, and the Example 2.8 preset button.
- Act C: the 4×4 table of `<select>`s or number inputs with labels, key-weight inputs, the
  preset buttons, and the V1 and V2 verdict chips side by side.
- The grid region is `tabindex="0"`, `role="region"` and has an `aria-label`. Each lit cell's
  state is in text (`aria-label`, or a visually-hidden "possible"/"ruled out"), not colour alone.
- Retirement: moving κ or editing m₀/m₁/table cells retires the previous verdicts and says so.
  Re-selecting the same κ does not.

## VISUAL SEMANTICS

- Colour tracks **whether the scheme is perfectly secret**.
  - κ = 8 and the Shannon-satisfying presets use the lab's calm styling, with the existing "✓"
    legend.
  - κ < 8 uses danger styling with "✕ not perfectly secret — N of 256 messages ruled out".
- In Act A's grid, ruled-out messages are the alarm. Lit "possible" cells are neutral, never
  green. A message being possible is not the scheme succeeding.
- Act B: `1/2` → calm ("perfectly indistinguishable for this pair"); `> 1/2` → danger.
- Act C: V1 and V2 always show together. If they ever disagreed the page would show an error
  state. That can't happen by Theorem 2.12, so it's also a tested impossibility.
- Icon plus text plus colour every time; check in grayscale.

## EDGE CASES

- κ = 0 → the "scheme" is `c = m`. Show that `M(c)` is one cell, and say "no key at all".
- A target character that is more than one byte in UTF-8 → refuse with its byte count. Panel 2
  already teaches "bytes, not characters"; reuse that wording.
- `m₀ = m₁` → refused, named.
- Act C: a row with a repeated ciphertext → `ROW_NOT_INVERTIBLE`, naming the row. All weights
  zero → refuse. Negative or non-integer weights → refuse.
- Act C hypothesis: sizes are fixed at 4. Say on the page that Theorem 2.12 needs
  |M| = |K| = |C| and that this panel holds them equal.

## EXTENSION SEAMS

1. **A non-uniform message prior** for Act A. Theorem 2.11's proof uses the uniform prior, but
   Definition 2.3 quantifies over every prior.
2. **|K| > |M| in Act C.** Shannon's conditions stop being necessary. A good follow-up, but out
   of scope here.
3. A **sampled** version of Act B, with a measured advantage and Wilson interval, as a bridge to
   `crypto-lab-hidden-bit`'s games.

## Tests

**Unit (`src/otp/limits.test.ts`):**

- `|reachable(c, κ)| = 2^κ` for every κ in 0–8 and 50 random `c`, counted by enumeration.
- At κ = 8, the posterior equals the prior (1/256) for every m. For κ < 8 it is 1/2^κ or 0.
- `privKExact`: exactly 1/2 for all pairs at κ = 8. For κ < 8, exactly 1 when `m₀ ⊕ m₁ ∉ S` and
  exactly 1/2 otherwise, checked on 500 random pairs per κ against a membership test written
  separately in the test.
- **Published number:** `vigenereExample28()` returns exactly 3/4, from K-L Example 2.8. Comment
  that the book publishes this value; the enumeration is the lab's.
- **V1 ⇔ V2** on the four presets (expected: true, false, false, true) and on 1,000 random valid
  4×4 tables with random weights.
- Act A's `c` comes from `encrypt` with a `generateKey` key. Spy on or stub the generator to make
  this checkable.

**Claims (`e2e/claims.spec.ts`, §4.1b):**

- **Independent re-derivation.** Parse κ and `c` from the page. In the test, enumerate
  `c ⊕ stretch(k)` with a separately written stretch (string-based bit repetition, not the
  source's shifts). Assert the lit cells are exactly that set.
- **Cross-check:** the printed `|M(c)|` equals the number of lit cells, and the printed posterior
  denominator equals that count.
- **Act B re-derivation:** recompute `Pr` from the printed m₀, m₁ and κ in the test. Assert the
  printed fraction.
- **Act C:** the test computes Lemma 2.5 from the printed table and weights, and asserts that both
  verdict chips agree with it.
- **Retirement** and the no-op guard, as above. **Failure paths** name their causes.

**§4.1c mutations.** The panel renders verdicts, so add a scripted runner with concrete patches,
in the shape of `crypto-lab-mac-race/scripts/check-crc-mutations.mjs` (`bc4f683362e4`). At least:

1. `stretch` drops one repetition, so the image is no longer injective → the count test fails.
2. `privKExact` treats "both reachable" as a win for the adversary → exact 1/2 at κ = 8 fails.
3. V2 compares the posterior to the prior with a float tolerance instead of exactly → the
   random-table agreement test catches a near-miss table. Construct one in the test.
4. The κ < 8 verdict is styled calm → the verdict-class claim fails.
5. Example 2.8's period-2 weight is 1/26 instead of 1/676 → the 3/4 known answer fails.

**§4.1d negative claim (the lab's first):** *"Ciphertexts that look uniformly random do not make
a scheme perfectly secret."*

- **Evidence fixture:** Act A at κ = 4. The page renders three checks:
  - every key decrypts every message correctly;
  - keys are chosen uniformly;
  - over uniform messages, every one of the 256 ciphertexts occurs equally often.
- All three pass. The author confirmed the flat histogram by enumeration.
- The verdict reads `CIPHERTEXTS UNIFORM — AND 240 OF 256 MESSAGES RULED OUT`, with the sentence
  visible in that state.
- Assert all three §4.1d points. Delete the sentence and assertion 3 fails. Mutation 1 breaks
  the fixture's count.

**Gate (§4.1a):** add a structural check that `#panel-limits` exists, holds the grid table, and
has no `details[open]` at arrival. Add nothing to `boot()` that asserts copy.

## README and card follow-up

- **Hero why-text (`src/main.ts:30`):** replace "the only cipher proven unbreakable" with a scoped
  claim, e.g. that perfect secrecy is provable, the one-time pad achieves it with a key as long
  as the message, and the guarantee dies when a key is reused. Sweep every restatement:
  - grep the repo for "only cipher" and "unbreakable";
  - check `README.md` "What It Is", which calls perfect secrecy "the strongest possible
    guarantee" — keep that, it's a property, not a uniqueness claim;
  - the "When to Use It" bullet that says "every other cipher is judged against it".
- **What It Is:** add that the lab now shows why the key must be as long as the message
  (Theorem 2.11) and Shannon's characterisation (Theorem 2.12).
- The README has no Exhibits or Build & Verify section. Mention that to Paul in your handoff;
  don't restructure the README in this extension.
- **Catalog handoff (do not edit `../crypto-lab`):** proposed chip `Shannon's Theorem`. The
  existing four chips stay.

## Do not touch

Panels 1, 3, 4 and 5 and their numbering, the crib-drag workbench, the challenge set, the import
panel, the theme pin and the header.

## Sources

- Katz, Lindell. *Introduction to Modern Cryptography*, 3rd ed., CRC Press, 2021 (ISBN
  9780815354369) — Definitions 2.3 and 2.6, Lemmas 2.5 and 2.7, Example 2.8, Theorems 2.10–2.12,
  Exercises 2.14 and 2.15. Checked against the book's text.
- C. E. Shannon. "Communication Theory of Secrecy Systems." *Bell System Technical Journal*
  28(4):656–715, October 1949. doi:10.1002/j.1538-7305.1949.tb00928.x (Crossref). The paper's
  Section 10 states that perfect secrecy needs "the number of different keys … at least as great
  as the number of M's" (checked in a public transcript of the paper).
