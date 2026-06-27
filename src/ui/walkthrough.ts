import { el } from "./dom.ts";

// Guided walkthrough — an optional, dismissable path through the panels with a
// clear beginning, middle, and punchline. Fully keyboard operable. It does not
// drive the panels for you; it tells you what to try and scrolls you there.

interface Step {
  title: string;
  body: string;
  targetId: string;
}

const STEPS: Step[] = [
  {
    title: "Start: encrypt with a one-time pad",
    body: "In panel 1, type a short message. Watch plaintext ⊕ a fresh random key produce the ciphertext, then decrypt back to exactly your message.",
    targetId: "panel-otp",
  },
  {
    title: "The key tracks the bytes",
    body: "Still in panel 1, change the message — even add an emoji. Notice the key length always equals the message length in BYTES (an emoji is several bytes).",
    targetId: "panel-otp",
  },
  {
    title: "Why one ciphertext leaks nothing",
    body: "In panel 2, type any target plaintext of the required byte length. A valid key appears that maps the SAME ciphertext to it — so the ciphertext is consistent with every plaintext of its length.",
    targetId: "panel-secrecy",
  },
  {
    title: "The punchline: reuse a key once",
    body: "In panel 3 (key reuse ON), pin the default crib \"the \". Both plaintexts start emerging together — recovering them is the cipher FAILING.",
    targetId: "panel-ttp",
  },
  {
    title: "Prove it needs reuse",
    body: "In panel 3, turn key reuse OFF. The same crib now reveals only noise: with two independent keys the attack collapses.",
    targetId: "panel-ttp",
  },
  {
    title: "It happens for real, and on your data",
    body: "Panel 4 shows the identical break from a reused stream-cipher nonce. Panel 5 lets you load a challenge or paste two ciphertexts and attack them yourself.",
    targetId: "panel-keystream",
  },
];

export function walkthrough(): HTMLElement {
  let index = 0;
  let active = false;

  const stepTitle = el("strong", { class: "wt-title" });
  const stepBody = el("p", { class: "wt-body" });
  const progress = el("span", { class: "wt-progress" });

  const backBtn = el("button", { type: "button", class: "btn btn--ghost", text: "← Back", onclick: () => go(index - 1) }) as HTMLButtonElement;
  const nextBtn = el("button", { type: "button", class: "btn", text: "Next →", onclick: () => go(index + 1) }) as HTMLButtonElement;
  const closeBtn = el("button", { type: "button", class: "btn btn--ghost wt-close", "aria-label": "Exit walkthrough", text: "✕", onclick: stop });

  const panel = el("div", { class: "wt-panel", role: "region", "aria-label": "Guided walkthrough", hidden: true }, [
    el("div", { class: "wt-head" }, [progress, closeBtn]),
    stepTitle,
    stepBody,
    el("div", { class: "wt-controls" }, [backBtn, nextBtn]),
  ]);

  const startBtn = el("button", { type: "button", class: "btn wt-start", text: "▶ Start guided walkthrough", onclick: start });

  function highlight(id: string): void {
    const target = document.getElementById(id);
    if (!target) return;
    // scrollIntoView is unimplemented in jsdom; ignore there.
    try {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch {
      /* non-browser env */
    }
    target.classList.add("panel--spotlight");
    window.setTimeout(() => target.classList.remove("panel--spotlight"), 1600);
  }

  function render(): void {
    const s = STEPS[index];
    progress.textContent = `Step ${index + 1} of ${STEPS.length}`;
    stepTitle.textContent = s.title;
    stepBody.textContent = s.body;
    backBtn.disabled = index === 0;
    nextBtn.textContent = index === STEPS.length - 1 ? "Finish ✓" : "Next →";
  }

  function go(next: number): void {
    if (next < 0) return;
    if (next >= STEPS.length) { stop(); return; }
    index = next;
    render();
    highlight(STEPS[index].targetId);
    nextBtn.focus();
  }

  function start(): void {
    active = true;
    index = 0;
    panel.hidden = false;
    startBtn.hidden = true;
    render();
    highlight(STEPS[0].targetId);
    closeBtn.focus();
  }

  function stop(): void {
    active = false;
    panel.hidden = true;
    startBtn.hidden = false;
    startBtn.focus();
  }

  // Esc exits the walkthrough from anywhere — steps send focus into other
  // panels, so the listener must be on document, not just this panel.
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && active) { e.preventDefault(); stop(); }
  });

  return el("div", { class: "wt" }, [startBtn, panel]);
}
