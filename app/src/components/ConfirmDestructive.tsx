import { useState, type ReactNode } from "react";

/**
 * A small destructive-action confirm modal. When `confirmWord` is set the danger
 * button stays disabled until the user types it exactly (used for irreversible
 * subject delete / curriculum reset); otherwise it's a plain confirm.
 */
export function ConfirmDestructive({
  title,
  body,
  danger,
  confirmWord,
  confirmLabel = "Delete",
  busy = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: ReactNode;
  /** Extra, stronger warning line shown in the danger color. */
  danger?: ReactNode;
  /** When set, the user must type this exact string to arm the danger button. */
  confirmWord?: string;
  confirmLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState("");
  const armed = !confirmWord || typed === confirmWord;

  return (
    <div
      className="confirm-overlay"
      role="dialog"
      aria-modal="true"
      data-testid="confirm-dialog"
      onClick={onCancel}
    >
      <div className="confirm-dialog card" onClick={(e) => e.stopPropagation()}>
        <h2 className="confirm-dialog__title">{title}</h2>
        <div className="confirm-dialog__body">{body}</div>
        {danger && <div className="confirm-dialog__danger">{danger}</div>}
        {confirmWord && (
          <label className="confirm-dialog__field">
            Type <strong>{confirmWord}</strong> to confirm
            <input
              autoFocus
              className="confirm-dialog__input"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              data-testid="confirm-input"
            />
          </label>
        )}
        <div className="confirm-dialog__actions">
          <button className="btn btn--ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            className="btn"
            style={{ background: "var(--danger)", color: "var(--canvas)" }}
            onClick={onConfirm}
            disabled={!armed || busy}
            data-testid="confirm-danger"
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
