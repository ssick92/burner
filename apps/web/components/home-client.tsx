"use client";

import Link from "next/link";
import Script from "next/script";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent } from "react";

import {
  encodeLocalSharePacket,
  type BurnerDraft,
  type ImportedTrack,
} from "@burner/core";
import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
  type Session,
  type SupabaseClient,
} from "@supabase/supabase-js";

import { BurnerMark } from "./burner-mark";
import { CoverArtField } from "./cover-art-field";
import { ShareDialog } from "./share-dialog";
import { defaultDraft } from "../lib/provider-catalog";
import {
  buildInAppPreviewEmbedUrl,
  supportsInAppPreview,
} from "../lib/track-preview";
import {
  buildShareEmailHref,
  copyText,
} from "../lib/share-utils";
import { env, runtimeFlags } from "../lib/env";
import { getBrowserSupabaseClient } from "../lib/supabase";
import { loadYouTubeIframeApi } from "../lib/youtube-player";
import {
  extractYouTubeImportCandidates,
  getYouTubeVideoId,
} from "../lib/youtube";
import {
  buildBrowserApiUrl,
  getCanonicalBrowserOrigin,
} from "../lib/browser-origin";

interface PublishResult {
  burnerId: string;
  shareUrl: string;
  shortCode: string;
  slug: string;
  warnings?: string[];
}

// Browsers cap URL length somewhere between 8KB (Safari) and ~32KB. Stay
// well under the smallest limit so links survive copy/paste, iMessage, etc.
const MAX_LOCAL_SHARE_URL_LENGTH = 6000;

interface YouTubeResolveResponse {
  track?: ImportedTrack;
  tracks?: ImportedTrack[];
  error?: string;
}

type PreviewTransport = "audio" | "embed" | "youtube" | null;
const BURN_ANIMATION_DURATION_MS = 1800;

declare global {
  interface Window {
    turnstile?: {
      remove(widgetId: string): void;
      render(
        container: HTMLElement,
        options: {
          callback?: (token: string) => void;
          "error-callback"?: () => void;
          "expired-callback"?: () => void;
          sitekey: string;
          theme?: "light" | "dark" | "auto";
        },
      ): string;
      reset(widgetId?: string): void;
    };
  }
}

function slugifyBurnerTitle(value: string) {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 36);

  return normalized || "burner";
}

function createShortCodeFromSlug(slug: string) {
  return slug.replace(/-/g, "").slice(0, 6).toUpperCase().padEnd(6, "X");
}

function isLocalBrowserHost() {
  if (typeof window === "undefined") {
    return false;
  }

  return (
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
  );
}

function shouldUseLocalPublishFallback(error: unknown) {
  if (!isLocalBrowserHost()) {
    return false;
  }

  if (
    error instanceof FunctionsFetchError ||
    error instanceof FunctionsRelayError
  ) {
    return true;
  }

  if (error instanceof FunctionsHttpError) {
    return error.context.status === 404 || error.context.status >= 500;
  }

  return (
    error instanceof Error && error.message.includes("Edge Function")
  );
}

async function describeFunctionError(error: unknown) {
  if (error instanceof FunctionsHttpError) {
    try {
      const payload = (await error.context.clone().json()) as {
        error?: string;
      };
      if (payload.error) {
        return payload.error;
      }
    } catch {
      // Fall through to the generic HTTP error copy below.
    }

    return `${error.message} (${error.context.status})`;
  }

  if (error instanceof FunctionsFetchError) {
    return "Burner could not reach the local Supabase Edge runtime.";
  }

  if (error instanceof FunctionsRelayError) {
    return "Supabase could not relay the burner request.";
  }

  return error instanceof Error
    ? error.message
    : "Burner could not create that share link.";
}

function sanitizeDraftForLocalShare(draft: BurnerDraft): {
  draft: BurnerDraft;
  warnings: string[];
} {
  const warnings: string[] = [];
  let coverImageUrl = draft.coverImageUrl;

  if (coverImageUrl?.startsWith("data:")) {
    coverImageUrl = undefined;
    warnings.push(
      "Custom cover art was dropped — share links can't carry uploaded images. Sign in to keep custom covers, or paste an image URL instead.",
    );
  }

  const tracks = draft.tracks.map((track) => {
    if (track.albumArtUrl?.startsWith("data:")) {
      return { ...track, albumArtUrl: undefined };
    }
    return track;
  });

  return {
    draft: { ...draft, coverImageUrl, tracks },
    warnings,
  };
}

