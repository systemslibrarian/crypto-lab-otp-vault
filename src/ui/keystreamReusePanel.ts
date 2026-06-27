import { el, byteStrip, statusLine } from "./dom.ts";
import { panelShell } from "./otpPanel.ts";
import { textToBytes, generateKey, encrypt } from "../otp/otp.ts";
import { combineCiphertexts } from "../otp/cribdrag.ts";
import { cribWorkbench, type Workbench } from "./cribWorkbench.ts";
import type { Bytes } from "../otp/types.ts";

// Panel 4 — the SAME failure in real stream ciphers. ChaCha20, AES-CTR and
// AES-GCM all encrypt as plaintext ⊕ keystream, where the keystream is derived
// from (key, nonce). Reuse a nonce under one key and you reuse the keystream S —
// which is exactly a two-time pad: C1 ⊕ C2 = (P1 ⊕ S) ⊕ (P2 ⊕ S) = P1 ⊕ P2.
//
// We do not implement ChaCha/AES here (not needed for the lesson); the keystream
// S is a pedagogical CSPRNG stand-in. The crib-drag engine is shared unchanged.

export function keystreamReusePanel(): HTMLElement {
  let p1text = "transfer 5000 to account 1182 at 0900";
  let p2text = "the nonce was reused — keystream leaks!";

  let p1: Bytes = textToBytes(p1text);
  let p2: Bytes = textToBytes(p2text);
  let keystream: Bytes = generateKey(Math.max(p1.length, p2.length)); // S = f(key, nonce)
  let c1: Bytes = new Uint8Array();
  let c2: Bytes = new Uint8Array();
  let strip: Bytes = new Uint8Array();

  const cipherOutput = el("div", { class: "ttp-output" });

  function growKeystream(s: Bytes, n: number): Bytes {
    if (s.length >= n) return s;
    const grown = new Uint8Array(n);
    grown.set(s);
    grown.set(generateKey(n - s.length), s.length);
    return grown;
  }

  function recompute(): void {
    p1 = textToBytes(p1text);
    p2 = textToBytes(p2text);
    keystream = growKeystream(keystream, Math.max(p1.length, p2.length));
    c1 = encrypt(p1, keystream.slice(0, p1.length)); // P1 ⊕ S
    c2 = encrypt(p2, keystream.slice(0, p2.length)); // P2 ⊕ S — SAME S = the bug
    // keystream-reuse extension point: identical combine step as the OTP panel.
    strip = combineCiphertexts(c1, c2);
  }

  const workbench: Workbench = cribWorkbench({
    getStrip: () => strip,
    getTruth: () => ({ p1, p2 }),
    tone: "danger",
    labels: { stripTitle: "C1 ⊕ C2  (= P1 ⊕ P2, keystream cancelled)" },
    initialCrib: "the ",
  });

  function renderCiphers(): void {
    cipherOutput.replaceChildren(
      byteStrip("C1 = P1 ⊕ S", c1, { cellClass: () => "cipher" }),
      byteStrip("C2 = P2 ⊕ S  (SAME keystream — reused nonce!)", c2, { cellClass: () => "cipher" }),
      statusLine(
        "⛔",
        "The nonce repeated, so S repeated. C1 ⊕ C2 cancels S and leaves P1 ⊕ P2 — the toy OTP mistake, now in a production cipher. This is why GCM/CTR nonces must never repeat under one key.",
        "danger",
      ),
      ...(p1.length !== p2.length
        ? [statusLine("ℹ", `Only the overlapping ${strip.length}-byte prefix leaks; the longer message's tail is encrypted under keystream bytes that were not reused.`, "neutral")]
        : []),
    );
  }

  function update(): void {
    recompute();
    renderCiphers();
    workbench.refresh();
  }

  const p1ta = makeTextarea(p1text, "Plaintext P1", (v) => { p1text = v; update(); });
  const p2ta = makeTextarea(p2text, "Plaintext P2", (v) => { p2text = v; update(); });
  const msgInputs = el("div", { class: "two-msgs" }, [
    el("div", { class: "msg-field" }, [el("span", { class: "field-label", text: "Plaintext P1" }), p1ta]),
    el("div", { class: "msg-field" }, [el("span", { class: "field-label", text: "Plaintext P2" }), p2ta]),
  ]);
  const keyCtrls = el("div", { class: "controls" }, [
    el("button", {
      type: "button",
      class: "btn",
      text: "↻ New (still-reused) keystream",
      onclick: () => {
        keystream = generateKey(Math.max(p1.length, p2.length, 1));
        update();
      },
    }),
  ]);

  update();

  return panelShell({
    id: "panel-keystream",
    tone: "danger",
    icon: "🔁",
    title: "4 · Keystream reuse in real ciphers — the same break",
    badge: "real-world",
    notWhat:
      "Not a ChaCha20/AES implementation — S is a stand-in keystream. The point is structural: nonce reuse in CTR/GCM/ChaCha20 reuses the keystream and reduces to a two-time pad.",
    body: [
      el("p", {
        class: "lead",
        text: "Stream ciphers encrypt as plaintext ⊕ keystream. The keystream comes from (key, nonce); repeat the nonce and you repeat the keystream — the identical failure from panel 3, in code people actually ship.",
      }),
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
