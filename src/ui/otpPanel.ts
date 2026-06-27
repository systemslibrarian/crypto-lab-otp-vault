import { el, byteStrip, statusLine } from "./dom.ts";
import {
  textToBytes,
  bytesToText,
  generateKey,
  encrypt,
  decrypt,
} from "../otp/otp.ts";
import type { Bytes } from "../otp/types.ts";

// Panel 1 — the correct OTP path: fresh random key per message (key length ==
// message length), byte-by-byte XOR, and an exact decrypt. Reads CALM/green
// because this is the system behaving correctly.

export function otpPanel(): HTMLElement {
  let message: Bytes = textToBytes("HELLO ONE-TIME PAD");
  let key: Bytes = generateKey(message.length);

  const input = el("textarea", {
    id: "otp-msg",
    class: "msg-input",
    rows: 2,
    "aria-describedby": "otp-msg-help",
  }) as HTMLTextAreaElement;
  input.value = "HELLO ONE-TIME PAD";

  const output = el("div", { class: "panel-output" });

  function render(): void {
    output.replaceChildren();
    if (message.length === 0) {
      output.append(
        statusLine("ℹ", "Type a message to see the one-time pad in action.", "neutral"),
      );
      return;
    }
    const cipher = encrypt(message, key);
    const restored = decrypt(cipher, key);
    const exact = bytesToText(restored) === bytesToText(message);

    output.append(
      byteStrip("Plaintext  P", message),
      el("div", { class: "xor-op", text: "⊕  XOR with fresh random key  ⊕" }),
      byteStrip("Key  K (random, |K| = |P|)", key),
      el("div", { class: "xor-op", text: "=  Ciphertext  =" }),
      byteStrip("Ciphertext  C = P ⊕ K", cipher, {
        cellClass: () => "cipher",
      }),
      el("div", { class: "xor-op", text: "↩  decrypt: C ⊕ K  ↩" }),
      byteStrip("Recovered  C ⊕ K", restored, { cellClass: () => "calm" }),
      exact
        ? statusLine(
            "✓",
            `Decryption is byte-exact (${message.length} bytes recovered). |K| = |P| = ${key.length}.`,
            "calm",
          )
        : statusLine("✕", "Mismatch — this should never happen.", "danger"),
      el("p", { class: "note", text: bytesToText(restored) }),
    );
  }

  function refreshKey(): void {
    key = generateKey(message.length);
    render();
  }

  input.addEventListener("input", () => {
    message = textToBytes(input.value);
    // Correct path: regenerate a fresh key sized to the new message. The UI is
    // structurally unable to produce a short key here (invariant 2).
    key = generateKey(message.length);
    render();
  });

  const controls = el("div", { class: "controls" }, [
    el("button", {
      type: "button",
      class: "btn",
      text: "↻ Generate fresh random key",
      onclick: refreshKey,
    }),
  ]);

  render();

  return panelShell({
    tone: "calm",
    icon: "🔒",
    title: "1 · One-Time Pad — encrypt & decrypt",
    badge: "correct use",
    notWhat:
      "Not a stream cipher — see ChaCha20 / Snow2 / Nonce Guard for keystream reuse in real ciphers.",
    body: [
      el("label", { class: "field-label", for: "otp-msg", text: "Message" }),
      input,
      el("p", {
        id: "otp-msg-help",
        class: "help",
        text: "XOR is on UTF-8 bytes, not characters — a 1-char emoji is several bytes. Each keystroke draws a fresh random key the same length as the message.",
      }),
      controls,
      output,
    ],
  });
}

// ---- shared panel shell ----

export interface PanelSpec {
  tone: "calm" | "danger" | "neutral";
  icon: string;
  title: string;
  badge: string;
  notWhat: string;
  body: (Node | string)[];
}

export function panelShell(spec: PanelSpec): HTMLElement {
  return el("section", { class: `panel panel--${spec.tone}` }, [
    el("header", { class: "panel-head" }, [
      el("span", { class: "panel-icon", "aria-hidden": "true", text: spec.icon }),
      el("h2", { class: "panel-title", text: spec.title }),
      el("span", { class: `badge badge--${spec.tone}`, text: spec.badge }),
    ]),
    el("p", { class: "not-what", text: `What this isn't: ${spec.notWhat}` }),
    ...spec.body,
  ]);
}
