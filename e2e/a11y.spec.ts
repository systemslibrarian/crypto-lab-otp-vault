import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * WCAG regression gate. Deploys are already gated on cryptographic correctness;
 * this gates them on accessibility the same way. Scans the full page with every
 * collapsible / hidden panel revealed and the interactive demos driven, in both
 * the dark (default) and light themes.
 */

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

// Kill transitions/animations/opacity fades: a mid-fade element produces phantom
// contrast failures that do not reflect the settled UI.
const NEUTRALIZE_MOTION = `
  *, *::before, *::after {
    transition: none !important;
    animation: none !important;
    opacity: 1 !important;
  }
`;

async function revealEverything(page: Page): Promise<void> {
  await page.evaluate(() => {
    // Open any native <details> (future-proofing; none today).
    for (const d of document.querySelectorAll("details")) {
      (d as HTMLDetailsElement).open = true;
    }
    // Reveal class-toggled / [hidden] panels (e.g. the guided walkthrough panel)
    // so their contents are scanned.
    for (const el of document.querySelectorAll<HTMLElement>("[hidden]")) {
      el.removeAttribute("hidden");
    }
  });
  await page.addStyleTag({ content: NEUTRALIZE_MOTION });
}

// Drive every demo control so dynamically injected output regions (byte strips,
// status lines, attack results, import status) are present when we scan. The
// panels render their output on load already; clicking every button additionally
// exercises the regenerate/reuse/attack paths and reveals armed-danger styling.
async function runDemos(page: Page): Promise<void> {
  const buttons = page.locator("#app button");
  const count = await buttons.count();
  for (let i = 0; i < count; i++) {
    const btn = buttons.nth(i);
    if (await btn.isVisible().catch(() => false)) {
      await btn.click({ trial: false }).catch(() => {
        /* non-fatal: some buttons toggle state we don't care to assert */
      });
    }
  }
  // Re-reveal anything a click may have re-hidden, and re-neutralize motion for
  // freshly injected nodes.
  await revealEverything(page);
}

async function scan(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const summary = results.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.map((n) => n.target.join(" ")).slice(0, 5),
  }));
  expect(summary).toEqual([]);
}

test("no WCAG A/AA violations in dark theme", async ({ page }) => {
  await page.goto(".");
  await expect(page.locator("#app")).toBeVisible();
  await revealEverything(page);
  await runDemos(page);
  await scan(page);
});

test("no WCAG A/AA violations in light theme", async ({ page }) => {
  await page.goto(".");
  await page.locator("#cl-theme-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await revealEverything(page);
  await runDemos(page);
  await scan(page);
});
