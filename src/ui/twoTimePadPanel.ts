import { el, byteStrip, statusLine } from "./dom.ts";
import { panelShell } from "./otpPanel.ts";
import { textToBytes, generateKey, encrypt } from "../otp/otp.ts";
import {
  combineCiphertexts,
  revealAt,
  validOffsets,
  dragCrib,
  rankByPrintability,
  emptyReconstruction,
  pinCrib,
  type Reconstruction,
} from "../otp/cribdrag.ts";
import { viewByte, type Bytes } from "../otp/types.ts";

// Panel 3 (centerpiece) — the two-time-pad MISTAKE. Two messages under the SAME
// key. C1 ⊕ C2 = P1 ⊕ P2 (the key cancels). Then interactive crib-dragging
// peels both plaintexts apart. Framed in DANGER styling: recovering the
// plaintexts is the system FAILING, not the user winning a game.
//
// Structure: persistent input controls are built ONCE (so typing never loses
// focus); only the computed `output` region is rebuilt when inputs change.

export function twoTimePadPanel(): HTMLElement {
  // --- structural state ---
  let p1text = "the quick brown fox jumps over the lazy dog";
  let p2text = "pack my box with five dozen liquor jugs run";
  let reuseKey = true; // DANGER default for the lesson; toggle off to disprove

  let p1: Bytes = textToBytes(p1text);
  let p2: Bytes = textToBytes(p2text);

  // Keys held only in memory, regenerated on demand.
  let sharedKey: Bytes = generateKey(Math.max(p1.length, p2.length));
  let key2: Bytes = generateKey(Math.max(p1.length, p2.length)); // used only when NOT reusing

  let c1: Bytes = new Uint8Array();
  let c2: Bytes = new Uint8Array();
  let strip: Bytes = new Uint8Array(); // C1 ⊕ C2

  // --- crib-drag state ---
  let crib: Bytes = textToBytes("the ");
  let offset = 0;
  let cribTarget: "p1" | "p2" = "p1";
  let recon: Reconstruction = emptyReconstruction(0);

  // --- live DOM refs updated during drag (no rebuild) ---
  let stripCells: HTMLElement[] = [];
  let scroller = el("div");
  const revealBox = el("div", { class: "reveal-box", "aria-live": "polite" });
  const candidatesBox = el("div", { class: "candidates" });
  let chip = el("div");
  const offsetReadout = el("span", { class: "offset-readout" });

  const output = el("div", { class: "ttp-output" });

  // ---------- persistent controls (built once) ----------

  const reuseCb = el("input", { type: "checkbox" }) as HTMLInputElement;
  reuseCb.checked = reuseKey;
  const reuseLabelText = el("span");
  reuseCb.addEventListener("change", () => {
    reuseKey = reuseCb.checked;
    recompute();
    rebuild();
  });
  const toggle = el("label", { class: "toggle danger-toggle" }, [reuseCb, reuseLabelText]);

  const p1ta = makeTextarea(p1text, "Message P1", (v) => {
    p1text = v;
    recompute();
    rebuild();
  });
  const p2ta = makeTextarea(p2text, "Message P2", (v) => {
    p2text = v;
    recompute();
    rebuild();
  });
  const msgInputs = el("div", { class: "two-msgs" }, [
    el("div", { class: "msg-field" }, [el("span", { class: "field-label", text: "Message P1" }), p1ta]),
    el("div", { class: "msg-field" }, [el("span", { class: "field-label", text: "Message P2" }), p2ta]),
  ]);

  const keyCtrls = el("div", { class: "controls" }, [
    el("button", { type: "button", class: "btn", text: "↻ Re-roll session keys", onclick: rerollKeys }),
  ]);

  const cribInput = el("input", {
    type: "text",
    class: "msg-input crib-input",
    id: "crib-input",
    "aria-label": "Guessed crib word",
  }) as HTMLInputElement;
  cribInput.value = decodeForLabel(crib);
  cribInput.addEventListener("input", () => {
    crib = textToBytes(cribInput.value);
    clampOffset();
    applyCribShape(); // light update — keeps focus in the input
  });

  const targetSel = el("select", { class: "select", "aria-label": "Crib belongs to" }) as HTMLSelectElement;
  targetSel.append(
    el("option", { value: "p1", text: "crib is a guess for P1" }),
    el("option", { value: "p2", text: "crib is a guess for P2" }),
  );
  targetSel.value = cribTarget;
  targetSel.addEventListener("change", () => {
    cribTarget = targetSel.value as "p1" | "p2";
    renderReveal();
  });

  const nudge = (delta: number) => () => {
    const offs = validOffsets(strip.length, crib.length);
    if (offs.length === 0) return;
    offset = clamp(offset + delta, offs[0], offs[offs.length - 1]);
    applyOffset();
  };

  const cribControls = el("div", { class: "crib-controls" }, [
    el("label", { class: "field-label", for: "crib-input", text: 'Crib (guessed word — try " the ")' }),
    el("div", { class: "crib-row" }, [
      cribInput,
      targetSel,
      el("button", { type: "button", class: "btn btn--icon", text: "◀", "aria-label": "Nudge offset left", onclick: nudge(-1) }),
      el("button", { type: "button", class: "btn btn--icon", text: "▶", "aria-label": "Nudge offset right", onclick: nudge(1) }),
      el("button", { type: "button", class: "btn btn--pin", text: "📌 Pin crib here", onclick: pinCurrent }),
    ]),
    candidatesBox,
  ]);

  // ---------- compute / update logic ----------

  // Grow a key to at least `n` bytes, keeping its existing prefix and topping up
  // with fresh CSPRNG bytes. Keeping the prefix means the ciphertext you've
  // already seen stays stable as you extend a message.
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
    // Ensure keys are long enough for the current messages (invariant 2: a key
    // is never shorter than its message in the OTP step).
    const need = Math.max(p1.length, p2.length);
    sharedKey = growKey(sharedKey, need);
    key2 = growKey(key2, need);
    const usedKey2 = reuseKey ? sharedKey : key2;
    c1 = encrypt(p1, sharedKey.slice(0, p1.length));
    c2 = encrypt(p2, usedKey2.slice(0, p2.length));
    // keystream-reuse extension point: combineCiphertexts takes ANY two
    // equal-length ciphertexts — drop in two same-nonce ChaCha20/AES-CTR
    // ciphertexts here and the crib-drag attack below works unchanged.
    strip = combineCiphertexts(c1, c2);
    recon = emptyReconstruction(strip.length);
    clampOffset();
  }

  function clamp(v: number, lo: number, hi: number): number {
    return Math.min(Math.max(v, lo), hi);
  }

  function clampOffset(): void {
    const offs = validOffsets(strip.length, crib.length);
    offset = offs.length === 0 ? 0 : clamp(offset, offs[0], offs[offs.length - 1]);
  }

  function rerollKeys(): void {
    const n = Math.max(p1.length, p2.length, 1);
    sharedKey = generateKey(n);
    key2 = generateKey(n);
    recompute();
    rebuild();
  }

  // crib text changed: update chip label + aria + highlight + reveal (no rebuild)
  function applyCribShape(): void {
    chip.textContent = decodeForLabel(crib) || "(crib)";
    chip.setAttribute("aria-valuemax", String(Math.max(0, strip.length - crib.length)));
    renderCandidates();
    applyOffset();
  }

  // Rank every offset by how text-like its reveal is and surface the best few as
  // jump buttons. This is a search aid only — it never auto-confirms a guess; the
  // user still has to read the bytes and decide. (Uses real crib-drag math.)
  function renderCandidates(): void {
    candidatesBox.replaceChildren();
    const offs = validOffsets(strip.length, crib.length);
    if (offs.length === 0) return;
    const ranked = rankByPrintability(dragCrib(strip, crib))
      .filter((h) => h.printableRatio >= 0.6)
      .slice(0, 5);
    if (ranked.length === 0) {
      candidatesBox.append(
        el("span", {
          class: "candidates__none",
          text: "No offset reveals mostly-printable text for this crib — try another guess (or the key may not be reused).",
        }),
      );
      return;
    }
    candidatesBox.append(el("span", { class: "candidates__label", text: "Most text-like offsets:" }));
    for (const h of ranked) {
      const preview = decodeForLabel(h.revealed).replace(/[^\x20-\x7e]/g, "·");
      const btn = el("button", {
        type: "button",
        class: "candidate-btn",
        text: `@${h.offset} "${preview}" ${Math.round(h.printableRatio * 100)}%`,
        onclick: () => {
          offset = h.offset;
          applyOffset();
          chip.focus();
        },
      });
      candidatesBox.append(btn);
    }
  }

  function applyOffset(): void {
    const inWindow = new Set<number>();
    for (let i = 0; i < crib.length; i++) inWindow.add(offset + i);
    stripCells.forEach((cell, i) => cell.classList.toggle("byte--hl", inWindow.has(i)));
    offsetReadout.textContent = strip.length === 0 ? "" : `offset ${offset}`;
    chip.setAttribute("aria-valuenow", String(offset));
    positionChip();
    renderReveal();
  }

  function positionChip(): void {
    const first = stripCells[offset];
    const last = stripCells[offset + crib.length - 1] ?? first;
    if (!first) return;
    // Size the chip to bracket exactly the bytes it overlaps, and scroll the
    // window into view so the active region is always visible.
    chip.style.left = `${first.offsetLeft}px`;
    chip.style.width = `${last.offsetLeft + last.offsetWidth - first.offsetLeft}px`;
    const cLeft = first.offsetLeft;
    const cRight = last.offsetLeft + last.offsetWidth;
    if (cLeft < scroller.scrollLeft) scroller.scrollLeft = cLeft - 8;
    else if (cRight > scroller.scrollLeft + scroller.clientWidth)
      scroller.scrollLeft = cRight - scroller.clientWidth + 8;
  }

  function renderReveal(): void {
    revealBox.replaceChildren();
    const offs = validOffsets(strip.length, crib.length);
    if (offs.length === 0) {
      revealBox.append(
        statusLine(
          "⚠",
          crib.length === 0
            ? "Enter a crib (a guessed word) to drag across the strip."
            : `Crib (${crib.length} bytes) is longer than the attackable strip (${strip.length} bytes) — no valid offset.`,
          "neutral",
        ),
      );
      return;
    }
    const hit = revealAt(strip, crib, offset);
    const otherLabel = cribTarget === "p1" ? "P2" : "P1";
    const cribLabel = cribTarget === "p1" ? "P1" : "P2";

    const row = el("div", { class: "reveal-row" });
    hit.revealed.forEach((value) => {
      const v = viewByte(value);
      row.append(
        el(
          "span",
          { class: `reveal-cell${v.printable ? " reveal-cell--text" : " reveal-cell--np"}`, title: `0x${v.hex}` },
          [v.glyph],
        ),
      );
    });

    revealBox.append(
      el("p", {
        class: "reveal-caption",
        text: `If "${decodeForLabel(crib)}" is ${cribLabel} at offset ${offset}, then ${otherLabel} reads here:`,
      }),
      row,
      hit.allPrintable
        ? statusLine(
            "✓",
            `All ${hit.revealed.length} revealed bytes are printable — a plausible hit. If it reads like real language, pin it.`,
            "calm",
          )
        : statusLine(
            "·",
            `${Math.round(hit.printableRatio * 100)}% printable — likely garbage at this offset. Keep dragging.`,
            "neutral",
          ),
    );
  }

  function pinCurrent(): void {
    const offs = validOffsets(strip.length, crib.length);
    if (offs.length === 0) return;
    recon = pinCrib(recon, strip, crib, offset, cribTarget === "p1");
    rebuild();
  }

  function resetRecon(): void {
    recon = emptyReconstruction(strip.length);
    rebuild();
  }

  // ---------- output rebuild (computed strips only) ----------

  function rebuild(): void {
    reuseLabelText.textContent = reuseKey
      ? "⛔ REUSING ONE KEY for both messages — the catastrophic mistake"
      : "✓ Two independent fresh keys (correct) — attack should fail";
    toggle.classList.toggle("danger-toggle--armed", reuseKey);

    output.replaceChildren();

    const cipherBlock = el("div", { class: "cipher-block" }, [
      byteStrip("C1 = P1 ⊕ K", c1, { cellClass: () => "cipher" }),
      byteStrip(reuseKey ? "C2 = P2 ⊕ K  (same K!)" : "C2 = P2 ⊕ K₂  (different key)", c2, {
        cellClass: () => "cipher",
      }),
    ]);

    const cancelNote = reuseKey
      ? statusLine(
          "⛔",
          "Same K both times ⇒ C1 ⊕ C2 = (P1 ⊕ K) ⊕ (P2 ⊕ K) = P1 ⊕ P2. The key is gone — only the two plaintexts XORed together remain.",
          "danger",
        )
      : statusLine(
          "✓",
          "Different keys ⇒ C1 ⊕ C2 = P1 ⊕ P2 ⊕ K ⊕ K₂. The keys do NOT cancel, so the strip below is genuine noise and no crib reads as text.",
          "calm",
        );

    const tailNote =
      p1.length !== p2.length
        ? statusLine(
            "ℹ",
            `Messages differ in length (${p1.length} vs ${p2.length} bytes). Only the overlapping prefix of ${strip.length} bytes is attackable; the ${Math.abs(p1.length - p2.length)}-byte tail of the longer ciphertext has nothing to cancel against and stays secret.`,
            "neutral",
          )
        : null;

    output.append(
      cipherBlock,
      cancelNote,
      ...(tailNote ? [tailNote] : []),
      el("h3", { class: "subhead", text: "C1 ⊕ C2  =  P1 ⊕ P2   — drag a crib across it" }),
      buildInteractiveStrip(),
      revealBox,
      buildReconstruction(),
    );

    applyCribShape();
  }

  function buildInteractiveStrip(): HTMLElement {
    const cells = el("div", { class: "strip strip--interactive", role: "list", "aria-label": "C1 XOR C2 strip" });
    stripCells = [];
    strip.forEach((value, i) => {
      const v = viewByte(value);
      const cell = el(
        "div",
        { class: `byte byte--strip${v.printable ? "" : " byte--np"}`, role: "listitem", title: `index ${i} · 0x${v.hex}` },
        [
          el("span", { class: "byte__hex", text: v.hex }),
          el("span", { class: "byte__glyph", text: v.glyph }),
          el("span", { class: "byte__idx", text: String(i) }),
        ],
      );
      cell.addEventListener("click", () => {
        const offs = validOffsets(strip.length, crib.length);
        if (offs.length === 0) return;
        offset = clamp(i, offs[0], offs[offs.length - 1]);
        applyOffset();
      });
      stripCells.push(cell);
      cells.append(cell);
    });

    chip = el("div", {
      class: "crib-chip",
      tabindex: 0,
      role: "slider",
      "aria-label": "Crib offset — arrow keys move, Enter pins",
      "aria-valuemin": 0,
      "aria-valuemax": Math.max(0, strip.length - crib.length),
      "aria-valuenow": offset,
    });
    chip.textContent = decodeForLabel(crib) || "(crib)";
    chip.addEventListener("keydown", (e) => {
      const offs = validOffsets(strip.length, crib.length);
      if (offs.length === 0) return;
      const [lo, hi] = [offs[0], offs[offs.length - 1]];
      if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
        offset = Math.max(lo, offset - 1);
        e.preventDefault();
        applyOffset();
      } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
        offset = Math.min(hi, offset + 1);
        e.preventDefault();
        applyOffset();
      } else if (e.key === "Home") {
        offset = lo;
        e.preventDefault();
        applyOffset();
      } else if (e.key === "End") {
        offset = hi;
        e.preventDefault();
        applyOffset();
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        pinCurrent();
      }
    });

    // The chip and cells live in ONE scroll container so they scroll together
    // and the chip stays aligned over the bytes it overlaps.
    scroller = el("div", { class: "strip-scroll" }, [chip, cells]);

    let dragging = false;
    const onMove = (clientX: number) => {
      const offs = validOffsets(strip.length, crib.length);
      if (offs.length === 0 || stripCells.length === 0) return;
      const base = stripCells[0].offsetLeft;
      const cellW = stripCells[0].getBoundingClientRect().width || 1;
      const rect = scroller.getBoundingClientRect();
      const idx = Math.round((clientX - rect.left + scroller.scrollLeft - base) / cellW);
      offset = clamp(idx, offs[0], offs[offs.length - 1]);
      applyOffset();
    };
    chip.addEventListener("pointerdown", (e) => {
      dragging = true;
      chip.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    chip.addEventListener("pointermove", (e) => dragging && onMove(e.clientX));
    const endDrag = (e: PointerEvent) => {
      dragging = false;
      try {
        chip.releasePointerCapture(e.pointerId);
      } catch {
        /* no capture */
      }
    };
    chip.addEventListener("pointerup", endDrag);
    chip.addEventListener("pointercancel", endDrag);

    return el("div", { class: "strip-wrap" }, [
      el("div", { class: "strip-head" }, [
        el("span", { class: "strip-label", text: "C1 ⊕ C2  (= P1 ⊕ P2 when key reused)" }),
        offsetReadout,
      ]),
      scroller,
    ]);
  }

  function buildReconstruction(): HTMLElement {
    const solved = recon.known.filter(Boolean).length;
    const p1strip = byteStrip("Reconstructed P1", recon.p1, {
      unknown: (i) => !recon.known[i],
      cellClass: (i) => (recon.known[i] ? "calm" : undefined),
    });
    const p2strip = byteStrip("Reconstructed P2", recon.p2, {
      unknown: (i) => !recon.known[i],
      cellClass: (i) => (recon.known[i] ? "calm" : undefined),
    });
    const tone = solved === 0 ? "neutral" : "danger";
    const icon = solved === 0 ? "·" : solved === strip.length && strip.length > 0 ? "⛔" : "⚠";
    return el("div", { class: "recon-block" }, [
      el("div", { class: "recon-head" }, [
        el("h3", { class: "subhead", text: "Both plaintexts emerge together" }),
        el("button", { type: "button", class: "btn btn--ghost", text: "Reset reconstruction", onclick: resetRecon }),
      ]),
      statusLine(
        icon,
        `${solved} / ${strip.length} bytes recovered in BOTH messages. Each confirmed crib peels a stretch off P1 AND P2 at once — this is why key reuse is fatal.`,
        tone,
      ),
      p1strip,
      p2strip,
    ]);
  }

  recompute();
  rebuild();

  return panelShell({
    tone: "danger",
    icon: "⛔",
    title: "3 · Two-time pad — the catastrophic key-reuse attack",
    badge: "the mistake",
    notWhat:
      "Not a game you 'win' — recovering these plaintexts is the encryption FAILING. The same flaw is keystream/nonce reuse in real stream ciphers (ChaCha20, AES-CTR/GCM).",
    body: [
      el("p", {
        class: "lead",
        text: "Encrypt two messages with the SAME key and XORing the ciphertexts cancels the key. Drag a guessed word (a 'crib') across the result to peel both messages apart.",
      }),
      toggle,
      msgInputs,
      keyCtrls,
      output,
      cribControls,
    ],
  });
}

function decodeForLabel(bytes: Bytes): string {
  return new TextDecoder().decode(bytes);
}

function makeTextarea(value: string, label: string, onChange: (v: string) => void): HTMLTextAreaElement {
  const ta = el("textarea", { class: "msg-input", rows: 2, "aria-label": label }) as HTMLTextAreaElement;
  ta.value = value;
  ta.addEventListener("input", () => onChange(ta.value));
  return ta;
}
