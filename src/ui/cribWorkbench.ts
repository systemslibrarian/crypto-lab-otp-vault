import { el, byteStrip, statusLine } from "./dom.ts";
import { textToBytes } from "../otp/otp.ts";
import {
  revealAt,
  validOffsets,
  dragCrib,
  rankByPrintability,
  emptyReconstruction,
  pinCrib,
  type Reconstruction,
} from "../otp/cribdrag.ts";
import { viewByte, type Bytes } from "../otp/types.ts";

// Reusable crib-dragging attack workbench. It operates on ANY combined strip
// (C1 ⊕ C2 = P1 ⊕ P2), so the two-time-pad, the keystream-reuse panel, and the
// "import two ciphertexts" panel all share this one engine unchanged.
//
// Adds over the original inline version: an undo/redo stack of pinned cribs, a
// removable history list, and an optional instructor "reveal P1/P2" toggle.

export interface WorkbenchTruth {
  p1: Bytes;
  p2: Bytes;
}

export interface WorkbenchOptions {
  /** Returns the current combined strip to attack. */
  getStrip: () => Bytes;
  /** Optional ground truth, enabling the instructor "reveal" toggle. */
  getTruth?: () => WorkbenchTruth | null;
  labels?: { p1?: string; p2?: string; stripTitle?: string };
  initialCrib?: string;
  tone?: "danger" | "neutral";
}

export interface Workbench {
  element: HTMLElement;
  /** Re-read the strip, clear pins, and rebuild (call when inputs change). */
  refresh: () => void;
}

interface PinRecord {
  cribText: string;
  crib: Bytes;
  offset: number;
  cribIsP1: boolean;
}

const decoder = new TextDecoder();
const decode = (b: Bytes) => decoder.decode(b);

