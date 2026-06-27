import { el, byteStrip, statusLine } from "./dom.ts";
import { panelShell } from "./otpPanel.ts";
import { textToBytes, generateKey, encrypt } from "../otp/otp.ts";
import { combineCiphertexts } from "../otp/cribdrag.ts";
import { cribWorkbench, type Workbench } from "./cribWorkbench.ts";
import type { Bytes } from "../otp/types.ts";

// Panel 3 (centerpiece) — the two-time-pad MISTAKE. Two messages under the SAME
// key. C1 ⊕ C2 = P1 ⊕ P2 (the key cancels). The crib-drag attack itself lives in
// the reusable cribWorkbench; this panel owns the danger framing, the editable
// messages, the keys, and the key-cancellation explanation.

export function twoTimePadPanel(): HTMLElement {
  let p1text = "the quick brown fox jumps over the lazy dog";
  let p2text = "pack my box with five dozen liquor jugs run";
  let reuseKey = true; // DANGER default for the lesson; toggle off to disprove

  let p1: Bytes = textToBytes(p1text);
  let p2: Bytes = textToBytes(p2text);
  let sharedKey: Bytes = generateKey(Math.max(p1.length, p2.length));
  let key2: Bytes = generateKey(Math.max(p1.length, p2.length));
  let c1: Bytes = new Uint8Array();
  let c2: Bytes = new Uint8Array();
  let strip: Bytes = new Uint8Array(); // C1 ⊕ C2

  const cipherOutput = el("div", { class: "ttp-output" });

  function growKey(key: Bytes, n: number): Bytes {
    if (key.length >= n) return key;
    const grown = new Uint8Array(n);
    grown.set(key);
    grown.set(generateKey(n - key.length), key.length);
    return grown;
  }

  function recompute(): void {
    p1 = textToBytes(p1text);
    p2 = textToBytes(p2text);
    const need = Math.max(p1.length, p2.length);
    sharedKey = growKey(sharedKey, need);
    key2 = growKey(key2, need);
    const usedKey2 = reuseKey ? sharedKey : key2;
    c1 = encrypt(p1, sharedKey.slice(0, p1.length));
    c2 = encrypt(p2, usedKey2.slice(0, p2.length));
    // keystream-reuse extension point: combineCiphertexts takes ANY two
    // equal-length ciphertexts — the keystreamReusePanel and importPanel feed it
    // the same way.
    strip = combineCiphertexts(c1, c2);
  }

  const workbench: Workbench = cribWorkbench({
    getStrip: () => strip,
    getTruth: () => ({ p1, p2 }),
    tone: "danger",
    labels: { stripTitle: "C1 ⊕ C2  (= P1 ⊕ P2 when key reused)" },
    initialCrib: "the ",
  });

  function update(): void {
    recompute();
    renderCiphers();
    workbench.refresh();
  }

  function renderCiphers(): void {
    cipherOutput.replaceChildren();
    cipherOutput.append(
      byteStrip("C1 = P1 ⊕ K", c1, { cellClass: () => "cipher" }),
      byteStrip(reuseKey ? "C2 = P2 ⊕ K  (same K!)" : "C2 = P2 ⊕ K₂  (different key)", c2, { cellClass: () => "cipher" }),
      reuseKey
        ? statusLine("⛔", "Same K both times ⇒ C1 ⊕ C2 = (P1 ⊕ K) ⊕ (P2 ⊕ K) = P1 ⊕ P2. The key is gone — only the two plaintexts XORed together remain.", "danger")
        : statusLine("✓", "Different keys ⇒ C1 ⊕ C2 = P1 ⊕ P2 ⊕ K ⊕ K₂. The keys do NOT cancel, so the strip below is genuine noise and no crib reads as text.", "calm"),
      ...(p1.length !== p2.length
        ? [statusLine("ℹ", `Messages differ in length (${p1.length} vs ${p2.length} bytes). Only the overlapping prefix of ${strip.length} bytes is attackable; the ${Math.abs(p1.length - p2.length)}-byte tail of the longer ciphertext has nothing to cancel against and stays secret.`, "neutral")]
        : []),
    );
  }

  // ---- persistent controls ----
  const reuseCb = el("input", { type: "checkbox" }) as HTMLInputElement;
  reuseCb.checked = reuseKey;
  const reuseLabelText = el("span");
  const toggle = el("label", { class: "toggle danger-toggle" }, [reuseCb, reuseLabelText]);
  function syncToggleLabel(): void {
    reuseLabelText.textContent = reuseKey
      ? "⛔ REUSING ONE KEY for both messages — the catastrophic mistake"
      : "✓ Two independent fresh keys (correct) — attack should fail";
    toggle.classList.toggle("danger-toggle--armed", reuseKey);
  }
  reuseCb.addEventListener("change", () => {
    reuseKey = reuseCb.checked;
    syncToggleLabel();
    update();
  });
  syncToggleLabel();

  const p1ta = makeTextarea(p1text, "Message P1", (v) => { p1text = v; update(); });
  const p2ta = makeTextarea(p2text, "Message P2", (v) => { p2text = v; update(); });
  const msgInputs = el("div", { class: "two-msgs" }, [
    el("div", { class: "msg-field" }, [el("span", { class: "field-label", text: "Message P1" }), p1ta]),
    el("div", { class: "msg-field" }, [el("span", { class: "field-label", text: "Message P2" }), p2ta]),
  ]);
  const keyCtrls = el("div", { class: "controls" }, [
    el("button", {
      type: "button",
      class: "btn",
      text: "↻ Re-roll session keys",
      onclick: () => {
        const n = Math.max(p1.length, p2.length, 1);
        sharedKey = generateKey(n);
        key2 = generateKey(n);
        update();
      },
    }),
  ]);

  update();

  return panelShell({
    id: "panel-ttp",
    tone: "danger",
    icon: "⛔",
    title: "3 · Two-time pad — the catastrophic key-reuse attack",
    badge: "the mistake",
    notWhat:
      "Not a game you 'win' — recovering these plaintexts is the encryption FAILING. The same flaw is keystream/nonce reuse in real stream ciphers (ChaCha20, AES-CTR/GCM) — see panel 4.",
    body: [
      el("p", {
        class: "lead",
        text: "Encrypt two messages with the SAME key and XORing the ciphertexts cancels the key. Drag a guessed word (a 'crib') across the result to peel both messages apart.",
      }),
      toggle,
      msgInputs,
      keyCtrls,
      cipherOutput,
      workbench.element,
    ],
  });
}

function makeTextarea(value: string, label: string, onChange: (v: string) => void): HTMLTextAreaElement {
  const ta = el("textarea", { class: "msg-input", rows: 2, "aria-label": label }) as HTMLTextAreaElement;
  ta.value = value;
  ta.addEventListener("input", () => onChange(ta.value));
  return ta;
}
