"use client";

import { useEffect } from "react";

type ShareDialogProps = {
  copied: boolean;
  emailHref: string;
  feedback?: string | null;
  itemCountLabel?: string;
  onClose: () => void;
  onCopy: () => void;
  shareUrl: string;
  shortCode?: string;
  supportBox?: {
    actions: Array<{ href: string; label: string }>;
    copy?: string;
    title: string;
  };
  title: string;
};

export function ShareDialog({
  copied,
  emailHref,
  feedback,
  itemCountLabel,
  onClose,
  onCopy,
  shareUrl,
  shortCode,
  supportBox,
  title,
}: ShareDialogProps) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  function handleBackdropClick(
    target: EventTarget | null,
    currentTarget: EventTarget | null,
  ) {
    if (target === currentTarget) {
      onClose();
    }
  }

  return (
    <div
      aria-labelledby="share-dialog-title"
      aria-modal="true"
      className="share-dialog"
      onClick={(event) =>
        handleBackdropClick(event.target, event.currentTarget)
      }
      role="dialog"
    >
      <div className="share-dialog__panel">
        <div className="share-dialog__header">
          <div className="stack-xs">
            <strong className="share-dialog__eyebrow">
              Burner ready to send
            </strong>
            <h2 className="share-dialog__title" id="share-dialog-title">
              Share “{title || "Untitled Burner"}”
            </h2>
            <p className="share-dialog__copy">
              The link is live. Copy it or open your mail app.
            </p>
          </div>
          <button
            className="button button--secondary"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </div>

        <div className="share-dialog__body">
          <label className="field">
            <span>Share Link</span>
            <input
              aria-label="Share link"
              className="input share-dialog__input"
              onFocus={(event) => event.currentTarget.select()}
              readOnly
              value={shareUrl}
            />
          </label>

          <div className="share-dialog__meta">
            {shortCode ? <span>Short code {shortCode}</span> : null}
            {itemCountLabel ? <span>{itemCountLabel}</span> : null}
          </div>

          <div className="button-row share-dialog__actions">
            <button
              className="button button--primary"
              onClick={onCopy}
              type="button"
            >
              {copied ? "Copied" : "Copy Link"}
            </button>
            <a className="button button--secondary" href={emailHref}>
              Send via Email
            </a>
            <a
              className="button button--secondary"
              href={shareUrl}
              rel="noreferrer"
              target="_blank"
            >
              Open Link
            </a>
          </div>

          {supportBox ? (
            <section className="share-dialog__support">
              <div className="stack-xs">
                <strong className="share-dialog__supporttitle">
                  {supportBox.title}
                </strong>
                {supportBox.copy ? (
                  <p className="share-dialog__supportcopy">
                    {supportBox.copy}
                  </p>
                ) : null}
              </div>

              <div className="button-row share-dialog__supportactions">
                {supportBox.actions.map((action) => (
                  <a
                    className="button button--secondary"
                    href={action.href}
                    key={`${action.label}-${action.href}`}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {action.label}
                  </a>
                ))}
              </div>
            </section>
          ) : null}

          {feedback ? (
            <p className="status-message status-message--compact">{feedback}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
