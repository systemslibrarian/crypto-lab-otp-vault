import { test } from "@playwright/test";
import { boot, driveAllStates, NARROW } from "./gate";

/**
 * WCAG A/AA regression gate.
 *
 * The lab is driven the way a learner drives it: the guided walkthrough started
 * and stepped to its end and closed, panel 1 rekeyed and given a multi-byte
 * glyph and then emptied, panel 2 given a wrong-length target and then a valid
 * one, panel 3 attacked with a real crib — candidates ranked, an offset taken,
 * a crib pinned, the reconstruction and history rendered, the pin undone and
 * redone, the instructor truth revealed, the messages made unequal, key reuse
 * disarmed so the attack fails, and the session keys re-rolled — panel 4 driven
 * the same way, and panel 5 fed garbage hex, then each of the four built-in
 * challenges including the control that is designed not to break, then driven
 * from the keyboard and hand-edited so its ground truth withdraws. Every one of
 * those states is scanned, in both themes, at desktop and phone width.
 *
 * See `gate.ts` for why nothing is injected into the page, why each scan
 * asserts its content first, and why `violations` is not the whole oracle.
 */

for (const theme of ["dark", "light"] as const) {
  test(`no WCAG A/AA violations in ${theme} theme`, async ({ page }) => {
    test.setTimeout(900_000);
    await boot(page, theme);
    await driveAllStates(page, theme);
  });

  test(`no WCAG A/AA violations in ${theme} theme at 380px`, async ({ page }) => {
    test.setTimeout(900_000);
    await page.setViewportSize(NARROW);
    await boot(page, theme);
    await driveAllStates(page, `${theme} @380px`);
  });
}
