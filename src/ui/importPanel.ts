import { el, statusLine } from "./dom.ts";
import { panelShell } from "./otpPanel.ts";
import { combineCiphertexts } from "../otp/cribdrag.ts";
import { cribWorkbench, type Workbench, type WorkbenchTruth } from "./cribWorkbench.ts";
import { parseHex, type Bytes } from "../otp/types.ts";
import { buildChallenges, type Challenge } from "../otp/challenges.ts";

// Panel 5 — bring your own ciphertexts. Paste two hex ciphertexts (or load a
// built-in challenge) and the SAME crib-drag engine attacks them. This turns the
// demo into a reusable cryptanalysis playground; the engine is OTP-agnostic.

export function importPanel(): HTMLElement {
  const challenges = buildChallenges();

  let strip: Bytes = new Uint8Array();
  let truth: WorkbenchTruth | null = null; // known only for loaded challenges

  const status = el("div", { class: "import-status", "aria-live": "polite" });

  const c1ta = el("textarea", { class: "msg-input mono-input", rows: 2, "aria-label": "Ciphertext 1 (hex)", placeholder: "C1 as hex, e.g. 3f a1 09 ..." }) as HTMLTextAreaElement;
  const c2ta = el("textarea", { class: "msg-input mono-input", rows: 2, "aria-label": "Ciphertext 2 (hex)", placeholder: "C2 as hex" }) as HTMLTextAreaElement;

  const workbench: Workbench = cribWorkbench({
    getStrip: () => strip,
    getTruth: () => truth,
    tone: "neutral",
    labels: { stripTitle: "C1 ⊕ C2" },
    initialCrib: " the ",
  });

  function recompute(): void {
    status.replaceChildren();
    const b1 = parseHex(c1ta.value);
    const b2 = parseHex(c2ta.value);
    if (b1 === null || b2 === null) {
      strip = new Uint8Array();
      status.append(statusLine("✕", "One of the inputs is not valid hex (need pairs of 0-9 / a-f; spaces and commas are fine).", "danger"));
      return;
    }
    if (b1.length === 0 || b2.length === 0) {
      strip = new Uint8Array();
      status.append(statusLine("ℹ", "Paste two hex ciphertexts, or load a challenge below.", "neutral"));
      return;
    }
    strip = combineCiphertexts(b1, b2);
    const overlap = Math.min(b1.length, b2.length);
    status.append(
      statusLine(
        "✓",
        `Parsed C1 (${b1.length} B) and C2 (${b2.length} B). Attackable overlap: ${overlap} bytes${b1.length !== b2.length ? " (the longer tail cannot be attacked by this method)" : ""}.`,
        "calm",
      ),
    );
  }

  function update(): void {
    recompute();
    workbench.refresh();
  }

  // Manual edits invalidate any loaded ground truth.
  c1ta.addEventListener("input", () => { truth = null; update(); });
  c2ta.addEventListener("input", () => { truth = null; update(); });

  function loadChallenge(ch: Challenge): void {
    c1ta.value = ch.c1Hex;
    c2ta.value = ch.c2Hex;
    truth = ch.truth; // enables the instructor reveal toggle for verification
    recompute();
    status.append(statusLine(ch.reused ? "🎯" : "🧪", ch.hint, ch.reused ? "neutral" : "calm"));
    workbench.refresh();
  }

  const datasetRow = el(
    "div",
    { class: "dataset-row" },
    challenges.map((ch) =>
      el("button", {
        type: "button",
        class: `btn btn--ghost dataset-btn dataset-btn--${ch.difficulty}`,
        text: ch.label,
        onclick: () => loadChallenge(ch),
      }),
    ),
  );

  update();

  return panelShell({
    id: "panel-import",
    tone: "neutral",
    icon: "📥",
    title: "5 · Import two ciphertexts — cryptanalysis playground",
    badge: "playground",
    notWhat:
      "Not a key recovery tool — it recovers plaintexts only when the two ciphertexts share a keystream (OTP key reuse, or reused-nonce CTR/GCM/ChaCha20 output).",
    body: [
      el("p", {
        class: "lead",
        text: "Paste two ciphertexts as hex (or load a built-in challenge), then crib-drag exactly as in the panels above. Same engine, your data.",
      }),
      el("div", { class: "two-msgs" }, [
        el("div", { class: "msg-field" }, [el("span", { class: "field-label", text: "Ciphertext C1 (hex)" }), c1ta]),
        el("div", { class: "msg-field" }, [el("span", { class: "field-label", text: "Ciphertext C2 (hex)" }), c2ta]),
      ]),
      el("span", { class: "field-label", text: "Or load a challenge:" }),
      datasetRow,
      status,
      workbench.element,
    ],
  });
}
