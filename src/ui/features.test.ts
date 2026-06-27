// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { twoTimePadPanel } from "./twoTimePadPanel.ts";
import { keystreamReusePanel } from "./keystreamReusePanel.ts";
import { importPanel } from "./importPanel.ts";
import { walkthrough } from "./walkthrough.ts";

function glyphs(root: ParentNode, ariaLabel: string, count: number): string {
  const strip = root.querySelector(`[aria-label="${ariaLabel}"]`)!;
  return Array.from(strip.querySelectorAll(".byte__glyph"))
    .slice(0, count)
    .map((c) => c.textContent)
    .join("");
}

function pin(root: ParentNode): void {
  Array.from(root.querySelectorAll("button"))
    .find((b) => /pin crib/i.test(b.textContent ?? ""))!
    .click();
}

describe("keyboard accessibility of the crib chip (#4)", () => {
  let panel: HTMLElement;
  beforeEach(() => {
    document.body.innerHTML = "";
    panel = twoTimePadPanel();
    document.body.append(panel);
  });

  function chip(): HTMLElement {
    return panel.querySelector<HTMLElement>('[role="slider"]')!;
  }
  function offsetNow(): number {
    return Number(chip().getAttribute("aria-valuenow"));
  }
  function press(key: string): void {
    chip().dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  }

  it("exposes a slider with valuemin/max/now", () => {
    const c = chip();
    expect(c.getAttribute("aria-valuemin")).toBe("0");
    expect(Number(c.getAttribute("aria-valuemax"))).toBeGreaterThan(0);
    expect(c.getAttribute("aria-valuenow")).toBe("0");
  });

  it("ArrowRight/ArrowLeft move the offset and clamp at 0", () => {
    press("ArrowRight");
    expect(offsetNow()).toBe(1);
    press("ArrowRight");
    expect(offsetNow()).toBe(2);
    press("ArrowLeft");
    press("ArrowLeft");
    press("ArrowLeft"); // would go to -1, must clamp
    expect(offsetNow()).toBe(0);
  });

  it("End jumps to the last valid offset, Home back to 0", () => {
    press("End");
    const max = Number(chip().getAttribute("aria-valuemax"));
    expect(offsetNow()).toBe(max);
    press("Home");
    expect(offsetNow()).toBe(0);
  });

  it("Enter pins the crib at the current offset", () => {
    press("Enter");
    expect(glyphs(panel, "Reconstructed P1", 4)).toBe("the ");
  });

  it("status messages use role=status live regions", () => {
    expect(panel.querySelector('[role="status"]')).toBeTruthy();
  });
});

describe("undo / redo / history (#2)", () => {
  let panel: HTMLElement;
  beforeEach(() => {
    document.body.innerHTML = "";
    panel = twoTimePadPanel();
    document.body.append(panel);
  });
  const byText = (re: RegExp) =>
    Array.from(panel.querySelectorAll("button")).find((b) => re.test(b.textContent ?? ""))!;

  it("pin → undo clears the recovered bytes; redo restores them", () => {
    pin(panel);
    expect(glyphs(panel, "Reconstructed P1", 4)).toBe("the ");
    expect(panel.querySelector(".history-item")).toBeTruthy();

    byText(/undo/i).click();
    expect(panel.querySelector(".history-item")).toBeNull();
    // After undo, position 0 is unknown again (rendered as "?").
    expect(glyphs(panel, "Reconstructed P1", 1)).toBe("?");

    byText(/redo/i).click();
    expect(glyphs(panel, "Reconstructed P1", 4)).toBe("the ");
  });

  it("undo button is disabled when there is nothing to undo", () => {
    const undo = byText(/undo/i) as HTMLButtonElement;
    expect(undo.disabled).toBe(true);
    pin(panel);
    expect(undo.disabled).toBe(false);
  });

  it("removing a pin from the history list clears its bytes", () => {
    pin(panel);
    expect(glyphs(panel, "Reconstructed P1", 4)).toBe("the ");
    panel.querySelector<HTMLButtonElement>(".history-remove")!.click();
    expect(panel.querySelector(".history-item")).toBeNull();
    expect(glyphs(panel, "Reconstructed P1", 1)).toBe("?");
  });
});

