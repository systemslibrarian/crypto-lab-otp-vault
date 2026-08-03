import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * Functional gate for the claims this page makes on screen.
 *
 * The a11y suite clicks every button and asks axe whether the result is
 * reachable. This suite reads the bytes the page rendered and checks the XOR
 * arithmetic itself: every ciphertext byte against its plaintext and key byte,
 * the combined strip against both ciphertexts AND against both plaintexts, the
 * revealed crib bytes against the strip they were read from, and the "N of M
 * bytes recovered" counter against the cells actually marked known.
 *
 * Nothing here compares against a hardcoded hex value — the keys are random per
 * load, so every expectation is one rendered value against another.
 */

// ---------------------------------------------------------------- guards

function guardPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`);
  });
  return errors;
}

test.beforeEach(async ({ page }) => {
  (test.info() as unknown as { _pageErrors: string[] })._pageErrors = guardPageErrors(page);
});

test.afterEach(async () => {
  const errors = (test.info() as unknown as { _pageErrors?: string[] })._pageErrors ?? [];
  expect(errors, "page must raise no uncaught exceptions or console errors").toEqual([]);
});

// ---------------------------------------------------------------- helpers

/** A labelled byte strip inside a panel, matched on the start of its label. */
function strip(scope: Locator, labelPrefix: string): Locator {
  return scope.locator(`.strip[aria-label^="${labelPrefix}"]`);
}

/** The byte values a strip rendered. An unknown cell ("··") reads as -1. */
async function stripBytes(loc: Locator): Promise<number[]> {
  await expect(loc).toHaveCount(1);
  const hexes = await loc.locator(".byte .byte__hex").allTextContents();
  return hexes.map((h) => {
    const t = h.trim();
    if (t === "··") return -1;
    expect(t, `unparseable byte cell ${JSON.stringify(t)}`).toMatch(/^[0-9a-f]{2}$/);
    return parseInt(t, 16);
  });
}

/** The glyph column a strip rendered. */
async function stripGlyphs(loc: Locator): Promise<string[]> {
  return (await loc.locator(".byte .byte__glyph").allTextContents()).map((g) => g);
}

function utf8(text: string): number[] {
  return Array.from(new TextEncoder().encode(text));
}

function glyphOf(byte: number): string {
  return byte >= 0x20 && byte <= 0x7e ? String.fromCharCode(byte) : "·";
}

function xorArrays(a: number[], b: number[]): number[] {
  expect(a.length).toBe(b.length);
  return a.map((x, i) => x ^ b[i]);
}

async function statusText(scope: Locator): Promise<string> {
  return (await scope.innerText()).replace(/\s+/g, " ");
}

/** Set an input/textarea value and wait for the panel to re-render. */
async function typeInto(field: Locator, value: string): Promise<void> {
  await field.fill(value);
  // Every panel re-renders synchronously on `input`; a microtask is enough.
  await field.evaluate(() => undefined);
}

// ---------------------------------------------------------------- panel 1

test("panel 1: the ciphertext is the XOR the page drew, and the decrypt is exact", async ({
  page,
}) => {
  await page.goto(".");
  const panel = page.locator("#panel-otp");
  await expect(panel).toBeVisible();

  const P = await stripBytes(strip(panel, "Plaintext"));
  const K = await stripBytes(strip(panel, "Key"));
  const C = await stripBytes(strip(panel, "Ciphertext"));
  const R = await stripBytes(strip(panel, "Recovered"));

  // The one-time pad, byte by byte, off the screen.
  expect(K.length, "|K| must equal |P|").toBe(P.length);
  expect(C, "C must be P XOR K at every byte").toEqual(xorArrays(P, K));
  expect(R, "C XOR K must return P exactly").toEqual(P);
  expect(P).toEqual(utf8("HELLO ONE-TIME PAD"));

  // The status line's numbers must be the lengths on screen.
  const status = await statusText(panel.locator(".status--calm"));
  expect(status).toContain(`Decryption is byte-exact (${P.length} bytes recovered)`);
  expect(status).toContain(`|K| = |P| = ${K.length}`);
  await expect(panel.locator(".status--danger")).toHaveCount(0);
  expect(await panel.innerText()).not.toContain("this should never happen");

  // A fresh key must change K and C but leave the recovered plaintext alone.
  await panel.getByRole("button", { name: /Generate fresh random key/ }).click();
  const K2 = await stripBytes(strip(panel, "Key"));
  const C2 = await stripBytes(strip(panel, "Ciphertext"));
  const R2 = await stripBytes(strip(panel, "Recovered"));
  expect(K2, "a fresh key must actually be fresh").not.toEqual(K);
  expect(C2).not.toEqual(C);
  expect(C2).toEqual(xorArrays(P, K2));
  expect(R2, "a different key still recovers the same plaintext").toEqual(P);
});

test("panel 1: XOR is over UTF-8 bytes, not characters, and empty input says so", async ({
  page,
}) => {
  await page.goto(".");
  const panel = page.locator("#panel-otp");
  const field = panel.locator("#otp-msg");

  // 1 char + 1 emoji = 2 + 4 = 6 bytes. The page's own help text claims this.
  await typeInto(field, "é🙂");
  const P = await stripBytes(strip(panel, "Plaintext"));
  expect(P).toEqual(utf8("é🙂"));
  expect(P.length, "a two-character string can be six bytes").toBe(6);
  const K = await stripBytes(strip(panel, "Key"));
  expect(K.length).toBe(6);
  expect(await stripBytes(strip(panel, "Ciphertext"))).toEqual(xorArrays(P, K));
  expect(await stripBytes(strip(panel, "Recovered"))).toEqual(P);
  expect(await statusText(panel.locator(".status--calm"))).toContain("|K| = |P| = 6");

  // Empty message: no strips, an explicit prompt, and no false "exact" verdict.
  await typeInto(field, "");
  await expect(panel.locator(".panel-output .strip")).toHaveCount(0);
  await expect(panel.locator(".panel-output .status--neutral")).toContainText(
    "Type a message to see the one-time pad in action",
  );
  expect(await panel.innerText()).not.toContain("byte-exact");
});

// ---------------------------------------------------------------- panel 2

test("panel 2: one ciphertext yields a valid key for every plaintext of its length", async ({
  page,
}) => {
  await page.goto(".");
  const panel = page.locator("#panel-secrecy");
  const field = panel.locator("#ps-target");

  const C = await stripBytes(strip(panel, "Fixed ciphertext"));
  expect(C.length).toBeGreaterThan(0);
  // The label must state the length it actually rendered.
  const cLabel = await strip(panel, "Fixed ciphertext").getAttribute("aria-label");
  expect(cLabel).toContain(`(${C.length} bytes`);

  async function checkTarget(text: string): Promise<number[]> {
    await typeInto(field, text);
    const P = await stripBytes(strip(panel, "Your chosen plaintext"));
    const K = await stripBytes(strip(panel, "Derived key"));
    const back = await stripBytes(strip(panel, "C ⊕ K"));
    expect(P).toEqual(utf8(text));
    expect(K, "the derived key must be C XOR P").toEqual(xorArrays(C, P));
    expect(back, "C XOR K must return the chosen plaintext").toEqual(P);
    await expect(panel.locator(".status--calm")).toContainText("This key is genuinely valid");
    await expect(panel.locator(".status--danger")).toHaveCount(0);
    return K;
  }

  const k1 = await checkTarget("TOTALLY WRONG!");
  const k2 = await checkTarget("SURRENDER NOW!");

  // Same ciphertext, two different plaintexts, two different valid keys — the
  // whole perfect-secrecy argument, verified on the rendered bytes.
  expect(k1).not.toEqual(k2);
  expect(
    await stripBytes(strip(panel, "Fixed ciphertext")),
    "the ciphertext must not move while the plaintext does",
  ).toEqual(C);
});

test("panel 2: a wrong-length target is refused with both byte counts named", async ({ page }) => {
  await page.goto(".");
  const panel = page.locator("#panel-secrecy");
  const field = panel.locator("#ps-target");
  const N = (await stripBytes(strip(panel, "Fixed ciphertext"))).length;

  for (const bad of ["SHORT", "TOTALLY WRONG!!!", "", "TOTALLY WRONG🙂"]) {
    await typeInto(field, bad);
    const bytes = utf8(bad).length;
    const msg = await statusText(panel.locator(".status--neutral").first());
    expect(msg, `input ${JSON.stringify(bad)} must be refused by length`).toContain(
      `Your target is ${bytes} byte${bytes === 1 ? "" : "s"}; it must be exactly ${N} bytes`,
    );
    // No key is derived and no verdict is printed for a non-candidate.
    await expect(strip(panel, "Derived key")).toHaveCount(0);
    await expect(panel.locator(".status--calm")).toHaveCount(0);
    // The ciphertext stays on screen — it is all the attacker has either way.
    expect((await stripBytes(strip(panel, "Fixed ciphertext"))).length).toBe(N);
  }
});

// ---------------------------------------------------------------- panel 3

const TTP = "#panel-ttp";

async function readWorkbench(panel: Locator): Promise<{
  strip: number[];
  reconP1: number[];
  reconP2: number[];
}> {
  return {
    strip: await stripBytes(panel.locator('.strip[aria-label="Combined strip"]')),
    reconP1: await stripBytes(strip(panel, "Reconstructed P1")),
    reconP2: await stripBytes(strip(panel, "Reconstructed P2")),
  };
}

/** "N / M bytes recovered in BOTH messages" as the panel currently reports it. */
async function recovered(panel: Locator): Promise<{ solved: number; total: number }> {
  const text = await statusText(panel.locator(".recon-block .status"));
  const m = /(\d+) \/ (\d+) bytes recovered in BOTH messages/.exec(text);
  expect(m, `no recovery counter in: ${text}`).not.toBeNull();
  return { solved: Number(m![1]), total: Number(m![2]) };
}

test("panel 3: key reuse cancels the key, provably, in the bytes on screen", async ({ page }) => {
  await page.goto(".");
  const panel = page.locator(TTP);

  const C1 = await stripBytes(strip(panel, "C1 = P1"));
  const C2 = await stripBytes(strip(panel, "C2 = P2"));
  const S = await stripBytes(panel.locator('.strip[aria-label="Combined strip"]'));

  expect(S, "the strip must be C1 XOR C2").toEqual(xorArrays(C1, C2));

  // Turn on the instructor reveal and prove the key cancelled.
  await panel.locator(".truth-toggle input").check();
  const aP1 = await stripBytes(strip(panel, "Actual P1"));
  const aP2 = await stripBytes(strip(panel, "Actual P2"));
  expect(S, "with one key reused, C1 XOR C2 IS P1 XOR P2").toEqual(xorArrays(aP1, aP2));
  // ...and the key really was the same one, recovered independently from each side.
  expect(
    xorArrays(C1, aP1),
    "C1 XOR P1 and C2 XOR P2 must be the identical keystream",
  ).toEqual(xorArrays(C2, aP2));

  await expect(panel.locator(".ttp-output .status--danger")).toContainText(
    "The key is gone — only the two plaintexts XORed together remain",
  );
  await expect(panel.locator("#panel-ttp .ttp-output .status--calm")).toHaveCount(0);
  await expect(strip(panel, "C2 = P2")).toHaveAttribute("aria-label", /same K!/);
});

test("panel 3: one pinned crib peels a stretch off both messages at once", async ({ page }) => {
  await page.goto(".");
  const panel = page.locator(TTP);
  await panel.locator(".truth-toggle input").check();

  const S = await stripBytes(panel.locator('.strip[aria-label="Combined strip"]'));
  const aP1 = await stripBytes(strip(panel, "Actual P1"));
  const aP2 = await stripBytes(strip(panel, "Actual P2"));

  // Place the default crib "the " over the start of P1.
  await typeInto(panel.locator(".crib-input"), "the ");
  await panel.locator(".strip--interactive .byte").nth(0).click();
  await expect(panel.locator(".offset-readout")).toHaveText("offset 0");

  const crib = utf8("the ");
  await expect(panel.locator(".reveal-caption")).toHaveText(
    'If "the " is P1 at offset 0, then P2 reads here:',
  );
  const revealed = await panel.locator(".reveal-cell").allTextContents();
  const expected = crib.map((c, i) => glyphOf(c ^ S[i]));
  expect(revealed, "the revealed glyphs must be crib XOR strip").toEqual(expected);
  expect(revealed, "which is the other plaintext at that position").toEqual(
    aP2.slice(0, 4).map(glyphOf),
  );

  // Every revealed byte is printable here, and the page must say so.
  await expect(panel.locator(".reveal-box .status--calm")).toContainText(
    `All ${crib.length} revealed bytes are printable`,
  );

  // Pin it: four bytes of BOTH plaintexts become known, and nothing else does.
  expect((await recovered(panel)).solved).toBe(0);
  await panel.locator("button.btn--pin").click();
  const after = await recovered(panel);
  expect(after.solved).toBe(crib.length);
  expect(after.total).toBe(S.length);

  const w = await readWorkbench(panel);
  expect(w.reconP1.slice(0, 4), "the crib is P1 there").toEqual(crib);
  expect(w.reconP1.slice(0, 4)).toEqual(aP1.slice(0, 4));
  expect(w.reconP2.slice(0, 4), "and P2 falls out at the same positions").toEqual(aP2.slice(0, 4));
  expect(
    w.reconP1.slice(4).every((b) => b === -1),
    "nothing beyond the crib may be claimed as known",
  ).toBe(true);
  expect(w.reconP2.slice(4).every((b) => b === -1)).toBe(true);

  // The counter must equal the cells actually drawn as known.
  const known = w.reconP1.filter((b) => b !== -1).length;
  expect(after.solved, "the counter must be the cells marked known").toBe(known);
  await expect(panel.locator(".history-item")).toHaveCount(1);
  await expect(panel.locator(".history-item .history-text")).toHaveText('"the " → P1 @ 0');
});

test("panel 3: the recovery counter tracks pins through undo, redo, remove and reset", async ({
  page,
}) => {
  await page.goto(".");
  const panel = page.locator(TTP);
  const cells = panel.locator(".strip--interactive .byte");

  await typeInto(panel.locator(".crib-input"), "the ");
  await cells.nth(0).click();
  await panel.locator("button.btn--pin").click();
  expect((await recovered(panel)).solved).toBe(4);

  // A second, non-overlapping pin adds its own bytes and nothing more.
  await cells.nth(20).click();
  await expect(panel.locator(".offset-readout")).toHaveText("offset 20");
  await panel.locator("button.btn--pin").click();
  expect(
    (await recovered(panel)).solved,
    "two disjoint 4-byte cribs must account for 8 bytes",
  ).toBe(8);
  await expect(panel.locator(".history-item")).toHaveCount(2);

  const undo = panel.getByRole("button", { name: "↶ Undo pin" });
  const redo = panel.getByRole("button", { name: "↷ Redo" });

  await undo.click();
  expect((await recovered(panel)).solved).toBe(4);
  await expect(panel.locator(".history-item")).toHaveCount(1);
  await redo.click();
  expect((await recovered(panel)).solved).toBe(8);

  await panel.locator(".history-item").first().locator(".history-remove").click();
  expect((await recovered(panel)).solved).toBe(4);
  await expect(panel.locator(".history-item")).toHaveCount(1);
  // Removing a pin discards the redo stack, so redo must be unavailable.
  await expect(redo).toBeDisabled();

  await panel.getByRole("button", { name: "Reset reconstruction" }).click();
  const zero = await recovered(panel);
  expect(zero.solved).toBe(0);
  await expect(panel.locator(".history-item")).toHaveCount(0);
  await expect(undo).toBeDisabled();
  const w = await readWorkbench(panel);
  expect(w.reconP1.every((b) => b === -1), "reset must un-know every byte").toBe(true);
  expect(w.reconP2.every((b) => b === -1)).toBe(true);
});

test("panel 3: turning key reuse off stops the keys cancelling", async ({ page }) => {
  await page.goto(".");
  const panel = page.locator(TTP);
  await panel.locator(".truth-toggle input").check();

  const aP1 = await stripBytes(strip(panel, "Actual P1"));
  const aP2 = await stripBytes(strip(panel, "Actual P2"));
  const reused = await stripBytes(panel.locator('.strip[aria-label="Combined strip"]'));
  expect(reused).toEqual(xorArrays(aP1, aP2));

  await panel.locator(".danger-toggle input").uncheck();

  await expect(strip(panel, "C2 = P2")).toHaveAttribute("aria-label", /different key/);
  await expect(panel.locator(".ttp-output .status--calm")).toContainText(
    "The keys do NOT cancel",
  );
  await expect(panel.locator(".ttp-output .status--danger")).toHaveCount(0);
  await expect(panel.locator(".danger-toggle")).not.toHaveClass(/danger-toggle--armed/);

  const C1 = await stripBytes(strip(panel, "C1 = P1"));
  const C2 = await stripBytes(strip(panel, "C2 = P2"));
  const now = await stripBytes(panel.locator('.strip[aria-label="Combined strip"]'));
  expect(now, "the strip is still C1 XOR C2").toEqual(xorArrays(C1, C2));

  // But it is no longer P1 XOR P2 — the residual K XOR K2 is genuine noise.
  const truth = xorArrays(aP1, aP2);
  const differing = now.filter((b, i) => b !== truth[i]).length;
  expect(
    differing,
    "with two independent keys the strip must not be P1 XOR P2",
  ).toBeGreaterThan(now.length * 0.9);

  // Turning it back on restores the cancellation.
  await panel.locator(".danger-toggle input").check();
  await expect(panel.locator(".ttp-output .status--danger")).toBeVisible();
  expect(await stripBytes(panel.locator('.strip[aria-label="Combined strip"]'))).toEqual(truth);
});

test("panel 3: unequal message lengths are accounted for byte by byte", async ({ page }) => {
  await page.goto(".");
  const panel = page.locator(TTP);
  const p1ta = panel.getByLabel("Message P1");
  const p2ta = panel.getByLabel("Message P2");

  await typeInto(p1ta, "the quick brown fox");
  await typeInto(p2ta, "pack my box");

  const n1 = utf8("the quick brown fox").length;
  const n2 = utf8("pack my box").length;
  const info = await statusText(panel.locator(".ttp-output .status--neutral"));
  expect(info).toContain(`Messages differ in length (${n1} vs ${n2} bytes)`);
  expect(info).toContain(`overlapping prefix of ${Math.min(n1, n2)} bytes is attackable`);
  expect(info).toContain(`${Math.abs(n1 - n2)}-byte tail`);

  const S = await stripBytes(panel.locator('.strip[aria-label="Combined strip"]'));
  expect(S.length, "only the overlap is on the attack strip").toBe(Math.min(n1, n2));
  expect((await stripBytes(strip(panel, "C1 = P1"))).length).toBe(n1);
  expect((await stripBytes(strip(panel, "C2 = P2"))).length).toBe(n2);
  expect((await recovered(panel)).total).toBe(Math.min(n1, n2));

  // Equal lengths again: the informational note goes away.
  await typeInto(p2ta, "pack my box with!!!");
  await expect(panel.locator(".ttp-output .status--neutral")).toHaveCount(0);
});

test("panel 3: a pin that no longer fits is dropped by name, not silently", async ({ page }) => {
  await page.goto(".");
  const panel = page.locator(TTP);

  await typeInto(panel.locator(".crib-input"), "lazy");
  const cells = panel.locator(".strip--interactive .byte");
  const total = await cells.count();
  await cells.nth(total - 6).click();
  await panel.locator("button.btn--pin").click();
  expect((await recovered(panel)).solved).toBe(4);
  await expect(panel.locator(".pin-notice")).toBeEmpty();

  // Shorten P1 so the strip can no longer hold that pin.
  await typeInto(panel.getByLabel("Message P1"), "the quick brown");

  const notice = await statusText(panel.locator(".pin-notice"));
  expect(notice).toContain("no longer fits and was dropped");
  expect(notice, "the dropped pin must be named").toContain('"lazy"');
  expect(notice).toContain(`The strip is now ${utf8("the quick brown").length} bytes`);
  expect((await recovered(panel)).solved).toBe(0);
  await expect(panel.locator(".history-item")).toHaveCount(0);
});

test("panel 3: re-rolling the keys moves the ciphertexts but not the strip", async ({ page }) => {
  await page.goto(".");
  const panel = page.locator(TTP);

  await typeInto(panel.locator(".crib-input"), "the ");
  await panel.locator(".strip--interactive .byte").nth(0).click();
  await panel.locator("button.btn--pin").click();
  const beforeC1 = await stripBytes(strip(panel, "C1 = P1"));
  const before = await stripBytes(panel.locator('.strip[aria-label="Combined strip"]'));
  expect((await recovered(panel)).solved).toBe(4);

  await panel.getByRole("button", { name: /Re-roll session keys/ }).click();

  const afterC1 = await stripBytes(strip(panel, "C1 = P1"));
  const afterC2 = await stripBytes(strip(panel, "C2 = P2"));
  const after = await stripBytes(panel.locator('.strip[aria-label="Combined strip"]'));

  expect(afterC1, "a re-roll must actually draw a new key").not.toEqual(beforeC1);
  expect(after).toEqual(xorArrays(afterC1, afterC2));
  // The strip is C1 ⊕ C2 = P1 ⊕ P2 with the key cancelled, so it cannot depend
  // on which key was drawn. Same plaintexts, same strip — a second, independent
  // demonstration that the key really is gone from it.
  expect(after, "the strip cannot depend on a key that cancelled").toEqual(before);

  // The panel resets the reconstruction on a re-roll regardless.
  expect((await recovered(panel)).solved).toBe(0);
  await expect(panel.locator(".history-item")).toHaveCount(0);
});

test("panel 3: a crib that cannot fit is refused with both lengths named", async ({ page }) => {
  await page.goto(".");
  const panel = page.locator(TTP);
  const cribInput = panel.locator(".crib-input");
  const stripLen = (await stripBytes(panel.locator('.strip[aria-label="Combined strip"]'))).length;

  const tooLong = "x".repeat(stripLen + 5);
  await typeInto(cribInput, tooLong);
  const msg = await statusText(panel.locator(".reveal-box .status"));
  expect(msg).toContain(
    `Crib (${tooLong.length} bytes) is longer than the attackable strip (${stripLen} bytes) — no valid offset`,
  );
  await expect(panel.locator(".reveal-cell")).toHaveCount(0);
  // Pinning an impossible crib must not invent recovered bytes.
  await panel.locator("button.btn--pin").click();
  expect((await recovered(panel)).solved).toBe(0);

  await typeInto(cribInput, "");
  await expect(panel.locator(".reveal-box .status")).toContainText(
    "Enter a crib (a guessed word) to drag across the strip",
  );

  await typeInto(cribInput, "the ");
  await expect(panel.locator(".reveal-cell")).toHaveCount(4);
});

test("panel 3: the candidate offsets report the printability they actually have", async ({
  page,
}) => {
  await page.goto(".");
  const panel = page.locator(TTP);
  const S = await stripBytes(panel.locator('.strip[aria-label="Combined strip"]'));

  await typeInto(panel.locator(".crib-input"), "the ");
  const crib = utf8("the ");

  const buttons = await panel.locator(".candidate-btn").allTextContents();
  expect(buttons.length, "the default crib must find candidate offsets").toBeGreaterThan(0);

  for (const label of buttons) {
    const m = /^@(\d+) "(.*)" (\d+)%$/.exec(label.trim());
    expect(m, `unparseable candidate: ${label}`).not.toBeNull();
    const off = Number(m![1]);
    const revealed = crib.map((c, i) => c ^ S[off + i]);
    const printable = revealed.filter((b) => b >= 0x20 && b <= 0x7e).length;
    expect(Number(m![3]), `candidate @${off} misreports its printability`).toBe(
      Math.round((printable / revealed.length) * 100),
    );
    expect(m![2], `candidate @${off} misreports its preview`).toBe(
      revealed.map(glyphOf).join(""),
    );
    expect(Number(m![3]), "candidates are filtered at 60% printable").toBeGreaterThanOrEqual(60);
  }

  // Clicking a candidate moves the drag to that offset.
  const first = Number(/^@(\d+)/.exec(buttons[0].trim())![1]);
  await panel.locator(".candidate-btn").first().click();
  await expect(panel.locator(".offset-readout")).toHaveText(`offset ${first}`);
});

// ---------------------------------------------------------------- panel 4

test("panel 4: a reused keystream reduces to the same two-time pad", async ({ page }) => {
  await page.goto(".");
  const panel = page.locator("#panel-keystream");

  const C1 = await stripBytes(strip(panel, "C1 = P1 ⊕ S"));
  const C2 = await stripBytes(strip(panel, "C2 = P2 ⊕ S"));
  const S = await stripBytes(panel.locator('.strip[aria-label="Combined strip"]'));
  // These two messages differ in length; only the overlap is attackable, and the
  // page must say so rather than pad or truncate silently.
  expect(S.length).toBe(Math.min(C1.length, C2.length));
  expect(S).toEqual(xorArrays(C1.slice(0, S.length), C2.slice(0, S.length)));
  expect(await statusText(panel.locator(".ttp-output .status--neutral"))).toContain(
    `Only the overlapping ${S.length}-byte prefix leaks`,
  );

  await panel.locator(".truth-toggle input").check();
  const aP1 = await stripBytes(strip(panel, "Actual P1"));
  const aP2 = await stripBytes(strip(panel, "Actual P2"));
  expect(S, "the keystream cancels exactly as the OTP key did").toEqual(xorArrays(aP1, aP2));
  // The messages differ in length here, so compare over the attackable overlap.
  expect(xorArrays(C1.slice(0, S.length), aP1), "one keystream encrypted both messages").toEqual(
    xorArrays(C2.slice(0, S.length), aP2),
  );

  await expect(strip(panel, "C2 = P2 ⊕ S")).toHaveAttribute("aria-label", /SAME keystream/);
  await expect(panel.locator(".ttp-output .status--danger")).toContainText(
    "C1 ⊕ C2 cancels S and leaves P1 ⊕ P2",
  );

  // A "new (still reused)" keystream must change both ciphertexts — and leave the
  // strip untouched, because C1 ⊕ C2 = P1 ⊕ P2 whatever the keystream is. That
  // invariance is the cancellation claim shown a second way.
  await panel.getByRole("button", { name: /New \(still-reused\) keystream/ }).click();
  const C1b = await stripBytes(strip(panel, "C1 = P1 ⊕ S"));
  const C2b = await stripBytes(strip(panel, "C2 = P2 ⊕ S"));
  expect(C1b, "a new keystream must actually be new").not.toEqual(C1);
  expect(C2b).not.toEqual(C2);
  const Sb = await stripBytes(panel.locator('.strip[aria-label="Combined strip"]'));
  expect(Sb, "the strip does not depend on the keystream at all").toEqual(S);
  expect(Sb).toEqual(xorArrays(C1b.slice(0, S.length), C2b.slice(0, S.length)));
});

// ---------------------------------------------------------------- panel 5

test("panel 5: pasted ciphertexts are parsed, counted and combined honestly", async ({ page }) => {
  await page.goto(".");
  const panel = page.locator("#panel-import");
  const c1 = panel.getByLabel("Ciphertext 1 (hex)");
  const c2 = panel.getByLabel("Ciphertext 2 (hex)");

  await expect(panel.locator(".import-status")).toContainText(
    "Paste two hex ciphertexts, or load a challenge below",
  );

  // Invalid hex is refused by name, and no strip is produced.
  await typeInto(c1, "zz zz");
  await typeInto(c2, "00 01");
  await expect(panel.locator(".import-status .status--danger")).toContainText(
    "not valid hex",
  );
  await expect(panel.locator('#panel-import .strip[aria-label="Combined strip"] .byte')).toHaveCount(
    0,
  );

  // An odd number of hex digits is equally invalid.
  await typeInto(c1, "000");
  await expect(panel.locator(".import-status .status--danger")).toBeVisible();

  // Equal lengths: the parse report and the strip must agree.
  await typeInto(c1, "00 01 02 03");
  await typeInto(c2, "ff 01 7f 03");
  await expect(panel.locator(".import-status .status--calm")).toContainText(
    "Parsed C1 (4 B) and C2 (4 B). Attackable overlap: 4 bytes",
  );
  expect(
    await stripBytes(panel.locator('.strip[aria-label="Combined strip"]')),
  ).toEqual([0xff, 0x00, 0x7d, 0x00]);

  // Unequal lengths: overlap is the shorter, and the page says the tail is safe.
  await typeInto(c1, "00 01 02 03 04 05");
  const status = await statusText(panel.locator(".import-status .status--calm"));
  expect(status).toContain("Parsed C1 (6 B) and C2 (4 B). Attackable overlap: 4 bytes");
  expect(status).toContain("the longer tail cannot be attacked by this method");
  expect(
    (await stripBytes(panel.locator('.strip[aria-label="Combined strip"]'))).length,
  ).toBe(4);
});

test("panel 5: the reused challenges cancel and the control challenge does not", async ({
  page,
}) => {
  await page.goto(".");
  const panel = page.locator("#panel-import");

  await panel.getByRole("button", { name: /Easy · common words/ }).click();
  await expect(panel.locator(".import-status")).toContainText('Try the crib " the "');
  await panel.locator(".truth-toggle input").check();

  const S = await stripBytes(panel.locator('.strip[aria-label="Combined strip"]'));
  const aP1 = await stripBytes(strip(panel, "Actual P1"));
  const aP2 = await stripBytes(strip(panel, "Actual P2"));
  expect(S, "a reused-keystream challenge must be P1 XOR P2").toEqual(xorArrays(aP1, aP2));

  // Pin a crib and check it peels both, exactly as in panel 3.
  await typeInto(panel.locator(".crib-input"), "the ");
  await panel.locator(".strip--interactive .byte").nth(0).click();
  await panel.locator("button.btn--pin").click();
  const rec = await statusText(panel.locator(".recon-block .status"));
  expect(rec).toContain(`4 / ${S.length} bytes recovered`);
  expect((await stripBytes(strip(panel, "Reconstructed P2"))).slice(0, 4)).toEqual(
    aP2.slice(0, 4),
  );

  // The control challenge is the same two plaintexts under INDEPENDENT keystreams.
  await panel.getByRole("button", { name: /Control · NO key reuse/ }).click();
  await expect(panel.locator(".import-status")).toContainText("Two independent keystreams");
  expect(
    (await recovered(panel)).solved,
    "loading a different challenge must clear the old reconstruction",
  ).toBe(0);

  await panel.locator(".truth-toggle input").check();
  const S2 = await stripBytes(panel.locator('.strip[aria-label="Combined strip"]'));
  const cP1 = await stripBytes(strip(panel, "Actual P1"));
  const cP2 = await stripBytes(strip(panel, "Actual P2"));
  const truth = xorArrays(cP1, cP2);
  const differing = S2.filter((b, i) => b !== truth[i]).length;
  expect(
    differing,
    "without reuse the strip must not be P1 XOR P2 — that is the control's whole point",
  ).toBeGreaterThan(S2.length * 0.9);
});

// ---------------------------------------------------------------- walkthrough

test("the guided walkthrough advances, finishes and closes", async ({ page }) => {
  await page.goto(".");
  const wt = page.locator(".wt");
  const panel = wt.locator(".wt-panel");

  await expect(panel).toBeHidden();
  await wt.getByRole("button", { name: /Start guided walkthrough/ }).click();
  await expect(panel).toBeVisible();

  // textContent, not innerText: the progress line is uppercased by CSS.
  const progress = wt.locator(".wt-progress");
  const first = (await progress.textContent()) ?? "";
  const m = /Step \d+ of (\d+)/.exec(first);
  expect(m, `unparseable progress: ${first}`).not.toBeNull();
  const total = Number(m![1]);
  expect(first).toBe(`Step 1 of ${total}`);
  await expect(wt.getByRole("button", { name: "← Back" })).toBeDisabled();

  const titles = new Set<string>();
  for (let step = 1; step <= total; step++) {
    expect(await progress.textContent()).toBe(`Step ${step} of ${total}`);
    titles.add((await wt.locator(".wt-title").textContent()) ?? "");
    const next = wt.getByRole("button", {
      name: step === total ? "Finish ✓" : "Next →",
    });
    await expect(next).toBeVisible();
    await next.click();
  }
  expect(titles.size, "every step must have its own title").toBe(total);

  // Finishing closes the walkthrough and restores the start button.
  await expect(panel).toBeHidden();
  await expect(wt.getByRole("button", { name: /Start guided walkthrough/ })).toBeVisible();

  // Escape exits from anywhere.
  await wt.getByRole("button", { name: /Start guided walkthrough/ }).click();
  await expect(panel).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
});
