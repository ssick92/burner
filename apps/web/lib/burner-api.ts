import { createLocalShareExchange, encodeLocalSharePacket } from "@burner/core";
import type { ImportedTrack, RevealedTrack, ShareExchangeResult } from "@burner/core";
import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from "@supabase/supabase-js";

import { demoExchange, draft } from "./demo-burner";
import { runtimeFlags } from "./env";
import { createSupabaseClient, getBrowserSupabaseClient } from "./supabase";

async function describeFunctionError(
  error: unknown,
  fallbackMessage: string,
) {
  if (error instanceof FunctionsHttpError) {
    try {
      const payload = (await error.context.clone().json()) as {
        error?: string;
      };
      if (payload.error) {
        return payload.error;
      }
    } catch {
      // Fall through to the generic HTTP status copy below.
    }

    return `${error.message} (${error.context.status})`;
  }

  if (error instanceof FunctionsFetchError) {
    return "Burner could not reach Supabase.";
  }

  if (error instanceof FunctionsRelayError) {
    return "Supabase could not relay the burner request.";
  }

  return error instanceof Error ? error.message : fallbackMessage;
}

async function getBrowserAuthHeaders() {
  const supabase = getBrowserSupabaseClient();
  const {
    data: { session: initialSession },
  } = await supabase.auth.getSession();

  if (!initialSession?.access_token) {
    throw new Error("Burner sign-in expired. Sign in again to open saved burns.");
  }

  let session = initialSession;
  const expiresAtMs = session.expires_at ? session.expires_at * 1000 : 0;

  if (!expiresAtMs || expiresAtMs <= Date.now() + 60_000) {
    const { data, error } = await supabase.auth.refreshSession();
    if (error || !data.session?.access_token) {
      throw new Error("Burner sign-in expired. Sign in again to open saved burns.");
    }
    session = data.session;
  }

  return {
    Authorization: `Bearer ${session.access_token}`,
  };
}

export async function exchangeShareAccess(
  slug: string,
  token?: string,
  payload?: string,
  clientFingerprint = "web-anon",
): Promise<ShareExchangeResult & { localTracks?: ImportedTrack[] }> {
  if (payload) {
    return createLocalShareExchange(slug, payload);
  }

  if (!runtimeFlags.isSupabaseConfigured) {
    return createLocalShareExchange(slug, encodeLocalSharePacket(draft));
  }

  const supabase = createSupabaseClient();
  const { data, error } = await supabase.functions.invoke("exchange-share-access", {
    body: {
      slug,
      token,
      clientFingerprint,
    },
  });

  if (error) {
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

  return data;
}

export async function exchangeShareAccessInBrowser(
  slug: string,
  token?: string,
  payload?: string,
  clientFingerprint?: string,
) {
  if (payload || !token || !runtimeFlags.isSupabaseConfigured) {
    return exchangeShareAccess(slug, token, payload, clientFingerprint);
  }

  const supabase = getBrowserSupabaseClient();
  const { data, error } = await supabase.functions.invoke("exchange-share-access", {
    body: {
      slug,
      token,
      clientFingerprint,
    },
  });

  if (error || !data) {
    throw error ?? new Error("Burner could not open that share link.");
  }

  return data as ShareExchangeResult;
}

export async function startListenSession(input: {
  burnerId: string;
  position: number;
  provider: string;
  sessionToken: string;
}) {
  const supabase = getBrowserSupabaseClient();
  const { data, error } = await supabase.functions.invoke("start-listen-session", {
    body: input,
  });

  if (error) {
    throw error;
  }

  return data as {
    id: string;
    started_at: string;
    track?: RevealedTrack;
    status?: "blocked";
    nextPosition?: number;
  };
}

export async function completeTrackUnlock(input: {
  burnerId: string;
  position: number;
  elapsedSeconds: number;
  observedCompletion: boolean;
  sessionToken: string;
}) {
  const supabase = getBrowserSupabaseClient();
  const { data, error } = await supabase.functions.invoke("complete-track-unlock", {
    body: input,
  });

  if (error) {
    throw error;
  }

  return data as {
    status: "pending" | "unlocked" | "blocked";
    reason: string;
    nextPosition?: number | null;
    nextTrack?: RevealedTrack;
  };
}

export async function createBurnerShareLink(input: { burnerId: string }) {
  const supabase = getBrowserSupabaseClient();
  const headers = await getBrowserAuthHeaders();
  const { data, error } = await supabase.functions.invoke(
    "create-burner-share-link",
    {
      headers,
      body: input,
    },
  );

  if (error) {
    throw error;
  }

  return data as {
    burnerId: string;
    shareUrl: string;
    shortCode: string;
    slug: string;
  };
}

export async function getBurnerShareLink(input: { burnerId: string }) {
  const supabase = getBrowserSupabaseClient();
  const headers = await getBrowserAuthHeaders();
  const { data, error } = await supabase.functions.invoke(
    "get-burner-share-link",
    {
      headers,
      body: input,
    },
  );

  if (error) {
    throw new Error(
      await describeFunctionError(
        error,
        "Burner could not open that share page.",
      ),
    );
  }

  return data as {
    burnerId: string;
    shareUrl: string;
    shortCode: string;
    slug: string;
  };
}
