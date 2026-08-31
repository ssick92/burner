"use client";

import { useEffect, useRef } from "react";

type ReceiverIntroBannerProps = {
  onDismiss: () => void;
  senderName: string;
  title: string;
};

export function ReceiverIntroBanner({
  onDismiss,
  senderName,
  title,
}: ReceiverIntroBannerProps) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    buttonRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onDismiss();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onDismiss]);

  return (
    <div
      aria-labelledby="receiver-intro-title"
      aria-modal="true"
      className="receiver-intro-backdrop"
      onClick={onDismiss}
      role="dialog"
    >
      <div
        className="receiver-intro"
        onClick={(event) => event.stopPropagation()}
      >
        <div aria-hidden="true" className="receiver-intro__disc">
          <span className="receiver-intro__disc-hub" />
        </div>
        <h2 className="receiver-intro__title" id="receiver-intro-title">
          {senderName} burned you a CD
          {title ? <span className="receiver-intro__subtitle">“{title}”</span> : null}
        </h2>
        <p className="receiver-intro__body">
          Press <strong>Play</strong> to hear what’s on it. Each track reveals
          itself only once it starts playing — no spoilers, just like a real
          burner CD.
        </p>
        <button
          className="receiver-intro__dismiss"
          onClick={onDismiss}
          ref={buttonRef}
          type="button"
        >
          Let’s listen
        </button>
      </div>
    </div>
  );
}
