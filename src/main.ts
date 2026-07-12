import "./style.css";
import { otpPanel } from "./ui/otpPanel.ts";
import { perfectSecrecyPanel } from "./ui/perfectSecrecyPanel.ts";
import { twoTimePadPanel } from "./ui/twoTimePadPanel.ts";
import { keystreamReusePanel } from "./ui/keystreamReusePanel.ts";
import { importPanel } from "./ui/importPanel.ts";
import { walkthrough } from "./ui/walkthrough.ts";

// Mount all content at #app. The standardization pass (Parts 0 + A–E) wraps this
// with the shared header, theme toggle, README, and scripture footer.

const app = document.getElementById("app");
if (!app) throw new Error("#app mount point not found");

// Fleet-standard hero (managed): title block left, "why it matters" box right.
const hero = document.createElement("header");
hero.className = "cl-hero";
hero.innerHTML = `
  <div class="cl-hero-main">
    <h1 class="cl-hero-title">OTP Vault</h1>
    <p class="cl-hero-sub">One-Time Pad · Perfect Secrecy</p>
    <p class="cl-hero-desc">
      Encrypt and decrypt with a truly-random one-time pad, then reuse one keystream
      across two messages and crib-drag the XOR of their ciphertexts to recover both plaintexts.
    </p>
  </div>
  <aside class="cl-hero-why" aria-label="Why it matters">
    <span class="cl-hero-why-label">WHY IT MATTERS</span>
    <p class="cl-hero-why-text">
      The one-time pad is the only cipher proven unbreakable — but that guarantee dies
      the instant a key is used twice. Keystream reuse has sunk real systems (VENONA, WEP,
      broken RNGs), turning "perfect" secrecy into a crib-dragging exercise.
    </p>
  </aside>
`;

const intro = document.createElement("div");
intro.className = "lab-intro";
intro.innerHTML = `
  <p class="lab-tagline">
    The one-time pad is perfect secrecy itself: message XOR a truly random key as
    long as the message, used exactly once. Below you can encrypt and decrypt with
    it, see why a single ciphertext leaks nothing but length, and then watch the
    whole thing collapse the instant a key is reused twice.
  </p>
  <ul class="legend" aria-label="How to read this lab">
    <li><span class="legend-swatch legend-swatch--byte" aria-hidden="true">61<br>a</span>
      Each byte shows <strong>hex</strong> over its <strong>glyph</strong>; a non-printable
      byte renders as <strong>·</strong> so wrong guesses look like garbage.</li>
    <li><span class="legend-swatch legend-swatch--calm" aria-hidden="true">✓</span>
      <strong>Calm / green = the system working</strong> (correct OTP use, exact decrypt).</li>
    <li><span class="legend-swatch legend-swatch--danger" aria-hidden="true">⛔</span>
      <strong>Danger / red = the system failing</strong> (key reuse exploited). Recovering
      the plaintext is the cipher breaking, not a win.</li>
  </ul>
`;

const grounding = document.createElement("p");
grounding.className = "grounding";
grounding.innerHTML =
  'Grounded in Claude E. Shannon, <em>“Communication Theory of Secrecy Systems”</em> ' +
  "(Bell System Technical Journal, 1949), which proves the one-time pad achieves perfect " +
  "secrecy, and the classic two-time-pad / crib-dragging cryptanalysis. Everything runs " +
  "in your browser — keys come from <code>crypto.getRandomValues</code> and are never stored or sent.";

app.append(
  hero,
  intro,
  walkthrough(),
  otpPanel(),
  perfectSecrecyPanel(),
  twoTimePadPanel(),
  keystreamReusePanel(),
  importPanel(),
  grounding,
);
