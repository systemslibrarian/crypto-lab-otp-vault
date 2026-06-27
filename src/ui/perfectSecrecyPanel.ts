import { el, byteStrip, statusLine } from "./dom.ts";
import { panelShell } from "./otpPanel.ts";
import {
  textToBytes,
  bytesToText,
  generateKey,
  encrypt,
  decrypt,
  deriveKey,
} from "../otp/otp.ts";
import type { Bytes } from "../otp/types.ts";

// Panel 2 — perfect secrecy. One ciphertext is fixed. The user types ANY target
// plaintext of the same length; we derive the key k = c ⊕ p that produces it and
// prove c ⊕ k === p. The "aha": one OTP ciphertext is consistent with every
// plaintext of its length, so it leaks nothing but length (Shannon 1949).

export function perfectSecrecyPanel(): HTMLElement {
  // Fix a ciphertext once: a real plaintext under a real random key, then we
  // throw the key away and pretend we're the attacker holding only C.
  const truePlain = textToBytes("ATTACK AT DAWN");
  const trueKey = generateKey(truePlain.length);
  const ciphertext: Bytes = encrypt(truePlain, trueKey);
  const N = ciphertext.length;

  const input = el("input", {
    id: "ps-target",
    class: "msg-input",
    type: "text",
    maxlength: 400,
    "aria-describedby": "ps-help",
  }) as HTMLInputElement;
  input.value = "TOTALLY WRONG!";

  const output = el("div", { class: "panel-output" });

  function render(): void {
    output.replaceChildren();
    const target = textToBytes(input.value);

    output.append(
      byteStrip(`Fixed ciphertext  C (${N} bytes — all the attacker has)`, ciphertext, {
        cellClass: () => "cipher",
      }),
    );

    if (target.length !== N) {
      output.append(
        statusLine(
          "⚠",
          `Your target is ${target.length} byte${target.length === 1 ? "" : "s"}; it must be exactly ${N} bytes to be a candidate for this ciphertext. (Remember: bytes, not characters.)`,
          "neutral",
        ),
      );
      return;
    }

    const k = deriveKey(ciphertext, target); // k = c ⊕ p
    const check = decrypt(ciphertext, k); // c ⊕ k should equal p
    const valid = bytesToText(check) === bytesToText(target);

    output.append(
      byteStrip("Your chosen plaintext  P", target, { cellClass: () => "calm" }),
      el("div", { class: "xor-op", text: "derive key:  K = C ⊕ P" }),
      byteStrip("Derived key  K (a perfectly valid OTP key)", k),
      el("div", { class: "xor-op", text: "verify:  C ⊕ K  should equal  P" }),
      byteStrip("C ⊕ K", check, { cellClass: () => "calm" }),
      valid
        ? statusLine(
            "✓",
            "This key is genuinely valid: the same ciphertext decrypts to YOUR chosen plaintext under it. No plaintext is any more 'real' than another.",
            "calm",
          )
        : statusLine("✕", "Verification failed (should not happen).", "danger"),
    );
  }

  input.addEventListener("input", render);
  render();

  return panelShell({
    id: "panel-secrecy",
    tone: "neutral",
    icon: "🧩",
    title: "2 · Perfect secrecy — every plaintext is possible",
    badge: "theory",
    notWhat:
      "Not key distribution — OTP is impractical because the key is as long as the message, must be shared securely, and must never be reused (that's BB84 / QKD territory).",
    body: [
      el("p", {
        class: "lead",
        text: `A single ${N}-byte ciphertext is shown below. Type ANY ${N}-byte plaintext and watch a valid key appear that maps this exact ciphertext to it.`,
      }),
      el("label", { class: "field-label", for: "ps-target", text: `Target plaintext (must be ${N} bytes)` }),
      input,
      el("p", {
        id: "ps-help",
        class: "help",
        text: "Because for every guess there exists a key, the ciphertext is consistent with all of them at once — it reveals nothing but its length. That is information-theoretic security (Shannon, 1949).",
      }),
      output,
    ],
  });
}
