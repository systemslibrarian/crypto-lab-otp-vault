// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { otpPanel } from "./otpPanel.ts";
import { perfectSecrecyPanel } from "./perfectSecrecyPanel.ts";
import { twoTimePadPanel } from "./twoTimePadPanel.ts";

// End-to-end DOM smoke tests: every panel must mount and the two-time-pad
// crib-drag must actually peel both plaintexts apart through real UI events.

function glyphs(root: HTMLElement, ariaLabel: string, count: number): string {
  const strip = root.querySelector(`[aria-label="${ariaLabel}"]`)!;
  const cells = Array.from(strip.querySelectorAll(".byte__glyph")).slice(0, count);
  return cells.map((c) => c.textContent).join("");
}

describe("panels mount without throwing", () => {
  it("OTP panel renders byte strips and a calm exact-decrypt status", () => {
    const panel = otpPanel();
    document.body.append(panel);
    expect(panel.querySelector("textarea")).toBeTruthy();
    expect(panel.querySelectorAll(".strip").length).toBeGreaterThanOrEqual(4);
    expect(panel.querySelector(".status--calm")?.textContent).toMatch(/byte-exact/i);
  });

  it("Perfect-secrecy panel derives a valid key for the default target", () => {
    const panel = perfectSecrecyPanel();
    document.body.append(panel);
    const input = panel.querySelector<HTMLInputElement>("#ps-target")!;
    expect(input).toBeTruthy();
    // Default target is the same length as the fixed ciphertext → valid key shown.
    expect(panel.querySelector(".status--calm")).toBeTruthy();
  });

  it("Two-time-pad panel starts in the DANGER reuse state", () => {
    const panel = twoTimePadPanel();
    document.body.append(panel);
    const cb = panel.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    expect(cb.checked).toBe(true);
    expect(panel.querySelector(".status--danger")?.textContent).toMatch(/key is gone/i);
  });
});

describe("two-time-pad crib-drag recovers BOTH plaintexts via the UI", () => {
  let panel: HTMLElement;
  beforeEach(() => {
    document.body.innerHTML = "";
    panel = twoTimePadPanel();
    document.body.append(panel);
  });

  it("pinning the default crib at offset 0 fills P1='the ' and P2='pack'", () => {
    // Default crib is "the " (a guess for P1) at offset 0. Pin it.
    const pinBtn = Array.from(panel.querySelectorAll("button")).find((b) =>
      /pin crib/i.test(b.textContent ?? ""),
    )!;
    expect(pinBtn).toBeTruthy();
    pinBtn.click();

    expect(glyphs(panel, "Reconstructed P1", 4)).toBe("the ");
    expect(glyphs(panel, "Reconstructed P2", 4)).toBe("pack");

    const recon = panel.querySelector(".recon-block .status")!;
    expect(recon.textContent).toMatch(/4 \/ 43 bytes recovered/);
  });

  it("turning OFF key reuse makes the attack fail (no real recovery)", () => {
    const cb = panel.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    cb.checked = false;
    cb.dispatchEvent(new Event("change"));
    // With two independent keys the strip is genuine noise: the keys do NOT
    // cancel, so pinning the (previously correct) crib at offset 0 must NOT
    // reproduce P2's real prefix "pack".
    const pinBtn = Array.from(panel.querySelectorAll("button")).find((b) =>
      /pin crib/i.test(b.textContent ?? ""),
    )!;
    pinBtn.click();
    expect(glyphs(panel, "Reconstructed P2", 4)).not.toBe("pack");
    // The cancellation note flips to the calm "keys do NOT cancel" message.
    expect(panel.querySelector(".status--calm")?.textContent).toMatch(/do NOT cancel/i);
  });

  it("typing a message longer than the initial key does not crash (key grows)", () => {
    const p1ta = panel.querySelector<HTMLTextAreaElement>("textarea")!;
    // Default messages are 43 bytes; push well past that.
    p1ta.value = "a".repeat(200);
    expect(() => p1ta.dispatchEvent(new Event("input"))).not.toThrow();
    // The overlap strip now spans the shorter message; panel still renders.
    expect(panel.querySelector(".strip--interactive")).toBeTruthy();
  });

  it("a wrong crib does not reconstruct real text at offset 0", () => {
    const cribInput = panel.querySelector<HTMLInputElement>("#crib-input")!;
    cribInput.value = "zzzz";
    cribInput.dispatchEvent(new Event("input"));
    const pinBtn = Array.from(panel.querySelectorAll("button")).find((b) =>
      /pin crib/i.test(b.textContent ?? ""),
    )!;
    pinBtn.click();
    // Pinning a wrong crib still fills bytes (the math is honest), but the
    // revealed OTHER-plaintext bytes will NOT be "pack".
    expect(glyphs(panel, "Reconstructed P2", 4)).not.toBe("pack");
  });
});