function buildLocalPublishResult(draft: BurnerDraft): PublishResult {
  const { draft: cleanDraft, warnings } = sanitizeDraftForLocalShare(draft);
  const slugBase = slugifyBurnerTitle(cleanDraft.title);
  const slug = `${slugBase}-${crypto.randomUUID().slice(0, 6)}`;
  const payload = encodeLocalSharePacket(cleanDraft);
  const shareUrl = `${window.location.origin}/b/${slug}?payload=${payload}`;

  if (shareUrl.length > MAX_LOCAL_SHARE_URL_LENGTH) {
    throw new Error(
      `This burner is too big for an offline share link (${shareUrl.length.toLocaleString()} chars). Sign in to publish it, or trim the playlist.`,
    );
  }

  return {
    burnerId: `local-${slug}`,
    shareUrl,
    shortCode: createShortCodeFromSlug(slug),
    slug,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

function deriveSenderName(session: Session | null) {
  if (!session) {
    return defaultDraft.senderName;
  }

  return (
    session.user.user_metadata?.display_name ??
    session.user.user_metadata?.full_name ??
    session.user.email?.split("@")[0] ??
    defaultDraft.senderName
  );
}

function reorderTracks(
  tracks: ImportedTrack[],
  trackId: string,
  direction: -1 | 1,
) {
  const index = tracks.findIndex((track) => track.providerTrackId === trackId);
  if (index === -1) {
    return tracks;
  }

  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= tracks.length) {
    return tracks;
  }

  const next = [...tracks];
  const [track] = next.splice(index, 1);
  next.splice(targetIndex, 0, track);
  return next;
}

function moveTrackToIndex(
  tracks: ImportedTrack[],
  trackId: string,
  targetIndex: number,
) {
  const currentIndex = tracks.findIndex(
    (track) => track.providerTrackId === trackId,
  );
  if (currentIndex === -1) {
    return tracks;
  }

  const boundedTargetIndex = Math.max(0, Math.min(targetIndex, tracks.length));
  const next = [...tracks];
  const [track] = next.splice(currentIndex, 1);
  const insertIndex =
    boundedTargetIndex > currentIndex
      ? boundedTargetIndex - 1
      : boundedTargetIndex;
  next.splice(Math.max(0, Math.min(insertIndex, next.length)), 0, track);
  return next;
}

export function HomeClient() {
  const supabase = useMemo<SupabaseClient | null>(
    () =>
      runtimeFlags.isSupabaseConfigured ? getBrowserSupabaseClient() : null,
    [],
  );
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signupDisplayName, setSignupDisplayName] = useState("");
  const [authMode, setAuthMode] = useState<"signin" | "signup" | "forgot">(
    "signin",
  );
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const [turnstileReady, setTurnstileReady] = useState(false);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [previewMessage, setPreviewMessage] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState<string | null>(null);
  const [studioBusy, setStudioBusy] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [importText, setImportText] = useState("");
  const [publishResult, setPublishResult] = useState<PublishResult | null>(
    null,
  );
  const [copiedState, setCopiedState] = useState<"idle" | "copied">("idle");
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [showBurnAnimation, setShowBurnAnimation] = useState(false);
  const [title, setTitle] = useState(defaultDraft.title);
  const [senderName, setSenderName] = useState(defaultDraft.senderName);
  const [note, setNote] = useState(defaultDraft.note ?? "");
  const [coverImageUrl, setCoverImageUrl] = useState(
    defaultDraft.coverImageUrl ?? "",
  );
  const [tracks, setTracks] = useState<ImportedTrack[]>(defaultDraft.tracks);
  const [draggedTrackId, setDraggedTrackId] = useState<string | null>(null);
  const [playlistDropActive, setPlaylistDropActive] = useState(false);
  const [playlistInsertIndex, setPlaylistInsertIndex] = useState<number | null>(
    null,
  );
  const [previewTrackId, setPreviewTrackId] = useState<string | null>(null);
  const [previewBusyTrackId, setPreviewBusyTrackId] = useState<string | null>(
    null,
  );
  const [previewTrack, setPreviewTrack] = useState<ImportedTrack | null>(null);
  const [previewState, setPreviewState] = useState<
    "idle" | "loading" | "loaded" | "playing"
  >("idle");
  const [previewTransport, setPreviewTransport] =
    useState<PreviewTransport>(null);
  const [youtubePlayerReady, setYouTubePlayerReady] = useState(false);
  const [youtubeVideoId, setYouTubeVideoId] = useState<string | null>(null);
  const playlistPaneRef = useRef<HTMLElement | null>(null);
  const draggedPlaylistTrackIdRef = useRef<string | null>(null);
  const playlistDropDepthRef = useRef(0);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const youtubePlayerHostRef = useRef<HTMLDivElement | null>(null);
  const youtubePlayerRef = useRef<YouTubePlayer | null>(null);
  const youtubeAutoplayRef = useRef(false);
  const previewTransportRef = useRef<PreviewTransport>(null);
  const turnstileHostRef = useRef<HTMLDivElement | null>(null);
  const turnstileWidgetIdRef = useRef<string | null>(null);
  const previewEmbedUrl = useMemo(
    () => (previewTrack ? buildInAppPreviewEmbedUrl(previewTrack) : null),
    [previewTrack],
  );
  const turnstileConfigured = Boolean(env.turnstileSiteKey.trim());
  const turnstileRequired =
    turnstileConfigured && (authMode === "signup" || authMode === "forgot");
  const showingEmbeddedPreview = Boolean(
    previewTransport === "embed" && previewTrack && previewEmbedUrl,
  );
  const showingManagedYouTubePreview = Boolean(
    previewTransport === "youtube" && previewTrack && youtubeVideoId,
  );

  useEffect(() => {
    if (!supabase) {
      setSession(null);
      setSenderName((current) =>
        current.trim() ? current : defaultDraft.senderName,
      );
      return;
    }

    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) {
        return;
      }

      const nextSession = data.session ?? null;
      setSession(nextSession);
      setSenderName((current) =>
        current.trim() ? current : deriveSenderName(nextSession),
      );
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) {
        return;
      }

      setSession(nextSession);
      if (nextSession) {
        setShowAuthDialog(false);
        setAuthMode("signin");
        setAuthMessage(null);
        setPassword("");
      }
      clearPublishedShare();
      setSenderName((current) => {
        const normalized = current.trim();
        if (!normalized || normalized === defaultDraft.senderName) {
          return deriveSenderName(nextSession);
        }

        return current;
      });
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    previewTransportRef.current = previewTransport;
  }, [previewTransport]);

  useEffect(() => {
    if (!showAuthDialog) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setShowAuthDialog(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showAuthDialog]);

  useEffect(() => {
    if (
      !turnstileRequired ||
      !turnstileReady ||
      !turnstileHostRef.current ||
      !window.turnstile
    ) {
      return;
    }

    setCaptchaToken("");
    turnstileHostRef.current.innerHTML = "";

    const widgetId = window.turnstile.render(turnstileHostRef.current, {
      sitekey: env.turnstileSiteKey,
      theme: "light",
      callback: (token) => {
        setCaptchaToken(token);
        setAuthMessage(null);
      },
      "expired-callback": () => {
        setCaptchaToken("");
      },
      "error-callback": () => {
        setCaptchaToken("");
        setAuthMessage(
          "The security check did not load correctly. Refresh and try again.",
        );
      },
    });

    turnstileWidgetIdRef.current = widgetId;

    return () => {
      if (turnstileWidgetIdRef.current && window.turnstile) {
        window.turnstile.remove(turnstileWidgetIdRef.current);
      }
      turnstileWidgetIdRef.current = null;
    };
  }, [turnstileRequired, turnstileReady]);

  useEffect(() => {
    const audio = previewAudioRef.current;
    if (!audio) {
      return;
    }

    const handleEnded = () => {
      setPreviewBusyTrackId(null);
      setPreviewState("loaded");
    };

    const handlePlaying = () => {
      setPreviewBusyTrackId(null);
      setPreviewState("playing");
    };

    const handlePause = () => {
      if (
        !audio.ended &&
        audio.currentSrc &&
        previewTransportRef.current === "audio"
      ) {
        setPreviewState("loaded");
      }
    };

    const handleError = () => {
      setPreviewBusyTrackId(null);
      setPreviewState("loaded");
      setPreviewMessage("The browser would not start that audio preview.");
    };

    audio.addEventListener("playing", handlePlaying);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);

    return () => {
      audio.pause();
      audio.src = "";
      audio.removeEventListener("playing", handlePlaying);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
    };
  }, []);

  useEffect(() => {
    if (previewTransport !== "youtube" || !youtubeVideoId) {
      return;
    }

    let cancelled = false;
    const resolvedVideoId = youtubeVideoId;

    async function ensureYouTubePlayer() {
      try {
        const YT = await loadYouTubeIframeApi();
        if (cancelled || !youtubePlayerHostRef.current) {
          return;
        }

        const handleStateChange = (event: YouTubePlayerEvent) => {
          if (previewTransportRef.current !== "youtube") {
            return;
          }

          switch (event.data) {
            case 1:
              setPreviewBusyTrackId(null);
              setPreviewState("playing");
              break;
            case 0:
            case 2:
            case 5:
              setPreviewBusyTrackId(null);
              setPreviewState("loaded");
              break;
            case 3:
              setPreviewState("loading");
              break;
            default:
              break;
          }
        };

        if (!youtubePlayerRef.current) {
          youtubePlayerRef.current = new YT.Player(
            youtubePlayerHostRef.current,
            {
              height: "100%",
              width: "100%",
              videoId: resolvedVideoId,
              playerVars: {
                autoplay: youtubeAutoplayRef.current ? 1 : 0,
                controls: 1,
                enablejsapi: 1,
                origin: getCanonicalBrowserOrigin(window.location.origin),
                playsinline: 1,
                rel: 0,
              },
              events: {
                onReady: (event) => {
                  setYouTubePlayerReady(true);

                  if (!youtubeAutoplayRef.current) {
                    setPreviewBusyTrackId(null);
                    setPreviewState("loaded");
                    return;
                  }

                  event.target.playVideo();
                },
                onStateChange: handleStateChange,
                onError: () => {
                  setPreviewBusyTrackId(null);
                  setPreviewState("loaded");
                  setPreviewMessage(
                    "YouTube could not start playback for that song.",
                  );
                },
              },
            },
          );

          return;
        }

        setYouTubePlayerReady(true);

        if (youtubeAutoplayRef.current) {
          youtubePlayerRef.current.loadVideoById(resolvedVideoId);
        } else {
          youtubePlayerRef.current.cueVideoById(resolvedVideoId);
          setPreviewBusyTrackId(null);
          setPreviewState("loaded");
        }
      } catch (error) {
        setPreviewBusyTrackId(null);
        setPreviewState("loaded");
        setPreviewMessage((error as Error).message);
      }
    }

    setYouTubePlayerReady(false);
    void ensureYouTubePlayer();

    return () => {
      cancelled = true;
    };
  }, [previewTransport, youtubeVideoId]);

  useEffect(() => {
    return () => {
      youtubePlayerRef.current?.destroy();
      youtubePlayerRef.current = null;
    };
  }, []);

  function clearAudioPreview() {
    const audio = previewAudioRef.current;
    if (!audio) {
      return;
    }

    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  }

  function pauseYouTubePreview() {
    try {
      youtubePlayerRef.current?.pauseVideo();
    } catch {
      // The iframe can throw if it is not ready yet.
    }
  }

  async function stopCurrentPreview(options?: { clearSelection?: boolean }) {
    clearAudioPreview();
    pauseYouTubePreview();
    setPreviewBusyTrackId(null);

    if (options?.clearSelection) {
      setPreviewTrack(null);
      setPreviewTrackId(null);
      setPreviewTransport(null);
      setYouTubeVideoId(null);
      setPreviewState("idle");
      return;
    }

    if (previewTrackId) {
      setPreviewState("loaded");
    }
  }

  async function loadTrackPreview(
    track: ImportedTrack,
    options?: { autoplay?: boolean },
  ) {
    const autoplay = options?.autoplay ?? true;
    const audio = previewAudioRef.current;
    const embedUrl = buildInAppPreviewEmbedUrl(track);
    const youtubePreviewId = getYouTubeVideoId(track);

    setPreviewMessage(null);
    setPreviewTrack(track);
    setPreviewTrackId(track.providerTrackId);
    setPreviewBusyTrackId(track.providerTrackId);
    setPreviewState("loading");

    try {
      await stopCurrentPreview();

      if (youtubePreviewId) {
        youtubeAutoplayRef.current = autoplay;
        setPreviewTransport("youtube");
        setYouTubeVideoId(youtubePreviewId);

        if (!autoplay) {
          setPreviewBusyTrackId(null);
          setPreviewState("loaded");
        }

        return;
      }

      if (track.previewUrl) {
        setPreviewTransport("audio");

        if (!audio) {
          throw new Error("Burner is still loading the preview deck.");
        }

        if (audio.src !== track.previewUrl) {
          audio.src = track.previewUrl;
        }

        audio.currentTime = 0;
        audio.load();

        if (autoplay) {
          await audio.play();
          setPreviewBusyTrackId(null);
        } else {
          setPreviewBusyTrackId(null);
          setPreviewState("loaded");
        }

        return;
      }

      if (embedUrl) {
        setPreviewTransport("embed");
        setPreviewBusyTrackId(null);
        setPreviewState("loaded");
        setPreviewMessage("This song falls back to the embedded player below.");
        return;
      }

      throw new Error("This song does not expose an in-app preview.");
    } catch (error) {
      setPreviewBusyTrackId(null);
      setPreviewState("loaded");
      setPreviewMessage((error as Error).message);
    }
  }

  async function toggleTransportPlayback() {
    const audio = previewAudioRef.current;

    if (!previewTrack) {
      if (tracks.length === 0) {
        setPreviewMessage(
          "Paste a YouTube song link to start building the disc.",
        );
        return;
      }

      await loadTrackPreview(tracks[0]);
      return;
    }

    if (previewTransport === "youtube") {
      if (!youtubePlayerRef.current || !youtubePlayerReady) {
        setPreviewMessage(
          "YouTube playback is still loading. Try again in a moment.",
        );
        return;
      }

      const state = youtubePlayerRef.current.getPlayerState();
      if (state === 1 || state === 3) {
        youtubePlayerRef.current.pauseVideo();
        setPreviewState("loaded");
        return;
      }

      setPreviewBusyTrackId(previewTrack.providerTrackId);
      youtubePlayerRef.current.playVideo();
      return;
    }

    if (previewTransport === "audio") {
      if (!audio) {
        setPreviewMessage("Burner is still loading the preview deck.");
        return;
      }

      if (previewState === "playing") {
        audio.pause();
        return;
      }

      setPreviewBusyTrackId(previewTrack.providerTrackId);

      try {
        await audio.play();
      } catch {
        setPreviewMessage(
          "The browser blocked playback. Press play again after interacting with the page.",
        );
        setPreviewState("loaded");
      } finally {
        setPreviewBusyTrackId(null);
      }

      return;
    }

    if (previewTransport === "embed") {
      setPreviewMessage("Use the embedded player below for this song.");
      return;
    }

    await loadTrackPreview(previewTrack);
  }

  async function stepPreview(direction: -1 | 1) {
    if (tracks.length === 0) {
      setPreviewMessage(
        "Paste a YouTube song link to start building the disc.",
      );
      return;
    }

    const currentIndex = previewTrackId
      ? tracks.findIndex((track) => track.providerTrackId === previewTrackId)
      : -1;
    const nextIndex = currentIndex === -1 ? 0 : currentIndex + direction;
    if (nextIndex < 0 || nextIndex >= tracks.length) {
      return;
    }

    await loadTrackPreview(tracks[nextIndex]);
  }

  async function runAuthAction(label: string, action: () => Promise<void>) {
    setAuthBusy(label);
    setAuthMessage(null);

    try {
      await action();
    } catch (error) {
      setAuthMessage((error as Error).message);
    } finally {
      setAuthBusy(null);
    }
  }

  async function handleSignInPassword() {
    if (!supabase) {
      setAuthMessage("Supabase auth is not configured on this deployment yet.");
      return;
    }

    if (!email.trim() || !password) {
      setAuthMessage("Enter your email and password.");
      return;
    }

    await runAuthAction("signin", async () => {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
        options: {
          captchaToken: captchaToken || undefined,
        },
      });
      if (error) {
        throw error;
      }
      setPassword("");
      setCaptchaToken("");
      if (turnstileWidgetIdRef.current && window.turnstile) {
        window.turnstile.reset(turnstileWidgetIdRef.current);
      }
    });
  }

  async function handleSignUp() {
    if (!supabase) {
      setAuthMessage("Supabase auth is not configured on this deployment yet.");
      return;
    }

    if (!email.trim() || !password) {
      setAuthMessage("Enter an email and a password (8+ characters).");
      return;
    }

    if (password.length < 8) {
      setAuthMessage("Use a password with at least 8 characters.");
      return;
    }

    if (turnstileRequired && !captchaToken) {
      setAuthMessage("Complete the security check before creating your account.");
      return;
    }

    await runAuthAction("signup", async () => {
      try {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            captchaToken: captchaToken || undefined,
            emailRedirectTo: `${window.location.origin}/auth/callback`,
            data: signupDisplayName.trim()
              ? { display_name: signupDisplayName.trim() }
              : undefined,
          },
        });
        if (error) {
          throw error;
        }
        setPassword("");
        setCaptchaToken("");
        if (!data.session) {
          setAuthMessage(
            "Account created. Sign in with your new password to continue.",
          );
          setAuthMode("signin");
        }
      } finally {
        if (turnstileWidgetIdRef.current && window.turnstile) {
          window.turnstile.reset(turnstileWidgetIdRef.current);
        }
      }
    });
  }

  async function handleForgotPassword() {
    if (!supabase) {
      setAuthMessage("Supabase auth is not configured on this deployment yet.");
      return;
    }

    if (!email.trim()) {
      setAuthMessage("Enter the email on your account to get a reset link.");
      return;
    }

    if (turnstileRequired && !captchaToken) {
      setAuthMessage(
        "Complete the security check before requesting a reset link.",
      );
      return;
    }

    await runAuthAction("forgot", async () => {
      const { error } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        {
          captchaToken: captchaToken || undefined,
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      );
      if (error) {
        throw error;
      }
      setCaptchaToken("");
      if (turnstileWidgetIdRef.current && window.turnstile) {
        window.turnstile.reset(turnstileWidgetIdRef.current);
      }
      setAuthMessage(
        "Password reset link sent. Check your inbox and click through to set a new password.",
      );
    });
  }

  async function handleOAuth(provider: "google") {
    if (!supabase) {
      setAuthMessage(
        "Supabase auth is not configured on this deployment yet.",
      );
      return;
    }

    await runAuthAction(provider, async () => {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        throw error;
      }

      if (!data.url) {
        throw new Error(
          "Google OAuth is not configured in Supabase yet.",
        );
      }

      window.location.assign(data.url);
    });
  }

  async function handleSignOut() {
    if (!supabase) {
      return;
    }

    await runAuthAction("signout", async () => {
      const { error } = await supabase.auth.signOut();
      if (error) {
        throw error;
      }

      await stopCurrentPreview({ clearSelection: true });
      setAuthMode("signin");
      setAuthMessage(null);
      setPassword("");
    });
  }

  async function importYouTubeLinks() {
    const candidates = extractYouTubeImportCandidates(importText);
    if (candidates.length === 0) {
      setAuthMessage(
        "Paste one or more public YouTube song links, one per line.",
      );
      return;
    }

    setImportBusy(true);
    setAuthMessage(null);

    try {
      const requestBody = JSON.stringify({
        urls: candidates,
      });
      const requestInit = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: requestBody,
      } satisfies RequestInit;
      let response: Response;

      try {
        response = await fetch("/api/youtube/resolve", requestInit);
      } catch {
        response = await fetch(
          buildBrowserApiUrl(
            "/api/youtube/resolve",
            typeof window !== "undefined" ? window.location.origin : undefined,
          ),
          requestInit,
        );
      }
      const payload = (await response.json()) as YouTubeResolveResponse;

      if (!response.ok) {
        throw new Error(payload.error ?? "YouTube import failed.");
      }

      const resolvedTracks =
        payload.tracks ?? (payload.track ? [payload.track] : []);
      if (resolvedTracks.length === 0) {
        throw new Error("Burner could not resolve any of those YouTube links.");
      }

      const seen = new Set(tracks.map((track) => track.providerTrackId));
      const tracksToAdd: ImportedTrack[] = [];

      for (const track of resolvedTracks) {
        if (seen.has(track.providerTrackId)) {
          continue;
        }

        seen.add(track.providerTrackId);
        tracksToAdd.push(track);
      }

      if (tracksToAdd.length > 0) {
        setTracks((current) => [...current, ...tracksToAdd]);
      }

      setImportText("");
      clearPublishedShare();

      const duplicateCount = resolvedTracks.length - tracksToAdd.length;
      if (tracksToAdd.length === 0) {
        setAuthMessage("Those YouTube songs are already on this burner.");
      } else if (duplicateCount > 0) {
        setAuthMessage(
          `Added ${tracksToAdd.length} YouTube song${tracksToAdd.length === 1 ? "" : "s"}. Skipped ${duplicateCount} already on this burner.`,
        );
      } else {
        setAuthMessage(
          `Added ${tracksToAdd.length} YouTube song${tracksToAdd.length === 1 ? "" : "s"} to this burner.`,
        );
      }
    } catch (error) {
      setAuthMessage((error as Error).message);
    } finally {
      setImportBusy(false);
    }
  }

  function clearDragState() {
    draggedPlaylistTrackIdRef.current = null;
    setDraggedTrackId(null);
    setPlaylistDropActive(false);
    setPlaylistInsertIndex(null);
    playlistDropDepthRef.current = 0;
  }

  function getPlaylistInsertIndex(
    event: DragEvent<HTMLDivElement>,
    index: number,
  ) {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientY < rect.top + rect.height / 2 ? index : index + 1;
  }

  function handlePlaylistDragEnter(event: DragEvent<HTMLElement>) {
    if (!draggedPlaylistTrackIdRef.current) {
      return;
    }

    event.preventDefault();
    playlistDropDepthRef.current += 1;
    setPlaylistDropActive(true);
  }

  function handlePlaylistDragOver(event: DragEvent<HTMLElement>) {
    if (!draggedPlaylistTrackIdRef.current) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (!playlistDropActive) {
      setPlaylistDropActive(true);
    }

    if (playlistInsertIndex === null) {
      setPlaylistInsertIndex(tracks.length);
    }
  }

  function handlePlaylistDragLeave() {
    if (!draggedPlaylistTrackIdRef.current) {
      return;
    }

    playlistDropDepthRef.current = Math.max(
      playlistDropDepthRef.current - 1,
      0,
    );
    if (playlistDropDepthRef.current === 0) {
      setPlaylistDropActive(false);
      setPlaylistInsertIndex(null);
    }
  }

  function handlePlaylistDrop(event: DragEvent<HTMLElement>) {
    const draggedTrackId = draggedPlaylistTrackIdRef.current;
    if (!draggedTrackId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setTracks((current) =>
      moveTrackToIndex(
        current,
        draggedTrackId,
        playlistInsertIndex ?? current.length,
      ),
    );
    clearPublishedShare();
    clearDragState();
  }

  function handlePlaylistRowDragStart(
    event: DragEvent<HTMLDivElement>,
    trackId: string,
  ) {
    if ((event.target as HTMLElement).closest("button, a, audio, iframe")) {
      event.preventDefault();
      return;
    }

    draggedPlaylistTrackIdRef.current = trackId;
    setPlaylistInsertIndex(null);
    setDraggedTrackId(trackId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", trackId);
  }

  function handlePlaylistRowDragOver(
    event: DragEvent<HTMLDivElement>,
    index: number,
  ) {
    if (!draggedPlaylistTrackIdRef.current) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setPlaylistDropActive(true);
    setPlaylistInsertIndex(getPlaylistInsertIndex(event, index));
    event.dataTransfer.dropEffect = "move";
  }

  function handlePlaylistRowDrop(
    event: DragEvent<HTMLDivElement>,
    index: number,
  ) {
    const draggedTrackId = draggedPlaylistTrackIdRef.current;
    if (!draggedTrackId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const insertIndex = getPlaylistInsertIndex(event, index);
    setTracks((current) =>
      moveTrackToIndex(current, draggedTrackId, insertIndex),
    );
    clearPublishedShare();
    clearDragState();
  }

  function handlePlaylistRowDragEnd() {
    clearDragState();
  }

  function clearPublishedShare() {
    setPublishResult(null);
    setCopiedState("idle");
    setShareFeedback(null);
    setShowShareDialog(false);
  }

  function storePublishedShare(result: PublishResult) {
    setPublishResult(result);
    setCopiedState("idle");
    setShareFeedback(null);
    setShowShareDialog(true);
  }

  function previewButtonState(track: ImportedTrack) {
    if (previewBusyTrackId === track.providerTrackId) {
      return { icon: "…", label: "Loading" };
    }

    if (
      previewTrackId === track.providerTrackId &&
      previewState === "playing"
    ) {
      return { icon: "⏸", label: "Pause" };
    }

    return { icon: "▶", label: "Play" };
  }

  async function toggleTrackPreview(track: ImportedTrack) {
    if (previewTrackId === track.providerTrackId) {
      await toggleTransportPlayback();
      return;
    }

    await loadTrackPreview(track, { autoplay: true });
  }

  function removeTrack(trackId: string) {
    setTracks((current) =>
      current.filter((track) => track.providerTrackId !== trackId),
    );
    clearPublishedShare();

    if (previewTrackId === trackId) {
      void stopCurrentPreview({ clearSelection: true });
    }
  }

  function moveTrack(trackId: string, direction: -1 | 1) {
    setTracks((current) => reorderTracks(current, trackId, direction));
    clearPublishedShare();
  }

  async function publishBurner() {
    if (!title.trim() || !senderName.trim()) {
      setAuthMessage("Give the disc a title and a sender name first.");
      return;
    }

    if (tracks.length === 0) {
      setAuthMessage("Add at least one YouTube song before you burn the link.");
      return;
    }

    setStudioBusy(true);
    setShowBurnAnimation(true);
    setAuthMessage(null);

    try {
      await new Promise((resolve) =>
        window.setTimeout(resolve, BURN_ANIMATION_DURATION_MS),
      );

      const draft: BurnerDraft = {
        title: title.trim(),
        senderName: senderName.trim(),
        note: note.trim() || undefined,
        coverImageUrl: coverImageUrl.trim() || undefined,
        revealMode: "verified-or-timed",
        tracks,
      };

      if (!supabase || !session) {
        const localResult = buildLocalPublishResult(draft);
        storePublishedShare(localResult);
        setAuthMessage(
          localResult.warnings?.join(" ") ??
            "Burner created a browser-only share link for this mixtape.",
        );
        return;
      }

      const { data, error } = await supabase.functions.invoke("create-burner", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: draft,
      });

      if (error) {
        if (shouldUseLocalPublishFallback(error)) {
          console.warn(
            "Burner fell back to a browser-only share link because create-burner failed locally.",
            error,
          );
          const localResult = buildLocalPublishResult(draft);
          storePublishedShare(localResult);
          if (localResult.warnings && localResult.warnings.length > 0) {
            setAuthMessage(localResult.warnings.join(" "));
          }
          return;
        }

        throw new Error(await describeFunctionError(error));
      }

      storePublishedShare(data as PublishResult);
    } catch (error) {
      setAuthMessage((error as Error).message);
    } finally {
      setStudioBusy(false);
      setShowBurnAnimation(false);
    }
  }

  async function copyShareUrl() {
    if (!publishResult) {
      return;
    }

    try {
      await copyText(publishResult.shareUrl);
      setCopiedState("copied");
      window.setTimeout(() => setCopiedState("idle"), 2000);
    } catch {
      setAuthMessage(
        "Copy failed in this browser. Open the share link and copy it manually.",
      );
    }
  }

  const activePlaylistPreviewIndex = previewTrackId
    ? tracks.findIndex((track) => track.providerTrackId === previewTrackId)
    : -1;
  const transportCanStepBack = activePlaylistPreviewIndex > 0;
  const transportCanStepForward =
    activePlaylistPreviewIndex !== -1 &&
    activePlaylistPreviewIndex < tracks.length - 1;
  const transportIsBusy =
    previewBusyTrackId !== null || previewState === "loading";
  const browserOnlyMode = !runtimeFlags.isSupabaseConfigured;
  const browserOnlyModeMessage = browserOnlyMode
    ? "Browser-only publishing is active on this deployment. Burner will pack the mixtape into the share link itself, so extra-large playlists can be too long to send."
    : null;
  const donationSupportBox = runtimeFlags.hasDeveloperDonation
    ? {
        actions: [
          env.developerDonationUrl.trim()
            ? {
                href: env.developerDonationUrl.trim(),
                label: env.developerDonationLabel.trim() || "Tip the developer",
              }
            : null,
          env.developerDonationSecondaryUrl.trim()
            ? {
                href: env.developerDonationSecondaryUrl.trim(),
                label:
                  env.developerDonationSecondaryLabel.trim() ||
                  "Other donation options",
              }
            : null,
        ].filter(
          (
            action,
          ): action is {
            href: string;
            label: string;
          } => Boolean(action),
        ),
        copy:
          env.developerDonationMessage.trim() ||
          "Optional, but appreciated if you want to help fund Burner development.",
        title: "Support Burner",
      }
    : undefined;
  const shareDialogEmailHref = publishResult
    ? buildShareEmailHref({
        senderName,
        shareUrl: publishResult.shareUrl,
        title,
      })
    : "";
  const historyUpsellMessage =
    runtimeFlags.isSupabaseConfigured && !session
      ? "Burn links without an account. Want your burn history later? Create an account, then sign in from the top right."
      : null;

  return (
    <main className="app-shell itunes-shell">
      {turnstileRequired ? (
        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
          strategy="afterInteractive"
          onLoad={() => setTurnstileReady(true)}
        />
      ) : null}
      {showAuthDialog && runtimeFlags.isSupabaseConfigured && !session ? (
        <div
          aria-labelledby="auth-dialog-title"
          aria-modal="true"
          className="share-dialog auth-dialog"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setShowAuthDialog(false);
            }
          }}
          role="dialog"
        >
          <div className="share-dialog__panel auth-dialog__panel">
            <div className="auth-dialog__header">
              <div className="stack-xs">
                <strong className="share-dialog__eyebrow">Account access</strong>
                <h2 className="share-dialog__title" id="auth-dialog-title">
                  {authMode === "signup"
                    ? "Create Account"
                    : authMode === "forgot"
                      ? "Reset Password"
                      : "Sign In"}
                </h2>
                <p className="share-dialog__copy">
                  {authMode === "signup"
                    ? "Make an account to save your burns and reopen them from history later."
                    : authMode === "forgot"
                      ? "Enter your email and Burner will send a password reset link."
                      : "Sign in to save burner history and reopen CDs you already burned."}
                </p>
              </div>
              <button
                className="button button--secondary"
                onClick={() => setShowAuthDialog(false)}
                type="button"
              >
                Close
              </button>
            </div>

            <div className="itunes-signin auth-dialog__body">
              <div className="itunes-signin__card">
                <form
                  className="itunes-signin__form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (authMode === "signup") void handleSignUp();
                    else if (authMode === "forgot") void handleForgotPassword();
                    else void handleSignInPassword();
                  }}
                >
                  {authMode === "signup" ? (
                    <label className="field">
                      <span>Display name</span>
                      <input
                        autoComplete="name"
                        className="input"
                        placeholder="Skye"
                        value={signupDisplayName}
                        onChange={(event) =>
                          setSignupDisplayName(event.target.value)
                        }
                      />
                    </label>
                  ) : null}

                  <label className="field">
                    <span>Email</span>
                    <input
                      autoComplete="email"
                      className="input"
                      inputMode="email"
                      placeholder="you@burner.fm"
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                    />
                  </label>

                  {authMode !== "forgot" ? (
                    <label className="field">
                      <span>Password</span>
                      <input
                        autoComplete={
                          authMode === "signup"
                            ? "new-password"
                            : "current-password"
                        }
                        className="input"
                        minLength={authMode === "signup" ? 8 : undefined}
                        placeholder={
                          authMode === "signup"
                            ? "At least 8 characters"
                            : "Your password"
                        }
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                      />
                    </label>
                  ) : null}

                  {turnstileRequired ? (
                    <div className="itunes-signin__captcha">
                      <span>Security check</span>
                      <div
                        className="itunes-signin__captcha-host"
                        ref={turnstileHostRef}
                      />
                    </div>
                  ) : null}

                  <button
                    className="button button--primary"
                    disabled={
                      authBusy !== null || (turnstileRequired && !captchaToken)
                    }
                    type="submit"
                  >
                    {authMode === "signup"
                      ? authBusy === "signup"
                        ? "Creating..."
                        : "Create Account"
                      : authMode === "forgot"
                        ? authBusy === "forgot"
                          ? "Sending..."
                          : "Send Reset Link"
                        : authBusy === "signin"
                          ? "Signing in..."
                          : "Sign In"}
                  </button>

                  {authMode === "signin" ? (
                    <button
                      className="itunes-signin__link"
                      disabled={authBusy !== null}
                      onClick={() => {
                        setAuthMessage(null);
                        setAuthMode("forgot");
                      }}
                      type="button"
                    >
                      Forgot password?
                    </button>
                  ) : null}
                </form>

                <div className="itunes-signin__divider">
                  <span>or</span>
                </div>

                <button
                  className="button button--secondary"
                  disabled={authBusy !== null}
                  onClick={() => handleOAuth("google")}
                  type="button"
                >
                  {authBusy === "google"
                    ? "Redirecting..."
                    : "Continue with Google"}
                </button>

                <p className="itunes-signin__swap">
                  {authMode === "signin" ? (
                    <>
                      New to Burner?{" "}
                      <button
                        className="itunes-signin__link"
                        disabled={authBusy !== null}
                        onClick={() => {
                          setAuthMessage(null);
                          setAuthMode("signup");
                        }}
                        type="button"
                      >
                        Create an account
                      </button>
                    </>
                  ) : authMode === "signup" ? (
                    <>
                      Already have an account?{" "}
                      <button
                        className="itunes-signin__link"
                        disabled={authBusy !== null}
                        onClick={() => {
                          setAuthMessage(null);
                          setAuthMode("signin");
                        }}
                        type="button"
                      >
                        Sign in
                      </button>
                    </>
                  ) : (
                    <button
                      className="itunes-signin__link"
                      disabled={authBusy !== null}
                      onClick={() => {
                        setAuthMessage(null);
                        setAuthMode("signin");
                      }}
                      type="button"
                    >
                      ← Back to sign in
                    </button>
                  )}
                </p>

                {authMessage ? (
                  <p className="status-message">{authMessage}</p>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
      <section className="itunes-window">
        <header className="studio-header">
          <div className="studio-header__copy">
            <span className="eyebrow">
              <BurnerMark className="eyebrow__mark" size={18} />
              burner studio
            </span>
            <h1>{title || "Untitled Burner"}</h1>
          </div>
          <div className="studio-header__actions">
            <button
              className="button button--primary"
              disabled={studioBusy}
              onClick={publishBurner}
            >
              {studioBusy ? "Burning..." : "Burn Link"}
            </button>
            {runtimeFlags.isSupabaseConfigured && session ? (
              <Link className="button button--secondary" href="/my-burns">
                My Burns
              </Link>
            ) : null}
            {runtimeFlags.isSupabaseConfigured && session ? (
              <button
                className="button button--secondary"
                disabled={authBusy !== null}
                onClick={handleSignOut}
                type="button"
              >
                Sign Out
              </button>
            ) : null}
            {runtimeFlags.isSupabaseConfigured && !session ? (
              <button
                className="button button--secondary"
                disabled={authBusy !== null}
                onClick={() => {
                  setAuthMessage(null);
                  setAuthMode("signin");
                  setShowAuthDialog(true);
                }}
                type="button"
              >
                Sign In
              </button>
            ) : null}
          </div>
        </header>

        {showBurnAnimation ? (
          <div className="burn-drive" role="status" aria-live="polite">
            <div className="burn-drive__scene">
              <div className="burn-drive__disc">
                <div className="burn-drive__disc-label">
                  <span>BURNER</span>
                  <span>CD-R 700MB</span>
                </div>
                <div className="burn-drive__disc-hub" />
              </div>
              <div className="burn-drive__casing">
                <div className="burn-drive__slot" />
                <div className="burn-drive__panel">
                  <span className="burn-drive__led" />
                  <span className="burn-drive__brand">BURNER DRIVE</span>
                  <span className="burn-drive__status">BURNING…</span>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {browserOnlyModeMessage ? (
          <p className="status-message status-message--compact">
            {browserOnlyModeMessage}
          </p>
        ) : null}
        {historyUpsellMessage ? (
          <p className="studio-auth-note">{historyUpsellMessage}</p>
        ) : null}

        {showShareDialog && publishResult ? (
          <ShareDialog
            copied={copiedState === "copied"}
            emailHref={shareDialogEmailHref}
            feedback={shareFeedback}
            itemCountLabel={`${tracks.length} track${tracks.length === 1 ? "" : "s"}`}
            onClose={() => setShowShareDialog(false)}
            onCopy={() => void copyShareUrl()}
            shareUrl={publishResult.shareUrl}
            shortCode={publishResult.shortCode}
            supportBox={donationSupportBox}
            title={title}
          />
        ) : null}

        <div className="itunes-layout">
          <aside className="itunes-sidebar">
            <section className="itunes-sidebar__group">
              <h2>Cover Art</h2>
              <CoverArtField
                onChange={(nextValue) => {
                  setCoverImageUrl(nextValue);
                  clearPublishedShare();
                }}
                value={coverImageUrl}
              />
            </section>

            <section className="itunes-sidebar__group">
              <h2>Details</h2>
              <label className="field">
                <span>Title</span>
                <input
                  className="input"
                  value={title}
                  onChange={(event) => {
                    setTitle(event.target.value);
                    clearPublishedShare();
                  }}
                />
              </label>
              <label className="field">
                <span>Sender</span>
                <input
                  className="input"
                  value={senderName}
                  onChange={(event) => {
                    setSenderName(event.target.value);
                    clearPublishedShare();
                  }}
                />
              </label>
              <label className="field">
                <span>Note</span>
                <textarea
                  className="textarea textarea--compact"
                  value={note}
                  onChange={(event) => {
                    setNote(event.target.value);
                    clearPublishedShare();
                  }}
                />
              </label>
            </section>

            <section className="itunes-sidebar__group">
              <h2>Share</h2>
              {publishResult ? (
                <div className="itunes-sharebox">
                  <strong>{publishResult.shortCode}</strong>
                  <a
                    href={publishResult.shareUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open Link
                  </a>
                  <button
                    className="button button--secondary"
                    onClick={copyShareUrl}
                    type="button"
                  >
                    {copiedState === "copied" ? "Copied" : "Copy Link"}
                  </button>
                  <button
                    className="button button--secondary"
                    onClick={() => setShowShareDialog(true)}
                    type="button"
                  >
                    Share Options
                  </button>
                </div>
              ) : (
                <div className="itunes-sharebox itunes-sharebox--empty">
                  <strong>Not Burned</strong>
                </div>
              )}
            </section>
          </aside>

          <section className="itunes-main">
            <div className="studio-addsongs">
              <div className="studio-addsongs__row">
                <label className="field">
                  <span>YouTube Links or Playlist</span>
                  <textarea
                    className="textarea textarea--compact"
                    placeholder={
                      "https://youtu.be/dQw4w9WgXcQ\nhttps://www.youtube.com/playlist?list=PL..."
                    }
                    value={importText}
                    onChange={(event) => setImportText(event.target.value)}
                  />
                </label>
                <button
                  className="button button--primary"
                  disabled={importBusy}
                  onClick={() => void importYouTubeLinks()}
                  type="button"
                >
                  {importBusy ? "Resolving..." : "Add Songs"}
                </button>
              </div>
              <p className="itunes-coverfield__hint">
                Paste public YouTube links (one per line) or a playlist URL (up to 50 tracks).
                Accepted formats: youtu.be, youtube.com/watch, youtube.com/playlist, youtube.com/shorts,
                and raw video IDs.
              </p>
            </div>

            {authMessage ? (
              <p className="status-message status-message--compact">
                {authMessage}
              </p>
            ) : null}
            {!authMessage && previewMessage ? (
              <p className="status-message status-message--compact">
                {previewMessage}
              </p>
            ) : null}

            <section
              className={`itunes-pane itunes-pane--primary itunes-pane--droppable ${playlistDropActive ? "itunes-pane--drop-active" : ""}`}
              ref={playlistPaneRef}
              onDragEnter={handlePlaylistDragEnter}
              onDragLeave={handlePlaylistDragLeave}
              onDragOver={handlePlaylistDragOver}
              onDrop={handlePlaylistDrop}
            >
              <div className="itunes-pane__header">
                <strong>{title || "Untitled Burner"}</strong>
                <span>
                  {tracks.length} songs • click a row to load it • drag to
                  reorder
                </span>
              </div>
              <div className="itunes-table itunes-table--tracks">
                <div className="itunes-table__head">
                  <span className="itunes-col itunes-col--index">#</span>
                  <span className="itunes-col itunes-col--name">Name</span>
                  <span className="itunes-col itunes-col--artist">Artist</span>
                  <span className="itunes-col itunes-col--controls">
                    Actions
                  </span>
                </div>
                <div
                  className={`itunes-table__body ${playlistDropActive ? "itunes-table__body--drop-active" : ""}`}
                >
                  {tracks.length === 0 ? (
                    <div className="itunes-emptyrow">
                      Paste YouTube song links in the sidebar to start building
                      the disc. Burner will resolve them and keep playback
                      in-app.
                    </div>
                  ) : null}
                  {tracks.map((track, index) => (
                    <Fragment key={track.providerTrackId}>
                      {playlistInsertIndex === index ? (
                        <div className="itunes-dropmarker" />
                      ) : null}
                      <div
                        className={`itunes-row itunes-row--draggable ${
                          previewTrackId === track.providerTrackId
                            ? "itunes-row--selected"
                            : ""
                        } ${draggedTrackId === track.providerTrackId ? "itunes-row--dragging" : ""}`}
                        draggable
                        onClick={() =>
                          void loadTrackPreview(track, { autoplay: false })
                        }
                        onDragEnd={handlePlaylistRowDragEnd}
                        onDragOver={(event) =>
                          handlePlaylistRowDragOver(event, index)
                        }
                        onDragStart={(event) =>
                          handlePlaylistRowDragStart(
                            event,
                            track.providerTrackId,
                          )
                        }
                        onDrop={(event) => handlePlaylistRowDrop(event, index)}
                      >
                        <span className="itunes-col itunes-col--index">
                          {index + 1}
                        </span>
                        <span className="itunes-col itunes-col--name">
                          {track.title}
                        </span>
                        <span className="itunes-col itunes-col--artist">
                          {track.artist}
                        </span>
                        <span className="itunes-col itunes-col--controls">
                          {(() => {
                            const pb = previewButtonState(track);
                            return (
                              <button
                                aria-label={`${pb.label} ${track.title ?? "track"}`}
                                className={`itunes-mini itunes-mini--icon ${previewTrackId === track.providerTrackId ? "itunes-mini--active" : ""}`}
                                disabled={!supportsInAppPreview(track)}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void toggleTrackPreview(track);
                                }}
                                type="button"
                              >
                                <span aria-hidden="true">{pb.icon}</span>
                              </button>
                            );
                          })()}
                          <button
                            aria-label={`Move ${track.title ?? "track"} up`}
                            className="itunes-mini itunes-mini--icon"
                            onClick={(event) => {
                              event.stopPropagation();
                              moveTrack(track.providerTrackId, -1);
                            }}
                            type="button"
                          >
                            <span aria-hidden="true">↑</span>
                          </button>
                          <button
                            aria-label={`Move ${track.title ?? "track"} down`}
                            className="itunes-mini itunes-mini--icon"
                            onClick={(event) => {
                              event.stopPropagation();
                              moveTrack(track.providerTrackId, 1);
                            }}
                            type="button"
                          >
                            <span aria-hidden="true">↓</span>
                          </button>
                          <button
                            aria-label={`Remove ${track.title ?? "track"} from playlist`}
                            className="itunes-mini itunes-mini--icon"
                            onClick={(event) => {
                              event.stopPropagation();
                              removeTrack(track.providerTrackId);
                            }}
                            type="button"
                          >
                            <span aria-hidden="true">×</span>
                          </button>
                        </span>
                      </div>
                    </Fragment>
                  ))}
                  {tracks.length > 0 &&
                  playlistInsertIndex === tracks.length ? (
                    <div className="itunes-dropmarker" />
                  ) : null}
                </div>
              </div>
            </section>

            <div
              className={`itunes-previewbar ${previewTrack ? "itunes-previewbar--visible" : ""}`}
            >
              <div className="itunes-previewbar__player">
                {showingEmbeddedPreview ? (
                  <iframe
                    allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                    className="itunes-embedplayer"
                    loading="lazy"
                    src={previewEmbedUrl ?? undefined}
                    title={
                      previewTrack
                        ? `${previewTrack.title} preview`
                        : "Track preview"
                    }
                  />
                ) : null}
                <div
                  ref={youtubePlayerHostRef}
                  className={`itunes-youtubeplayer ${previewTransport === "youtube" ? "" : "itunes-youtubeplayer--hidden"}`}
                />
                <audio
                  ref={previewAudioRef}
                  className={`itunes-audio ${previewTransport !== "audio" ? "itunes-audio--hidden" : ""}`}
                  preload="none"
                />
              </div>
              <div className="itunes-previewbar__copy">
                <strong>
                  {previewTrack ? previewTrack.title : "Preview Deck"}
                </strong>
                <span>
                  {previewTrack
                    ? `${previewTrack.artist}${previewTrack.albumName ? ` • ${previewTrack.albumName}` : ""}`
                    : "Select a track from the burner to load it in the player."}
                </span>
                <div className="itunes-toolbar__cluster itunes-previewbar__transport">
                  <button
                    aria-label="previous burner track"
                    className={`itunes-roundbutton ${!transportCanStepBack ? "itunes-roundbutton--disabled" : ""}`}
                    disabled={!transportCanStepBack || transportIsBusy}
                    onClick={() => void stepPreview(-1)}
                    type="button"
                  />
                  <button
                    aria-label={
                      previewState === "playing"
                        ? "pause preview"
                        : "play preview"
                    }
                    className={`itunes-roundbutton ${
                      previewState === "playing"
                        ? "itunes-roundbutton--pause"
                        : "itunes-roundbutton--play"
                    } ${transportIsBusy ? "itunes-roundbutton--disabled" : ""}`}
                    disabled={
                      transportIsBusy ||
                      (!previewTrack && tracks.length === 0)
                    }
                    onClick={() => void toggleTransportPlayback()}
                    type="button"
                  />
                  <button
                    aria-label="next burner track"
                    className={`itunes-roundbutton ${!transportCanStepForward ? "itunes-roundbutton--disabled" : ""}`}
                    disabled={!transportCanStepForward || transportIsBusy}
                    onClick={() => void stepPreview(1)}
                    type="button"
                  />
                </div>
              </div>
            </div>

            <footer className="itunes-statusbar">
              <span>
                <em>Tracks:</em> {tracks.length}
              </span>
              <span>
                <em>Loaded:</em>{" "}
                {previewTrack ? previewTrack.title : "None"}
              </span>
              <span>
                <em>Status:</em>{" "}
                {publishResult ? publishResult.shortCode : "Not Burned"}
              </span>
            </footer>
          </section>
        </div>
      </section>
    </main>
  );
}