describe("instructor reveal toggle (#5)", () => {
  it("revealing shows the actual plaintexts", () => {
    document.body.innerHTML = "";
    const panel = twoTimePadPanel();
    document.body.append(panel);
    const toggle = panel.querySelector<HTMLInputElement>(".truth-toggle input")!;
    expect(panel.querySelector('[aria-label="Actual P1"]')).toBeNull();
    toggle.checked = true;
    toggle.dispatchEvent(new Event("change"));
    expect(glyphs(panel, "Actual P1", 3)).toBe("the");
  });
});

describe("keystream-reuse panel (#7)", () => {
  it("mounts and crib-drag recovers both plaintexts", () => {
    document.body.innerHTML = "";
    const panel = keystreamReusePanel();
    document.body.append(panel);
    // Default P1 starts with "transfer"; pin that crib at offset 0.
    const cribInput = panel.querySelector<HTMLInputElement>(".crib-input")!;
    cribInput.value = "transfer";
    cribInput.dispatchEvent(new Event("input"));
    pin(panel);
    expect(glyphs(panel, "Reconstructed P1", 8)).toBe("transfer");
    expect(glyphs(panel, "Reconstructed P2", 8)).toBe("the nonc");
  });
});

describe("import panel (#6)", () => {
  let panel: HTMLElement;
  beforeEach(() => {
    document.body.innerHTML = "";
    panel = importPanel();
    document.body.append(panel);
  });

  it("rejects invalid hex with a danger status", () => {
    const c1 = panel.querySelectorAll<HTMLTextAreaElement>(".mono-input")[0];
    c1.value = "nothex!!";
    c1.dispatchEvent(new Event("input"));
    expect(panel.querySelector(".import-status .status--danger")).toBeTruthy();
  });

  it("editing a ciphertext after a challenge load clears the reveal toggle", () => {
    Array.from(panel.querySelectorAll("button")).find((b) => /easy/i.test(b.textContent ?? ""))!.click();
    const toggle = panel.querySelector<HTMLInputElement>(".truth-toggle input")!;
    toggle.checked = true;
    toggle.dispatchEvent(new Event("change"));
    expect(panel.querySelector('[aria-label="Actual P1"]')).toBeTruthy();
    // Now hand-edit C1 — ground truth no longer applies.
    const c1 = panel.querySelectorAll<HTMLTextAreaElement>(".mono-input")[0];
    c1.value = c1.value + " ff";
    c1.dispatchEvent(new Event("input"));
    expect(toggle.checked).toBe(false);
    expect(panel.querySelector('[aria-label="Actual P1"]')).toBeNull();
  });

  it("loading the easy challenge enables solving it", () => {
    const loadEasy = Array.from(panel.querySelectorAll("button")).find((b) => /easy/i.test(b.textContent ?? ""))!;
    loadEasy.click();
    const cribInput = panel.querySelector<HTMLInputElement>(".crib-input")!;
    cribInput.value = "please b";
    cribInput.dispatchEvent(new Event("input"));
    pin(panel);
    // Crib is P1's prefix; revealed P2 prefix should be "the meet".
    expect(glyphs(panel, "Reconstructed P2", 8)).toBe("the meet");
  });
});

describe("guided walkthrough (#1)", () => {
  it("starts, advances, and finishes", () => {
    document.body.innerHTML = "";
    // Needs a target panel present for scrollIntoView/highlight.
    const target = twoTimePadPanel();
    const wt = walkthrough();
    document.body.append(wt, target);

    const region = wt.querySelector<HTMLElement>('[role="region"]')!;
    expect(region.hidden).toBe(true);

    wt.querySelector<HTMLButtonElement>(".wt-start")!.click();
    expect(region.hidden).toBe(false);
    expect(wt.querySelector(".wt-progress")?.textContent).toMatch(/step 1 of/i);

    wt.querySelector<HTMLButtonElement>(".wt-controls .btn:not(.btn--ghost)")!.click(); // Next
    expect(wt.querySelector(".wt-progress")?.textContent).toMatch(/step 2 of/i);

    // Esc exits.
    region.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    expect(region.hidden).toBe(true);
  });
});
