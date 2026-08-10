/**
 * Known WCAG 1.4.11 / generated-content findings in this lab, captured through
 * the gate's own path so the baseline and the check cannot disagree.
 *
 * THIS FILE IS A TO-DO LIST, NOT A SET OF EXEMPTIONS. The gate ratchets on it:
 *   - a finding NOT listed here fails the run, so a regression cannot land;
 *   - a listed finding whose ratio gets WORSE fails, so the list cannot rot;
 *   - a listed finding that no longer appears ALSO fails, so a fixed entry must
 *     be deleted and the file can only shrink toward empty.
 * The last rule is what stops an allowlist becoming a permanent exemption.
 *
 * `unverified: true` marks an absolutely-positioned pseudo-element. It can paint
 * outside its host and the oracle measures it against the host's backdrop, so
 * that ratio is NOT trustworthy — hand-measure before acting on it.
 */
export const NONTEXT_BASELINE: Record<
  string,
  { ratio: number; required: number; unverified: boolean }
> = {
  "control-boundary|a.cl-btn": { ratio: 2.13, required: 3.0, unverified: false },
  "control-boundary|button#cl-theme-toggle.cl-btn.cl-icon": { ratio: 2.13, required: 3.0, unverified: false },
  "control-boundary|button.btn": { ratio: 2.16, required: 3.0, unverified: false },
  "control-boundary|button.btn.btn--icon": { ratio: 2.25, required: 3.0, unverified: false },
  "control-boundary|button.btn.btn--pin": { ratio: 2.73, required: 3.0, unverified: false },
  "control-boundary|button.btn.wt-start": { ratio: 2.27, required: 3.0, unverified: false },
  "control-boundary|button.candidate-btn": { ratio: 2.25, required: 3.0, unverified: false },
  "control-boundary|div.crib-chip": { ratio: 2.46, required: 3.0, unverified: false },
  "control-boundary|input#ps-target.msg-input": { ratio: 1.34, required: 3.0, unverified: false },
  "control-boundary|input.msg-input.crib-input": { ratio: 1.34, required: 3.0, unverified: false },
  "control-boundary|textarea#otp-msg.msg-input": { ratio: 1.34, required: 3.0, unverified: false },
  "control-boundary|textarea.msg-input": { ratio: 1.3, required: 3.0, unverified: false },
  "control-boundary|textarea.msg-input.mono-input": { ratio: 1.34, required: 3.0, unverified: false },
  "generated-content|div.crib-chip::after": { ratio: 1.0, required: 4.5, unverified: true }
};
