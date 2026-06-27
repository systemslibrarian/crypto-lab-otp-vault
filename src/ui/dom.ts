import type { Bytes } from "../otp/types.ts";
import { viewByte } from "../otp/types.ts";

// Tiny DOM helpers — no framework. Keeps the panels readable and the byte
// rendering honest (every byte shown as hex + glyph, never wrapped).

type Attrs = Record<string, string | number | boolean | EventListener>;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = String(v);
    else if (k === "text") node.textContent = String(v);
    else if (k.startsWith("on") && typeof v === "function") {
      node.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    } else if (typeof v === "boolean") {
      if (v) node.setAttribute(k, "");
    } else {
      node.setAttribute(k, String(v));
    }
  }
  for (const c of children) {
    node.append(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
}

/**
 * Render a labelled byte strip: one column per byte showing hex over glyph.
 * Monospace, never wraps — wrapping would destroy offset alignment, which is
 * the whole point. The container is horizontally scrollable.
 *
 * `highlight` marks columns to emphasize; `cls` tags each cell for theming.
 */
export interface StripOptions {
  /** Per-byte CSS modifier class suffix, e.g. "known" -> "byte--known". */
  cellClass?: (index: number, value: number) => string | undefined;
  /** Indices to highlight (the active crib window). */
  highlight?: Set<number>;
  /** Show a placeholder glyph "?" for indices marked unknown. */
  unknown?: (index: number) => boolean;
}

export function byteStrip(
  label: string,
  bytes: Bytes,
  opts: StripOptions = {},
): HTMLElement {
  const cells = el("div", { class: "strip", role: "list", "aria-label": label });
  bytes.forEach((value, i) => {
    const view = viewByte(value);
    const isUnknown = opts.unknown?.(i) ?? false;
    const mod = opts.cellClass?.(i, value);
    const classes = ["byte"];
    if (mod) classes.push(`byte--${mod}`);
    if (opts.highlight?.has(i)) classes.push("byte--hl");
    if (isUnknown) classes.push("byte--unknown");
    if (!view.printable && !isUnknown) classes.push("byte--np");
    const cell = el("div", { class: classes.join(" "), role: "listitem" }, [
      el("span", { class: "byte__hex", text: isUnknown ? "··" : view.hex }),
      el("span", { class: "byte__glyph", text: isUnknown ? "?" : view.glyph }),
      el("span", { class: "byte__idx", text: String(i) }),
    ]);
    cells.append(cell);
  });
  const wrap = el("div", { class: "strip-wrap" }, [
    el("div", { class: "strip-head" }, [
      el("span", { class: "strip-label", text: label }),
      copyButton(label, bytes),
    ]),
    cells,
  ]);
  return wrap;
}

function copyButton(label: string, bytes: Bytes): HTMLElement {
  const btn = el("button", {
    class: "copy-btn",
    type: "button",
    "aria-label": `Copy ${label} as hex`,
    text: "⧉ copy hex",
  });
  btn.addEventListener("click", async () => {
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(" ");
    try {
      await navigator.clipboard.writeText(hex);
      btn.textContent = "✓ copied";
      window.setTimeout(() => (btn.textContent = "⧉ copy hex"), 1200);
    } catch {
      btn.textContent = "copy failed";
    }
  });
  return btn;
}

/** A small status line that pairs an icon + text + color class (never color alone). */
export function statusLine(
  icon: string,
  text: string,
  tone: "calm" | "danger" | "neutral",
): HTMLElement {
  return el("p", { class: `status status--${tone}`, role: "status" }, [
    el("span", { class: "status__icon", "aria-hidden": "true", text: icon }),
    el("span", { text }),
  ]);
}
