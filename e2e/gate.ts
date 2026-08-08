import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
import { auditContrast, formatContrastFailures } from './contrast';

export const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/** A phone-width viewport, for the WCAG 1.4.10 reflow half of the gate. */
export const NARROW = { width: 380, height: 800 };

/**
 * Shared machinery for the WCAG gate.
 *
 * Three rules govern everything here:
 *
 *  1. NOTHING IS INJECTED INTO THE PAGE BEFORE A SCAN.
 *
 *  2. EVERY SCAN ASSERTS ITS CONTENT IS PRESENT FIRST, and there are scans well
 *     past first paint. axe over an empty container passes having checked
 *     nothing. This lab renders its five panels on load, so first paint is not
 *     empty — but almost every state that carries the lesson is behind an
 *     interaction: the guided walkthrough is `hidden` until started, the
 *     import panel is empty until a challenge loads, the two-time-pad's
 *     "different keys, attack fails" branch needs the danger toggle turned OFF,
 *     the pinned-crib history and the reconstruction only exist after a pin,
 *     the instructor reveal is behind a checkbox, and every "wrong length" /
 *     "not valid hex" status is its own colour on its own surface.
 *
 *     It also means A GATE MUST NOT STRIP `hidden` TO SCAN THE WALKTHROUGH.
 *     The start button and the walkthrough panel are the two halves of one
 *     toggle; showing both at once is a layout no reader ever gets.
 *
 *  3. `violations` IS NOT THE WHOLE ORACLE. See `scan`.
 */

/**
 * Wait for every running animation and transition to drain.
 *
 * Transitions drain in waves, not in one batch, so a poll for "nothing running
 * right now" can exit through a gap between waves. Require quiescence to hold
 * for several consecutive frames instead.
 */
export async function settle(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const w = window as unknown as { __quietFrames?: number };
      const running = document.getAnimations().filter((a) => a.playState === 'running');
      w.__quietFrames = running.length === 0 ? (w.__quietFrames ?? 0) + 1 : 0;
      return w.__quietFrames >= 6;
    },
    undefined,
    { timeout: 20_000, polling: 'raf' }
  );
}

/**
 * Assert that reduced motion left the page visible, not merely un-animated.
 *
 * The failure mode this guards against is an element whose only route to its
 * visible state is an animation, in a stylesheet whose reduced-motion block
 * cancels that animation without restoring its end state — the element then
 * renders at `opacity: 0` for every reader with the preference set.
 */
async function expectNotBlank(page: Page, label: string): Promise<void> {
  const invisible = await page.evaluate(() => {
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const own = Array.from(el.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent ?? '')
        .join('')
        .trim();
      if (!own) continue;
      // Deliberately hidden subtrees are not "blank", they are closed.
      if (!(el as HTMLElement).checkVisibility?.({ checkVisibilityCSS: true })) continue;
      let effective = 1;
      let node: Element | null = el;
      while (node) {
        effective *= parseFloat(getComputedStyle(node).opacity);
        node = node.parentElement;
      }
      if (effective === 0) {
        out.push(`${el.tagName.toLowerCase()}.${(el.getAttribute('class') ?? '').trim()}`);
      }
    }
    return Array.from(new Set(out));
  });
  expect(invisible, `no visible text may render at opacity 0 in state: ${label}`).toEqual([]);
}

/**
 * Load the page in a known theme with reduced motion actually in effect, and
 * assert the content every scan relies on is really on the page.
 *
 * `test.use({ reducedMotion })` silently does nothing on Playwright 1.61.1, so
 * the emulation is applied imperatively BEFORE the navigation and then
 * *asserted* from inside the page.
 */