export function cribWorkbench(opts: WorkbenchOptions): Workbench {
  const p1Label = opts.labels?.p1 ?? "P1";
  const p2Label = opts.labels?.p2 ?? "P2";
  const stripTitle = opts.labels?.stripTitle ?? "C1 ⊕ C2  (= P1 ⊕ P2)";

  let strip: Bytes = opts.getStrip();
  let crib: Bytes = textToBytes(opts.initialCrib ?? "the ");
  let offset = 0;
  let cribTarget: "p1" | "p2" = "p1";
  let pins: PinRecord[] = [];
  let redo: PinRecord[] = [];
  let recon: Reconstruction = emptyReconstruction(strip.length);
  let showTruth = false;

  // live refs
  let stripCells: HTMLElement[] = [];
  let scroller = el("div");
  let chip = el("div");

  // ---- persistent UI nodes (updated in place; never lose focus) ----
  const stripHost = el("div", { class: "strip-host" });
  const offsetReadout = el("span", { class: "offset-readout" });
  const revealBox = el("div", { class: "reveal-box", "aria-live": "polite" });
  const candidatesBox = el("div", { class: "candidates" });
  const historyBox = el("div", { class: "history-box" });
  const reconBox = el("div", { class: "recon-block" });
  const truthBox = el("div", { class: "truth-box" });

  const cribInput = el("input", {
    type: "text",
    class: "msg-input crib-input",
    "aria-label": "Guessed crib word",
  }) as HTMLInputElement;
  cribInput.value = decode(crib);
  cribInput.addEventListener("input", () => {
    crib = textToBytes(cribInput.value);
    clampOffset();
    applyCribShape();
  });

  const targetSel = el("select", { class: "select", "aria-label": "Crib belongs to" }) as HTMLSelectElement;
  targetSel.append(
    el("option", { value: "p1", text: `crib is a guess for ${p1Label}` }),
    el("option", { value: "p2", text: `crib is a guess for ${p2Label}` }),
  );
  targetSel.addEventListener("change", () => {
    cribTarget = targetSel.value as "p1" | "p2";
    renderReveal();
  });

  const undoBtn = el("button", { type: "button", class: "btn btn--ghost", text: "↶ Undo pin", onclick: undo }) as HTMLButtonElement;
  const redoBtn = el("button", { type: "button", class: "btn btn--ghost", text: "↷ Redo", onclick: redoPin }) as HTMLButtonElement;

  // Visible label; the input's accessible name comes from its aria-label so we
  // avoid id collisions when several workbenches share a page.
  const cribControls = el("div", { class: "crib-controls" }, [
    el("span", { class: "field-label", text: 'Crib (guessed word — try " the ")' }),
    el("div", { class: "crib-row" }, [
      cribInput,
      targetSel,
      el("button", { type: "button", class: "btn btn--icon", text: "◀", "aria-label": "Nudge offset left", onclick: () => nudge(-1) }),
      el("button", { type: "button", class: "btn btn--icon", text: "▶", "aria-label": "Nudge offset right", onclick: () => nudge(1) }),
      el("button", { type: "button", class: "btn btn--pin", text: "📌 Pin crib here", onclick: pinCurrent }),
      undoBtn,
      redoBtn,
    ]),
    candidatesBox,
  ]);

  // optional instructor reveal toggle
  let truthToggle: HTMLElement | null = null;
  let truthCheckbox: HTMLInputElement | null = null;
  if (opts.getTruth) {
    const cb = el("input", { type: "checkbox" }) as HTMLInputElement;
    truthCheckbox = cb;
    cb.addEventListener("change", () => {
      showTruth = cb.checked;
      renderTruth();
    });
    truthToggle = el("label", { class: "toggle truth-toggle" }, [
      cb,
      el("span", { text: `🎓 Reveal original ${p1Label} & ${p2Label} (instructor aid)` }),
    ]);
  }

  const element = el("div", { class: `workbench workbench--${opts.tone ?? "danger"}` }, [
    el("h3", { class: "subhead", text: `${stripTitle}   — drag a crib across it` }),
    stripHost,
    cribControls,
    revealBox,
    historyBox,
    reconBox,
    ...(truthToggle ? [truthToggle] : []),
    truthBox,
  ]);

  // ---------------- logic ----------------

  const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

  function clampOffset(): void {
    const offs = validOffsets(strip.length, crib.length);
    offset = offs.length === 0 ? 0 : clamp(offset, offs[0], offs[offs.length - 1]);
  }

  function computeRecon(): void {
    let r = emptyReconstruction(strip.length);
    for (const p of pins) r = pinCrib(r, strip, p.crib, p.offset, p.cribIsP1);
    recon = r;
  }

  function applyCribShape(): void {
    chip.textContent = decode(crib) || "(crib)";
    chip.setAttribute("aria-valuemax", String(Math.max(0, strip.length - crib.length)));
    renderCandidates();
    applyOffset();
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
    chip.style.left = `${first.offsetLeft}px`;
    chip.style.width = `${last.offsetLeft + last.offsetWidth - first.offsetLeft}px`;
    const cLeft = first.offsetLeft;
    const cRight = last.offsetLeft + last.offsetWidth;
    if (cLeft < scroller.scrollLeft) scroller.scrollLeft = cLeft - 8;
    else if (cRight > scroller.scrollLeft + scroller.clientWidth)
      scroller.scrollLeft = cRight - scroller.clientWidth + 8;
  }

  function nudge(delta: number): void {
    const offs = validOffsets(strip.length, crib.length);
    if (offs.length === 0) return;
    offset = clamp(offset + delta, offs[0], offs[offs.length - 1]);
    applyOffset();
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
    const otherLabel = cribTarget === "p1" ? p2Label : p1Label;
    const cribLabel = cribTarget === "p1" ? p1Label : p2Label;

    const row = el("div", { class: "reveal-row" });
    hit.revealed.forEach((value) => {
      const v = viewByte(value);
      row.append(
        el("span", { class: `reveal-cell${v.printable ? " reveal-cell--text" : " reveal-cell--np"}`, title: `0x${v.hex}` }, [v.glyph]),
      );
    });

    revealBox.append(
      el("p", {
        class: "reveal-caption",
        text: `If "${decode(crib)}" is ${cribLabel} at offset ${offset}, then ${otherLabel} reads here:`,
      }),
      row,
      hit.allPrintable
        ? statusLine("✓", `All ${hit.revealed.length} revealed bytes are printable — a plausible hit. If it reads like real language, pin it.`, "calm")
        : statusLine("·", `${Math.round(hit.printableRatio * 100)}% printable — likely garbage at this offset. Keep dragging.`, "neutral"),
    );
  }

  function renderCandidates(): void {
    candidatesBox.replaceChildren();
    const offs = validOffsets(strip.length, crib.length);
    if (offs.length === 0) return;
    const ranked = rankByPrintability(dragCrib(strip, crib))
      .filter((h) => h.printableRatio >= 0.6)
      .slice(0, 5);
    if (ranked.length === 0) {
      candidatesBox.append(
        el("span", { class: "candidates__none", text: "No offset reveals mostly-printable text for this crib — try another guess (or the key may not be reused)." }),
      );
      return;
    }
    candidatesBox.append(el("span", { class: "candidates__label", text: "Most text-like offsets:" }));
    for (const h of ranked) {
      const preview = decode(h.revealed).replace(/[^\x20-\x7e]/g, "·");
      candidatesBox.append(
        el("button", {
          type: "button",
          class: "candidate-btn",
          text: `@${h.offset} "${preview}" ${Math.round(h.printableRatio * 100)}%`,
          onclick: () => {
            offset = h.offset;
            applyOffset();
            chip.focus();
          },
        }),
      );
    }
  }

  function pinCurrent(): void {
    const offs = validOffsets(strip.length, crib.length);
    if (offs.length === 0) return;
    pins.push({ cribText: decode(crib), crib: crib.slice(), offset, cribIsP1: cribTarget === "p1" });
    redo = [];
    afterPinsChanged();
  }

  function undo(): void {
    const p = pins.pop();
    if (!p) return;
    redo.push(p);
    afterPinsChanged();
  }

  function redoPin(): void {
    const p = redo.pop();
    if (!p) return;
    pins.push(p);
    afterPinsChanged();
  }

  function removePin(index: number): void {
    pins.splice(index, 1);
    redo = [];
    afterPinsChanged();
  }

  function afterPinsChanged(): void {
    computeRecon();
    renderHistory();
    renderRecon();
    renderTruth();
  }

  function renderHistory(): void {
    historyBox.replaceChildren();
    undoBtn.disabled = pins.length === 0;
    redoBtn.disabled = redo.length === 0;
    if (pins.length === 0) return;
    const list = el("ol", { class: "history-list", "aria-label": "Pinned cribs" });
    pins.forEach((p, i) => {
      const who = p.cribIsP1 ? p1Label : p2Label;
      const item = el("li", { class: "history-item" }, [
        el("span", { class: "history-text", text: `"${p.cribText.replace(/[^\x20-\x7e]/g, "·")}" → ${who} @ ${p.offset}` }),
        el("button", { type: "button", class: "history-remove", "aria-label": `Remove pinned crib ${i + 1}`, text: "✕", onclick: () => removePin(i) }),
      ]);
      list.append(item);
    });
    historyBox.append(el("span", { class: "history-label", text: "Pinned cribs:" }), list);
  }

  function renderRecon(): void {
    reconBox.replaceChildren();
    const solved = recon.known.filter(Boolean).length;
    const tone = solved === 0 ? "neutral" : "danger";
    const icon = solved === 0 ? "·" : solved === strip.length && strip.length > 0 ? "⛔" : "⚠";
    reconBox.append(
      el("div", { class: "recon-head" }, [
        el("h3", { class: "subhead", text: "Both plaintexts emerge together" }),
        el("button", { type: "button", class: "btn btn--ghost", text: "Reset reconstruction", onclick: resetAll }),
      ]),
      statusLine(
        icon,
        `${solved} / ${strip.length} bytes recovered in BOTH messages. Each confirmed crib peels a stretch off ${p1Label} AND ${p2Label} at once — this is why key reuse is fatal.`,
        tone,
      ),
      byteStrip(`Reconstructed ${p1Label}`, recon.p1, { unknown: (i) => !recon.known[i], cellClass: (i) => (recon.known[i] ? "calm" : undefined) }),
      byteStrip(`Reconstructed ${p2Label}`, recon.p2, { unknown: (i) => !recon.known[i], cellClass: (i) => (recon.known[i] ? "calm" : undefined) }),
    );
  }

  function renderTruth(): void {
    truthBox.replaceChildren();
    if (!opts.getTruth) return;
    const t = opts.getTruth();
    // Truth can vanish (e.g. user edits an imported ciphertext) — keep the
    // checkbox honest rather than leaving it checked over an empty box.
    if (!t) {
      showTruth = false;
      if (truthCheckbox) truthCheckbox.checked = false;
      return;
    }
    if (!showTruth) return;
    truthBox.append(
      statusLine("🎓", "Instructor aid — the real plaintexts (hidden by default). Compare against your reconstruction above.", "neutral"),
      byteStrip(`Actual ${p1Label}`, t.p1.slice(0, strip.length), { cellClass: () => "calm" }),
      byteStrip(`Actual ${p2Label}`, t.p2.slice(0, strip.length), { cellClass: () => "calm" }),
    );
  }

  function resetAll(): void {
    pins = [];
    redo = [];
    afterPinsChanged();
  }

  function buildStrip(): void {
    const cells = el("div", { class: "strip strip--interactive", role: "list", "aria-label": "Combined strip" });
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
    chip.textContent = decode(crib) || "(crib)";
    chip.addEventListener("keydown", (e) => {
      const offs = validOffsets(strip.length, crib.length);
      if (offs.length === 0) return;
      const [lo, hi] = [offs[0], offs[offs.length - 1]];
      if (e.key === "ArrowLeft" || e.key === "ArrowDown") { offset = Math.max(lo, offset - 1); e.preventDefault(); applyOffset(); }
      else if (e.key === "ArrowRight" || e.key === "ArrowUp") { offset = Math.min(hi, offset + 1); e.preventDefault(); applyOffset(); }
      else if (e.key === "Home") { offset = lo; e.preventDefault(); applyOffset(); }
      else if (e.key === "End") { offset = hi; e.preventDefault(); applyOffset(); }
      else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pinCurrent(); }
    });

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
    chip.addEventListener("pointerdown", (e) => { dragging = true; chip.setPointerCapture(e.pointerId); e.preventDefault(); });
    chip.addEventListener("pointermove", (e) => dragging && onMove(e.clientX));
    const endDrag = (e: PointerEvent) => { dragging = false; try { chip.releasePointerCapture(e.pointerId); } catch { /* none */ } };
    chip.addEventListener("pointerup", endDrag);
    chip.addEventListener("pointercancel", endDrag);

    stripHost.replaceChildren(
      el("div", { class: "strip-wrap" }, [
        el("div", { class: "strip-head" }, [el("span", { class: "strip-label", text: stripTitle }), offsetReadout]),
        scroller,
      ]),
    );
  }

  function refresh(): void {
    strip = opts.getStrip();
    pins = [];
    redo = [];
    clampOffset();
    computeRecon();
    buildStrip();
    applyCribShape();
    renderHistory();
    renderRecon();
    renderTruth();
    // refresh() often runs while the element is still detached (offsetLeft = 0).
    // Re-measure the chip on the next frame once layout is real.
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(positionChip);
  }

  refresh();
  targetSel.value = cribTarget;

  return { element, refresh };
}
