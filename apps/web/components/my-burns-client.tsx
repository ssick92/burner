"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import { runtimeFlags } from "../lib/env";
import {
  getSession,
  onAuthStateChange,
  type AppSession,
} from "../lib/auth-client";

type BurnerRow = {
  id: string;
  slug: string;
  title: string;
  sender_name: string;
  cover_image_url: string | null;
  total_tracks: number;
  is_revoked: boolean;
  created_at: string;
};

type ShareLinkRow = {
  burner_id: string;
  created_at: string;
  short_code: string;
  slug: string;
};

type LoadState =
  | { kind: "loading" }
  | {
      kind: "ready";
      burners: BurnerRow[];
      shareLinks: Record<string, ShareLinkRow>;
    }
  | { kind: "error"; message: string };

function formatCreatedAt(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function omitShareLink(
  shareLinks: Record<string, ShareLinkRow>,
  burnerId: string,
) {
  const next = { ...shareLinks };
  delete next[burnerId];
  return next;
}

export function MyBurnsClient() {
  const [session, setSession] = useState<AppSession | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [pendingAction, setPendingAction] = useState<{
    burnerId: string;
    kind: "deleting";
  } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const deletingBurnerId =
    pendingAction?.kind === "deleting" ? pendingAction.burnerId : null;

  useEffect(() => {
    if (!runtimeFlags.isBackendConfigured) {
      setAuthReady(true);
      return;
    }

    getSession().then((nextSession) => {
      setSession(nextSession);
      setAuthReady(true);
    });

    const subscription = onAuthStateChange((nextSession) => {
      setSession(nextSession ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!authReady || !session) {
      return;
    }

    let cancelled = false;

    async function load() {
      setState({ kind: "loading" });
      setActionError(null);

      const response = await fetch("/api/burners", { credentials: "include" });
      const payload = (await response.json().catch(() => null)) as {
        burners?: BurnerRow[];
        shareLinks?: ShareLinkRow[];
        error?: string;
      } | null;

      if (cancelled) return;

      if (!response.ok) {
        setState({
          kind: "error",
          message: payload?.error ?? "Could not load burns.",
        });
        return;
      }

      const rows = payload?.burners ?? [];

      let shareLinks: Record<string, ShareLinkRow> = {};
      for (const link of payload?.shareLinks ?? []) {
        shareLinks[link.burner_id] ??= link;
      }

      if (cancelled) return;
      setState({ kind: "ready", burners: rows, shareLinks });
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [authReady, session]);

  async function deleteBurner(burner: BurnerRow) {
    const burnerLabel = burner.title.trim() || "Untitled Burner";
    const confirmed = window.confirm(
      `Delete "${burnerLabel}" from your burn history? This also removes its share links.`,
    );

    if (!confirmed) {
      return;
    }

    setActionError(null);
    setPendingAction({ burnerId: burner.id, kind: "deleting" });

    const response = await fetch("/api/burners", {
      method: "DELETE",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ burnerId: burner.id }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      setActionError(payload?.error ?? "Could not delete that burn.");
      setPendingAction(null);
      return;
    }

    setState((current) => {
      if (current.kind !== "ready") {
        return current;
      }

      return {
        kind: "ready",
        burners: current.burners.filter((entry) => entry.id !== burner.id),
        shareLinks: omitShareLink(current.shareLinks, burner.id),
      };
    });
    setPendingAction(null);
  }

  if (!runtimeFlags.isBackendConfigured) {
    return (
      <main className="my-burns">
        <header className="my-burns__header">
          <Link className="my-burns__back" href="/studio">
            ← Back to Burner
          </Link>
          <h1>My Burns</h1>
        </header>
        <p className="my-burns__empty">
          Backend auth is not configured on this deployment, so burner history
          is unavailable.
        </p>
      </main>
    );
  }

  if (!authReady) {
    return (
      <main className="my-burns">
        <header className="my-burns__header">
          <Link className="my-burns__back" href="/studio">
            ← Back to Burner
          </Link>
          <h1>My Burns</h1>
        </header>
        <p className="my-burns__empty">Loading...</p>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="my-burns">
        <header className="my-burns__header">
          <Link className="my-burns__back" href="/studio">
            ← Back to Burner
          </Link>
          <h1>My Burns</h1>
        </header>
        <p className="my-burns__empty">
          Sign in on the <Link href="/studio">studio</Link> to see the CDs
          you&apos;ve burned.
        </p>
      </main>
    );
  }

  return (
    <main className="my-burns">
      <header className="my-burns__header">
        <Link className="my-burns__back" href="/studio">
          ← Back to Burner
        </Link>
        <h1>My Burns</h1>
        <p className="my-burns__subtitle">
          Every CD you&apos;ve burned. Tap one to reopen it in the studio.
        </p>
      </header>

      {actionError ? (
        <p className="my-burns__empty my-burns__empty--error">{actionError}</p>
      ) : null}

      {state.kind === "loading" ? (
        <p className="my-burns__empty">Loading your burns...</p>
      ) : state.kind === "error" ? (
        <p className="my-burns__empty my-burns__empty--error">
          Could not load your burns: {state.message}
        </p>
      ) : state.burners.length === 0 ? (
        <p className="my-burns__empty">
          No burns yet. <Link href="/studio">Burn your first CD.</Link>
        </p>
      ) : (
        <ul className="my-burns__list">
          {state.burners.map((burner) => {
            const link = state.shareLinks[burner.id];
            return (
              <li className="my-burns__item" key={burner.id}>
                <div className="my-burns__itemrow">
                  <Link
                    className="my-burns__itemlink"
                    href={`/studio?edit=${encodeURIComponent(burner.id)}`}
                  >
                    <div className="my-burns__cover">
                      {burner.cover_image_url ? (
                        <Image
                          alt=""
                          fill
                          sizes="72px"
                          src={burner.cover_image_url}
                          unoptimized
                        />
                      ) : (
                        <span>{burner.title.slice(0, 1) || "B"}</span>
                      )}
                    </div>
                    <div className="my-burns__meta">
                      <strong>{burner.title}</strong>
                      <span>
                        {burner.total_tracks} track
                        {burner.total_tracks === 1 ? "" : "s"}
                        {burner.is_revoked ? " • Revoked" : ""}
                      </span>
                      <span>Created {formatCreatedAt(burner.created_at)}</span>
                      {link ? (
                        <span className="my-burns__shortcode">
                          {link.short_code}
                        </span>
                      ) : null}
                    </div>
                  </Link>

                  <button
                    className="button my-burns__delete"
                    disabled={pendingAction !== null}
                    onClick={() => void deleteBurner(burner)}
                    type="button"
                  >
                    {deletingBurnerId === burner.id ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