export async function boot(page: Page, theme: 'dark' | 'light'): Promise<void> {
  // A click on a control that never becomes actionable otherwise burns the
  // whole test timeout and reports nothing useful. 20s turns that silent hang
  // into a named failure naming the locator.
  page.setDefaultTimeout(20_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript((t) => localStorage.setItem('theme', t), theme);
  await page.goto('.');
  expect(
    await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
    'reduced-motion emulation must actually be in effect'
  ).toBe(true);
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

  // All five panels render on load; the walkthrough is the half of the page
  // that does not, and its start button is what a reader actually sees.
  await expect(page.locator('#panel-otp')).toBeVisible();
  await expect(page.locator('#panel-import')).toBeVisible();
  await expect(page.locator('.wt-start')).toBeVisible();
  await expect(page.locator('.wt-panel')).toBeHidden();

  await settle(page);
  await expectNotBlank(page, `${theme} first paint`);
}

/**
 * Assert the page does not require horizontal scrolling.
 *
 * WCAG 1.4.10 (Reflow, AA). axe has no rule for this at all, and this lab is a
 * plausible offender: it lays every byte of every message out as a non-wrapping
 * hex-over-glyph column, twelve strips of them at a time, plus a crib chip
 * absolutely positioned over one of those strips and a two-column message grid.
 */
export async function expectNoHorizontalOverflow(page: Page, label: string): Promise<void> {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    if (doc.scrollWidth <= doc.clientWidth) return null;

    // Only elements that actually push the DOCUMENT sideways are culprits. A
    // wide table inside an `overflow-x: auto` wrapper has a huge bounding rect
    // but is clipped by its scroller and contributes nothing to the document's
    // scroll width — naming it sends you off fixing the wrong element. That
    // cost a run elsewhere in this fleet (a 980px table was reported while the
    // real overflow was 15px of something else), and this lab is full of such
    // decoys: every `.strip` is far wider than its `.strip-wrap`, by design.
    const clipped = (el: Element): boolean => {
      let n = el.parentElement;
      while (n && n !== doc) {
        const ox = getComputedStyle(n).overflowX;
        if (ox === 'auto' || ox === 'scroll' || ox === 'hidden' || ox === 'clip') return true;
        n = n.parentElement;
      }
      return false;
    };

    const over = Array.from(document.querySelectorAll('body *'))
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter((x) => x.r.width > 0 && x.r.right > doc.clientWidth + 1)
      .sort((a, b) => b.r.right - a.r.right);
    // Prefer an unclipped culprit; fall back to the widest clipped one rather
    // than reporting nothing, so the message always names something to look at.
    const widest = over.filter((x) => !clipped(x.el))[0] ?? over[0];
    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
      widest: widest
        ? `${clipped(widest.el) ? '[clipped] ' : ''}${widest.el.tagName.toLowerCase()}${widest.el.id ? '#' + widest.el.id : ''}` +
          `${widest.el.getAttribute('class') ? '.' + widest.el.getAttribute('class')!.trim().split(/\s+/).join('.') : ''}` +
          ` @${Math.round(widest.r.width)}px right=${Math.round(widest.r.right)}`
        : '(none identified)',
    };
  });
  expect(overflow, `page must not scroll horizontally in state: ${label}`).toBeNull();
}

/**
 * Every scrolling container must be operable from the keyboard (WCAG 2.1.1).
 * If it holds no focusable content it needs `tabindex="0"`, so it becomes a
 * focus target arrow keys can then scroll.
 *
 * Every byte strip on this page is a horizontal scroller, and there are a dozen
 * of them in the driven states — so this runs after each one at both widths
 * rather than once at first paint.
 */
export async function expectScrollersReachable(page: Page, label: string): Promise<void> {
  const unreachable = await page.evaluate(() => {
    const FOCUSABLE = 'a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])';
    return Array.from(document.querySelectorAll<HTMLElement>('body *'))
      .filter((el) => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)
      .filter((el) => {
        const cs = getComputedStyle(el);
        return (
          ['auto', 'scroll'].includes(cs.overflowX) || ['auto', 'scroll'].includes(cs.overflowY)
        );
      })
      .filter((el) => el.tabIndex < 0 && !el.querySelector(FOCUSABLE))
      .map(
        (el) =>
          `${el.tagName.toLowerCase()}.${(el.getAttribute('class') ?? '').trim()}` +
          ` (${el.scrollWidth}x${el.scrollHeight} in ${el.clientWidth}x${el.clientHeight})`
      );
  });
  expect(
    Array.from(new Set(unreachable)),
    `scrolling regions with no keyboard route in state: ${label}`
  ).toEqual([]);
}

