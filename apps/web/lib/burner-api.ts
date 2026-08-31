import { createLocalShareExchange, encodeLocalSharePacket } from "@burner/core";
import type { ImportedTrack, RevealedTrack, ShareExchangeResult } from "@burner/core";

import { demoExchange, draft } from "./demo-burner";
import { runtimeFlags } from "./env";
import { getSession } from "./auth-client";
import { DEMO_SHARE_SLUGS } from "./share-meta";

async function getBrowserAccessToken() {
  const initialSession = await getSession();

  if (!initialSession?.access_token) {
    throw new Error("Burner sign-in expired. Sign in again to open saved burns.");
  }

  return initialSession.access_token;
}

async function invokeAuthedBrowserFunction<TResponse>(
  path: string,
  body: Record<string, unknown>,
  fallbackMessage: string,
) {
  const accessToken = await getBrowserAccessToken();
  const response = await fetch(path, {
    body: JSON.stringify(body),
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  const responseText = await response.text();
  const parsedPayload = responseText
    ? (() => {
        try {
          return JSON.parse(responseText) as { error?: string };
        } catch {
          return null;
        }
      })()
    : null;

  if (!response.ok) {
    throw new Error(
      parsedPayload?.error ||
        `${fallbackMessage} (${response.status})`,
    );
  }

  if (!parsedPayload) {
    throw new Error(fallbackMessage);
  }

  return parsedPayload as TResponse;
}

export async function exchangeShareAccess(
  slug: string,
  token?: string,
  payload?: string,
  clientFingerprint = "web-anon",
): Promise<ShareExchangeResult & { localTracks?: ImportedTrack[] }> {
  if (DEMO_SHARE_SLUGS.has(slug) && !payload) {
    return demoExchange;
  }

  if (payload) {
    return createLocalShareExchange(slug, payload);
  }

  if (!runtimeFlags.isBackendConfigured) {
    return createLocalShareExchange(slug, encodeLocalSharePacket(draft));
  }

  const response = await fetch(`${process.env.NEXT_PUBLIC_WEB_ORIGIN ?? ""}/api/exchange-share-access`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      slug,
      token,
      clientFingerprint,
    }),
  });

  if (!response.ok) {
    return createLocalShareExchange(
      slug,
      encodeLocalSharePacket({
        title: demoExchange.burner.title,
        senderName: demoExchange.burner.senderName,
        note: demoExchange.burner.note,
        coverImageUrl: demoExchange.burner.coverImageUrl,
        revealMode: demoExchange.burner.revealMode,
        tracks: [
          {
            provider: demoExchange.firstTrack.provider,
            providerTrackId: "track-1",
            title: demoExchange.firstTrack.title,
            artist: demoExchange.firstTrack.artist,
            albumName: demoExchange.firstTrack.albumName,
            albumArtUrl: demoExchange.firstTrack.albumArtUrl,
            handoffUri: demoExchange.firstTrack.providerUri,
          },
        ],
      }),
    );
  }

  return response.json();
}

export async function exchangeShareAccessInBrowser(
  slug: string,
  token?: string,
  payload?: string,
  clientFingerprint?: string,
) {
  if (DEMO_SHARE_SLUGS.has(slug) && !payload) {
    return demoExchange;
  }

  if (payload || !token || !runtimeFlags.isBackendConfigured) {
    return exchangeShareAccess(slug, token, payload, clientFingerprint);
  }

  const response = await fetch("/api/exchange-share-access", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      slug,
      token,
      clientFingerprint,
    }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Burner could not open that share link.");
  }

  return response.json() as Promise<ShareExchangeResult>;
}

export async function startListenSession(input: {
  burnerId: string;
  position: number;
  provider: string;
  sessionToken: string;
}) {
  const response = await fetch("/api/start-listen-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Burner could not start playback.");
  }

  return response.json() as Promise<{
    id: string;
    started_at: string;
    track?: RevealedTrack;
    status?: "blocked";
    nextPosition?: number;
  }>;
}

export async function completeTrackUnlock(input: {
  burnerId: string;
  position: number;
  elapsedSeconds: number;
  observedCompletion: boolean;
  sessionToken: string;
}) {
  const response = await fetch("/api/complete-track-unlock", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Burner could not unlock the next track.");
  }

  return response.json() as Promise<{
    status: "pending" | "unlocked" | "blocked";
    reason: string;
    nextPosition?: number | null;
    nextTrack?: RevealedTrack;
  }>;
}

export async function createBurnerShareLink(input: { burnerId: string }) {
  return invokeAuthedBrowserFunction<{
    burnerId: string;
    shareUrl: string;
    shortCode: string;
    slug: string;
  }>(
    "/api/burner-share-link",
    { ...input, mode: "create" },
    "Burner could not create that share page.",
  );
}

export async function getBurnerShareLink(input: { burnerId: string }) {
  return invokeAuthedBrowserFunction<{
    burnerId: string;
    shareUrl: string;
    shortCode: string;
    slug: string;
  }>(
    "/api/burner-share-link",
    { ...input, mode: "get" },
    "Burner could not open that share page.",
  );
}

export async function getBurnerDraft(input: { burnerId: string }) {
  return invokeAuthedBrowserFunction<{
    title: string;
    senderName: string;
    note?: string;
    coverImageUrl?: string;
    revealMode: "timed" | "verified-or-timed";
    tracks: ImportedTrack[];
  }>(
    "/api/burner-draft",
    input,
    "Burner could not load that saved burn.",
  );
}
