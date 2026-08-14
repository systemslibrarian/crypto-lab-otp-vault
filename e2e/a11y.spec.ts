import { test } from "@playwright/test";
import { boot, driveAllStates, expectBaselineNotStale, NARROW } from "./gate";

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

/**
 * The baseline's third rule: no entry may survive that the lab no longer
 * produces.
 *
 * `nontext-baseline.ts` announces three rules and only two of them were ever
 * live — `expectBaselineNotStale` was exported from `gate.ts` and imported by
 * nothing, so a finding that got FIXED kept its entry forever and the file
 * could only grow. This is that rule's call site.
 *
 * It has to drive BOTH themes before it ratchets, and that is measured rather
 * than chosen. The baseline is one flat set, but this lab's control boundaries
 * are theme-split: in dark, `button.btn`, `button.btn.btn--icon`,
 * `button.btn.wt-start` and `button.candidate-btn` clear 3:1 while
 * `button.btn.btn--pin` and `div.crib-chip` fail; in light it is exactly the
 * other way round. So a call at the end of any single configuration reports the
 * other theme's six entries as stale on every run — all four were tried, and
 * all four failed that way. Only the union of the two themes sees all fourteen.
 *
 * Desktop width is enough: the 380px runs surfaced no entry the 1280px runs
 * missed. And this must be verified by running it ALONE — `nonTextSeen` is
 * module state, so under `--workers=1` a wrongly-placed call would free-ride on
 * the tests above and look sound.
 */
test("the non-text baseline holds no entry this lab no longer produces", async ({
  page,
}) => {
  test.setTimeout(900_000);
  for (const theme of ["dark", "light"] as const) {
    await boot(page, theme);
    await driveAllStates(page, `${theme} / baseline staleness sweep`);
  }
  expectBaselineNotStale();
});