/**
 * Scan the page as it currently stands.
 *
 * Five assertions, because axe's `violations` array alone is not a complete
 * oracle:
 *
 *  - `violations` — the usual WCAG A/AA rule failures.
 *  - `incomplete` — axe's "could not decide" bucket, which never reaches the
 *    violations array. The one rule id allowed to remain incomplete is
 *    `color-contrast`, and only because the next assertion computes those
 *    ratios arithmetically. Everything else in that bucket is a real result
 *    axe simply could not finish — including `aria-prohibited-attr`, which is
 *    where an `aria-label` on a role-less div hides, a defect that never
 *    reaches the violations array at all.
 *  - arithmetic contrast — composite-aware WCAG 1.4.3 over every text node.
 *  - keyboard reachability of scrolling regions — WCAG 2.1.1.
 *  - reflow — WCAG 1.4.10, which axe has no rule for at all.
 */
export async function scan(page: Page, label: string): Promise<void> {
  await settle(page);
  await expectNotBlank(page, label);
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();

  const violations = results.violations.map((v) => ({
    state: label,
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 8),
  }));
  expect(violations, `axe violations in state: ${label}`).toEqual([]);

  const unexplainedIncomplete = results.incomplete
    .filter((v) => v.id !== 'color-contrast')
    .map((v) => ({
      state: label,
      id: v.id,
      nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 8),
    }));
  expect(unexplainedIncomplete, `axe incomplete results in state: ${label}`).toEqual([]);

  const contrast = Array.from(new Set(formatContrastFailures(await auditContrast(page))));
  expect(contrast, `measured contrast failures in state: ${label}`).toEqual([]);

  await expectScrollersReachable(page, label);
  await expectNoHorizontalOverflow(page, label);
}

/**
 * Drive the lab through the states that render content, scanning each.
 *
 * The five panels are all mounted on load, so the drive is not about revealing
 * them — it is about reaching the states inside them. Every colour this lab
 * teaches with lives in one of those states: `--calm` on the correct-use path,
 * `--danger` on the armed key-reuse toggle and its recovered plaintexts,
 * `--warn` on non-printable bytes, and the neutral tone on "your target is the
 * wrong length" and "that isn't valid hex".
 *
 * So the drive deliberately visits every failure branch as well as the happy
 * one:
 *
 *   - panel 1 emptied, which swaps the whole output for a single neutral line;
 *   - panel 2 at the wrong byte length, its only warning branch;
 *   - panel 3 with key reuse turned OFF, the "the attack should now fail"
 *     rendering that exists to prove the attack needs the mistake — and with
 *     messages of unequal length, which adds an overlap note;
 *   - panel 5 with garbage in the hex box, and empty, and with each of the four
 *     built-in challenges including the control that is designed not to break.
 *
 * The crib workbench is driven the way a learner drives it: a crib typed, an
 * offset nudged, a candidate offset taken, the crib pinned (which is the only
 * route to the history list and the recovered-bytes reconstruction), undone,
 * redone, and the instructor truth toggle opened.
 */
export async function driveAllStates(page: Page, theme: string): Promise<void> {
  const scanAt = (s: string): Promise<void> => scan(page, `${theme} / ${s}`);

  await scanAt('first paint');

  await page.locator('a.cl-skip-link').focus();
  await scanAt('shared skip link focused');

  // ── The guided walkthrough ────────────────────────────────────────────────
  // `hidden` until started, and its start button hides in exchange — the two
  // are one toggle, so both halves are visited rather than both revealed.
  await page.locator('.wt-start').click();
  await expect(page.locator('.wt-panel')).toBeVisible();
  await expect(page.locator('.wt-start')).toBeHidden();
  await expect(page.locator('.wt-progress')).toHaveText('Step 1 of 6');
  // Step 1 has Back disabled, which is its own rendering.
  await expect(page.locator('.wt-controls button').first()).toBeDisabled();
  await scanAt('walkthrough step 1');

  for (const step of [2, 3, 4, 5, 6] as const) {
    await page.locator('.wt-controls button').last().click();
    await expect(page.locator('.wt-progress')).toHaveText(`Step ${step} of 6`);
    if (step === 6) await expect(page.locator('.wt-controls button').last()).toHaveText('Finish ✓');
  }
  await scanAt('walkthrough final step');
  await page.locator('.wt-close').click();
  await expect(page.locator('.wt-panel')).toBeHidden();
  await expect(page.locator('.wt-start')).toBeVisible();

  // ── Panel 1: the correct OTP path ─────────────────────────────────────────
  const otpMsg = page.locator('#otp-msg');
  const otpOut = page.locator('#panel-otp .panel-output');
  await expect(otpOut.locator('.strip')).toHaveCount(4);
  await expect(otpOut.locator('.status--calm')).toHaveCount(1);

  await page.locator('#panel-otp .controls button').click();
  await expect(otpOut.locator('.status--calm')).toContainText('byte-exact');
  await scanAt('panel 1: fresh key generated');

  // A multi-byte glyph, because the panel's whole point is bytes-not-characters.
  await otpMsg.fill('secrets ✈ fly');
  await expect(otpOut.locator('.status--calm')).toContainText('byte-exact');
  await expect(otpOut.locator('.byte--np').first()).toBeVisible();
  await scanAt('panel 1: multi-byte message');

  // Emptied: the output collapses to a single neutral line and NO strips.
  await otpMsg.fill('');
  await expect(otpOut.locator('.strip')).toHaveCount(0);
  await expect(otpOut.locator('.status--neutral')).toHaveCount(1);
  await scanAt('panel 1: message emptied');
  await otpMsg.fill('HELLO ONE-TIME PAD');
  await expect(otpOut.locator('.status--calm')).toBeVisible();

  // ── Panel 2: perfect secrecy ──────────────────────────────────────────────
  const psTarget = page.locator('#ps-target');
  const psOut = page.locator('#panel-secrecy .panel-output');
  // The ciphertext is 14 bytes ("ATTACK AT DAWN"), and the shipped default
  // target is the same length, so the valid branch is what first paint shows.
  await expect(psOut.locator('.status--calm')).toBeVisible();

  await psTarget.fill('too short');
  await expect(psOut.locator('.status--neutral')).toContainText('it must be exactly');
  await expect(psOut.locator('.strip')).toHaveCount(1);
  await scanAt('panel 2: target is the wrong length');

  await psTarget.fill('SURRENDER NOW!');
  await expect(psOut.locator('.status--calm')).toContainText('genuinely valid');
  await expect(psOut.locator('.strip')).toHaveCount(4);
  await scanAt('panel 2: a different plaintext, an equally valid key');

  // ── Panel 3: the two-time pad ─────────────────────────────────────────────
  const ttp = page.locator('#panel-ttp');
  await expect(ttp.locator('.danger-toggle--armed')).toBeVisible();
  await expect(ttp.locator('.ttp-output .status--danger')).toBeVisible();
  await scanAt('panel 3: key reuse armed');

  // Drive the crib workbench the way a learner does.
  const bench = ttp.locator('.workbench');
  await bench.locator('.crib-input').fill('the ');
  await expect(bench.locator('.candidate-btn').first()).toBeVisible();
  await scanAt('panel 3: crib candidates ranked');

  await bench.locator('.candidate-btn').first().click();
  await expect(bench.locator('.reveal-row')).toBeVisible();
  await scanAt('panel 3: a candidate offset taken');

  await bench.locator('.btn--icon').first().click();
  await bench.locator('.btn--icon').last().click();
  await bench.locator('.btn--pin').click();
  // Pinning is the only route to the history list and the reconstruction.
  await expect(bench.locator('.history-item')).toHaveCount(1);
  await expect(bench.locator('.recon-block .status')).toBeVisible();
  await expect(bench.locator('.recon-block .strip')).toHaveCount(2);
  await expect(bench.locator('.byte--unknown').first()).toBeVisible();
  await scanAt('panel 3: one crib pinned, both plaintexts partly recovered');

  // The instructor reveal, which is a checkbox away and adds two more strips.
  await bench.locator('.truth-toggle input').check();
  await expect(bench.locator('.truth-box .strip')).toHaveCount(2);
  await scanAt('panel 3: instructor truth revealed');
  await bench.locator('.truth-toggle input').uncheck();

  await bench.locator('.btn--ghost').first().click(); // undo
  await expect(bench.locator('.history-item')).toHaveCount(0);
  await scanAt('panel 3: pin undone');
  await bench.locator('.btn--ghost').nth(1).click(); // redo
  await expect(bench.locator('.history-item')).toHaveCount(1);

  // Unequal message lengths add the neutral overlap note beside the danger one.
  await ttp.locator('.msg-field textarea').first().fill('short one');
  await expect(ttp.locator('.ttp-output .status--neutral')).toContainText('Only the overlapping');
  await scanAt('panel 3: messages of unequal length');

  // Key reuse OFF: the calm "the attack should now fail" branch, which no
  // successful run ever paints.
  await ttp.locator('.danger-toggle input').uncheck();
  await expect(ttp.locator('.danger-toggle--armed')).toHaveCount(0);
  await expect(ttp.locator('.ttp-output .status--calm')).toContainText('genuine noise');
  await scanAt('panel 3: key reuse disarmed, attack fails');

  await ttp.locator('.danger-toggle input').check();
  await ttp.locator('.controls button').click(); // re-roll session keys
  await expect(ttp.locator('.history-item')).toHaveCount(0);
  await scanAt('panel 3: session keys re-rolled');

  // ── Panel 4: the same break in a real stream cipher ───────────────────────
  const ks = page.locator('#panel-keystream');
  await expect(ks.locator('.ttp-output .status--danger')).toContainText('nonce repeated');
  await ks.locator('.workbench .crib-input').fill('the ');
  await ks.locator('.workbench .btn--pin').click();
  await expect(ks.locator('.workbench .history-item')).toHaveCount(1);
  await scanAt('panel 4: keystream reuse attacked');

  await ks.locator('.controls button').click(); // new, still-reused keystream
  await expect(ks.locator('.workbench .history-item')).toHaveCount(0);
  await scanAt('panel 4: keystream re-rolled');

  // ── Panel 5: bring your own ciphertexts ───────────────────────────────────
  const imp = page.locator('#panel-import');
  await expect(imp.locator('.import-status .status--neutral')).toContainText(
    'Paste two hex ciphertexts'
  );
  await scanAt('panel 5: empty');

  await imp.locator('.mono-input').first().fill('not hex at all');
  await expect(imp.locator('.import-status .status--danger')).toContainText('not valid hex');
  await scanAt('panel 5: invalid hex rejected');

  // Each challenge in turn, including the control, which is built NOT to break.
  const labels = [
    'Easy · common words',
    'Medium · military-style',
    'Hard · unusual vocabulary',
    'Control · NO key reuse',
  ] as const;
  for (const label of labels) {
    await imp.locator('.dataset-btn', { hasText: label }).click();
    // The control challenge appends its own calm hint beside the parse line,
    // so this asserts on the first status rather than "the" status.
    await expect(imp.locator('.import-status .status--calm').first()).toContainText('Parsed C1');
    await expect(imp.locator('.workbench .strip--interactive .byte').first()).toBeVisible();
    await scanAt(`panel 5: challenge loaded — ${label}`);
  }

  // The control challenge is the one where every crib reads as noise; pin one
  // anyway, because a partly-unknown reconstruction over a control strip is a
  // state with its own ink.
  await imp.locator('.workbench .crib-input').fill(' the ');
  await imp.locator('.workbench .btn--pin').click();
  await expect(imp.locator('.workbench .history-item')).toHaveCount(1);
  await scanAt('panel 5: crib pinned against the control challenge');

  // The crib chip is a keyboard-operable slider; move it with the keyboard,
  // which is the 2.1.1 route to an otherwise pointer-dragged control.
  const chip = imp.locator('.workbench .crib-chip');
  await chip.focus();
  await chip.press('ArrowRight');
  await chip.press('End');
  await scanAt('panel 5: crib chip driven from the keyboard');

  // Truth vanishes when a loaded challenge is hand-edited, which un-checks the
  // instructor toggle and empties its box.
  await imp.locator('.workbench .truth-toggle input').check();
  await expect(imp.locator('.workbench .truth-box .strip')).toHaveCount(2);
  await scanAt('panel 5: challenge truth revealed');
  await imp.locator('.mono-input').first().fill('00 11 22 33 44 55 66 77');
  await expect(imp.locator('.workbench .truth-box .strip')).toHaveCount(0);
  await expect(imp.locator('.workbench .truth-toggle input')).not.toBeChecked();
  await scanAt('panel 5: hand-edited hex, ground truth withdrawn');
}
