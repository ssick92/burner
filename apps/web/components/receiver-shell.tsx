"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  ImportedTrack,
  RevealedTrack,
  ShareExchangeResult,
} from "@burner/core";

import { completeTrackUnlock, startListenSession } from "../lib/burner-api";
import { getCanonicalBrowserOrigin } from "../lib/browser-origin";
import {
  buildHiddenPlaceholder,
  buildRevealedTrackFromLocalTrack,
  formatTrackPosition,
  providerLabel,
} from "../lib/receiver-helpers";
import { readReceiverState, writeReceiverState } from "../lib/receiver-state";
import { buildShareEmailHref, copyText } from "../lib/share-utils";
import { loadYouTubeIframeApi } from "../lib/youtube-player";
import {
  normalizeYouTubeTrackMetadata,
  parseYouTubeVideoId,
} from "../lib/youtube";
import { ReceiverIntroBanner } from "./receiver-intro-banner";
import { ShareDialog } from "./share-dialog";

type ReceiverExchange = ShareExchangeResult & {
  localTracks?: ImportedTrack[];
  isLocalShare?: boolean;
};

type PlayerTrackState = {
  autoplay: boolean;
  key: number;
  pendingReveal: boolean;
  position: number;
  track: RevealedTrack;
};

type ListenSessionStartResult = Awaited<ReturnType<typeof startListenSession>>;

type PlaybackMedium = "youtube" | "audio" | "none";

// Decide how a revealed track plays inside the receiver: YouTube tracks embed
// the iframe player, anything with a 30s preview (e.g. Apple Music) plays
// through the inline <audio> element, and everything else can only hand off to
// the provider link.
function getPlaybackMedium(
  track:
    | Pick<RevealedTrack, "providerUri" | "previewUrl">
    | null
    | undefined,
): PlaybackMedium {
  if (!track) {
    return "none";
  }

  if (parseYouTubeVideoId(track.providerUri ?? "")) {
    return "youtube";
  }

  if (track.previewUrl) {
    return "audio";
  }

  return "none";
}

function formatPlaybackTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "0:00";
  }

  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  const remainder = total % 60;
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

function TransportIcon({
  kind,
}: {
  kind: "next" | "pause" | "play" | "previous" | "spinner";
}) {
  if (kind === "previous") {
    return (
      <svg
        aria-hidden="true"
        className="receiver-transport__icon"
        viewBox="0 0 24 24"
      >
        <rect height="14" rx="1.2" width="2.6" x="4" y="5" />
        <path d="M18.4 6.4v11.2c0 .8-.88 1.26-1.53.82L9.26 13.7a1.96 1.96 0 010-3.4l7.6-4.72c.65-.44 1.53.02 1.53.82Z" />
      </svg>
    );
  }

  if (kind === "next") {
    return (
      <svg
        aria-hidden="true"
        className="receiver-transport__icon"
        viewBox="0 0 24 24"
      >
        <rect height="14" rx="1.2" width="2.6" x="17.4" y="5" />
        <path d="M5.6 17.6V6.4c0-.8.88-1.26 1.53-.82l7.6 4.72a1.96 1.96 0 010 3.4l-7.6 4.68c-.65.44-1.53-.02-1.53-.82Z" />
      </svg>
    );
  }

  if (kind === "pause") {
    return (
      <svg
        aria-hidden="true"
        className="receiver-transport__icon"
        viewBox="0 0 24 24"
      >
        <rect height="14" rx="1.4" width="4.2" x="5.2" y="5" />
        <rect height="14" rx="1.4" width="4.2" x="14.6" y="5" />
      </svg>
    );
  }

  if (kind === "spinner") {
    return (
      <svg
        aria-hidden="true"
        className="receiver-transport__icon receiver-transport__icon--spinner"
        viewBox="0 0 24 24"
      >
        <path
          d="M12 4.2a7.8 7.8 0 107.8 7.8"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="2.4"
        />
      </svg>
    );
  }

  return (
    <svg
      aria-hidden="true"
      className="receiver-transport__icon"
      viewBox="0 0 24 24"
    >
      <path d="M18.4 12 7.7 18.7c-.8.5-1.83-.08-1.83-1.02V6.32c0-.94 1.03-1.52 1.83-1.02L18.4 12Z" />
    </svg>
  );
}

function hydrateFromStorage(exchange: ReceiverExchange) {
  const serverRevealedTracks = (exchange.revealedTracks ?? []).map(
    normalizeYouTubeTrackMetadata,
  );
  const fallbackState = {
    activeTrackPosition:
      serverRevealedTracks.at(-1)?.position ?? exchange.nextLockedPosition ?? 1,
    revealedTracks: serverRevealedTracks,
    nextLockedPosition:
      exchange.nextLockedPosition ??
      (serverRevealedTracks.length < exchange.burner.totalTracks ? 1 : null),
    startedPositions: serverRevealedTracks.map((track) => track.position),
  };

  const persisted = readReceiverState(exchange.burner.id);
  if (!persisted) {
    return fallbackState;
  }

  const revealedTracks =
    persisted.revealedTracks.length >= serverRevealedTracks.length
      ? persisted.revealedTracks.map(normalizeYouTubeTrackMetadata)
      : serverRevealedTracks;
  const startedPositions = Array.from(
    new Set([
      ...serverRevealedTracks.map((track) => track.position),
      ...(persisted.startedPositions ?? []),
    ]),
  ).sort((left, right) => left - right);

  return {
    activeTrackPosition:
      persisted.activeTrackPosition <= exchange.burner.totalTracks
        ? persisted.activeTrackPosition
        : fallbackState.activeTrackPosition,
    revealedTracks,
    nextLockedPosition:
      revealedTracks.length >= exchange.burner.totalTracks
        ? null
        : (persisted.nextLockedPosition ?? fallbackState.nextLockedPosition),
    startedPositions,
  };
}

export function ReceiverShell({ exchange }: { exchange: ReceiverExchange }) {
  const hydrated = useMemo(() => hydrateFromStorage(exchange), [exchange]);
  const normalizedFirstTrack = useMemo(
    () => normalizeYouTubeTrackMetadata(exchange.firstTrack),
    [exchange.firstTrack],
  );
  const [revealedTracks, setRevealedTracks] = useState<RevealedTrack[]>(
    hydrated.revealedTracks,
  );
  const [nextLockedPosition, setNextLockedPosition] = useState<number | null>(
    hydrated.nextLockedPosition,
  );
  const [activeTrackPosition, setActiveTrackPosition] = useState(
    hydrated.activeTrackPosition,
  );
  const [startedPositions, setStartedPositions] = useState<number[]>(
    hydrated.startedPositions,
  );
  const [playerTrack, setPlayerTrack] = useState<PlayerTrackState | null>(
    () => {
      const initialTrack = hydrated.revealedTracks.find(
        (track) => track.position === hydrated.activeTrackPosition,
      );
      return initialTrack && getPlaybackMedium(initialTrack) !== "none"
        ? {
            autoplay: false,
            key: 0,
            pendingReveal: false,
            position: initialTrack.position,
            track: initialTrack,
          }
        : null;
    },
  );
  const [playerReady, setPlayerReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [requestState, setRequestState] = useState<
    "idle" | "starting" | "advancing"
  >("idle");
  const [statusMessage, setStatusMessage] = useState(
    exchange.burner.note ??
      "Burner only reveals the next song once playback actually begins.",
  );
  const [prefetchedTracks, setPrefetchedTracks] = useState<
    Record<number, RevealedTrack>
  >(() =>
    hydrated.startedPositions.includes(normalizedFirstTrack.position)
      ? {}
      : {
          [normalizedFirstTrack.position]: normalizedFirstTrack,
        },
  );
  const [justRevealedPosition, setJustRevealedPosition] = useState<
    number | null
  >(null);
  const [showIntro, setShowIntro] = useState(false);
  const [receiverShareDialogOpen, setReceiverShareDialogOpen] = useState(false);
  const [receiverShareFeedback, setReceiverShareFeedback] = useState<
    string | null
  >(null);
  const [receiverShareState, setReceiverShareState] = useState<
    "idle" | "copied"
  >("idle");

  const localTracks = exchange.localTracks ?? [];
  const playerHostRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playerTrackRef = useRef<PlayerTrackState | null>(playerTrack);
  const startedPositionsRef = useRef<number[]>(startedPositions);
  const finalizingPositionsRef = useRef<Set<number>>(new Set());
  const listenSessionPromisesRef = useRef<
    Map<number, Promise<ListenSessionStartResult>>
  >(new Map());
  const prevRevealedPositionsRef = useRef<Set<number>>(
    new Set(hydrated.revealedTracks.map((track) => track.position)),
  );
  const playNextTrackRef = useRef<() => void>(() => {});

  const revealedTrackMap = useMemo(
    () => new Map(revealedTracks.map((track) => [track.position, track])),
    [revealedTracks],
  );
  const activeRevealedTrack = revealedTrackMap.get(activeTrackPosition) ?? null;
  const activeTrack =
    activeRevealedTrack ?? buildHiddenPlaceholder(activeTrackPosition);
  const activeTrackStarted = startedPositions.includes(activeTrackPosition);
  const hiddenTrackCount = Math.max(
    exchange.burner.totalTracks - revealedTracks.length,
    0,
  );
  const loadedPlayerPosition = playerTrack?.position ?? null;
  const loadedPlayerTrack = playerTrack?.track ?? null;
  const loadedPlayerMedium = getPlaybackMedium(loadedPlayerTrack);
  const loadedPlayerPlayable = loadedPlayerMedium !== "none";
  const audioScrubMax = audioDuration > 0 ? audioDuration : 30;
  const audioProgressPct = Math.max(
    0,
    Math.min(100, (audioCurrentTime / audioScrubMax) * 100),
  );
  const loadedPlayerTrackStarted =
    loadedPlayerPosition !== null &&
    startedPositions.includes(loadedPlayerPosition);
  const activeTrackUsesDifferentLoadedPlayer = Boolean(
    loadedPlayerPosition !== null &&
    loadedPlayerPosition !== activeTrackPosition,
  );
  const activeProviderLink = activeRevealedTrack?.providerUri ?? null;
  const activeTrackCanPlayInline =
    getPlaybackMedium(activeRevealedTrack) !== "none";
  const activeTrackQueuedButHidden = Boolean(
    playerTrack?.pendingReveal &&
    playerTrack.position === activeTrackPosition &&
    !activeTrackStarted,
  );
  const showPlayerLoadingTransition = Boolean(
    !activeTrackStarted &&
    (requestState === "starting" || activeTrackQueuedButHidden),
  );
  const activeTrackQueuedAfterCurrent = Boolean(
    !activeTrackStarted &&
    activeTrackUsesDifferentLoadedPlayer &&
    loadedPlayerPlayable,
  );
  const currentVisibleTrack =
    activeTrackUsesDifferentLoadedPlayer &&
    loadedPlayerTrackStarted &&
    loadedPlayerTrack
      ? loadedPlayerTrack
      : activeRevealedTrack;
  const currentVisiblePosition =
    activeTrackUsesDifferentLoadedPlayer &&
    loadedPlayerPosition !== null &&
    loadedPlayerTrackStarted
      ? loadedPlayerPosition
      : activeTrackPosition;
  const currentVisibleTitle = currentVisibleTrack?.title ?? "Hidden";
  const currentVisibleArtist = currentVisibleTrack?.artist ?? null;
  const currentVisibleAlbumName = currentVisibleTrack?.albumName ?? null;
  const mixtapeArtwork = exchange.burner.coverImageUrl?.trim() ?? "";
  const currentVisibleProvider = currentVisibleTrack?.provider ?? null;
  const currentVisibleProviderLink =
    currentVisibleTrack?.providerUri ?? activeProviderLink;
  const currentTrackIsPlaying = Boolean(
    isPlaying &&
    loadedPlayerPosition !== null &&
    loadedPlayerPosition === activeTrackPosition &&
    activeTrackStarted,
  );
  const transportPlayLabel =
    requestState === "starting"
      ? "Loading"
      : requestState === "advancing"
        ? "Revealing"
        : currentTrackIsPlaying
          ? "Pause"
          : "Play";
  const transportPlayAriaLabel =
    requestState === "starting"
      ? `Loading Track ${formatTrackPosition(activeTrackPosition)}`
      : requestState === "advancing"
        ? `Revealing Track ${formatTrackPosition(activeTrackPosition)}`
        : currentTrackIsPlaying
          ? `Pause Track ${formatTrackPosition(activeTrackPosition)}`
          : `Play Track ${formatTrackPosition(activeTrackPosition)}`;
  const transportPlayIconKind =
    requestState === "starting" || requestState === "advancing"
      ? "spinner"
      : currentTrackIsPlaying
        ? "pause"
        : "play";
  const bannerEyebrow =
    activeTrackUsesDifferentLoadedPlayer && loadedPlayerTrackStarted
      ? `Now playing Track ${formatTrackPosition(currentVisiblePosition)}`
      : activeTrackStarted
        ? `Track ${formatTrackPosition(currentVisiblePosition)} revealed`
        : `Track ${formatTrackPosition(activeTrackPosition)} hidden`;
  const mixtapeDescription = exchange.burner.note?.trim()
    ? `Sender's Note: ${exchange.burner.note}`
    : hiddenTrackCount > 0
      ? `${revealedTracks.length}/${exchange.burner.totalTracks} tracks revealed so far. Hidden songs stay masked until they start.`
      : "Every song on this CD is unlocked now.";
  const playerPanelHeadline = currentVisibleTrack
    ? currentVisibleArtist
    : `Track ${formatTrackPosition(activeTrackPosition)} is still masked.`;
  const playerPanelDetail =
    activeTrackUsesDifferentLoadedPlayer &&
    loadedPlayerTrackStarted &&
    !activeTrackStarted
      ? `Track ${formatTrackPosition(activeTrackPosition)} is selected next. Press Play or Next to switch and reveal it.`
      : currentVisibleTrack
        ? [
            currentVisibleAlbumName ? `From ${currentVisibleAlbumName}` : null,
            currentVisibleProvider
              ? providerLabel(currentVisibleProvider)
              : null,
          ]
            .filter(Boolean)
            .join(" • ") || "Track metadata is revealed once playback starts."
        : "Press Play or Next to start this hidden track. Burner reveals it only after playback begins.";
  const shareUrl = typeof window === "undefined" ? "" : window.location.href;
  const receiverShareEmailHref = shareUrl
    ? buildShareEmailHref({
        senderName: exchange.burner.senderName,
        shareUrl,
        title: exchange.burner.title,
      })
    : "";

  const rememberPrefetchedTrack = useCallback((track: RevealedTrack) => {
    const normalizedTrack = normalizeYouTubeTrackMetadata(track);

    setPrefetchedTracks((current) => {
      const existingTrack = current[normalizedTrack.position];
      if (
        existingTrack &&
        existingTrack.providerUri === normalizedTrack.providerUri &&
        existingTrack.title === normalizedTrack.title &&
        existingTrack.artist === normalizedTrack.artist
      ) {
        return current;
      }

      return {
        ...current,
        [normalizedTrack.position]: normalizedTrack,
      };
    });

    return normalizedTrack;
  }, []);

  const forgetPrefetchedTrack = useCallback((position: number) => {
    setPrefetchedTracks((current) => {
      if (!(position in current)) {
        return current;
      }

      const nextTracks = { ...current };
      delete nextTracks[position];
      return nextTracks;
    });
  }, []);

  async function copyReceiverShareUrl() {
    if (!shareUrl) {
      setReceiverShareFeedback("Burner is still resolving the current link.");
      return;
    }

    try {
      await copyText(shareUrl);
      setReceiverShareState("copied");
      setReceiverShareFeedback(
        "Burner link copied. Share it with whoever should hear this next.",
      );
      window.setTimeout(() => setReceiverShareState("idle"), 2000);
    } catch {
      setReceiverShareFeedback(
        "Copy failed in this browser. Use the address bar if needed.",
      );
    }
  }

  function registerListenSessionPromise(
    position: number,
    promise: Promise<ListenSessionStartResult>,
  ) {
    listenSessionPromisesRef.current.set(position, promise);
    void promise.finally(() => {
      if (listenSessionPromisesRef.current.get(position) === promise) {
        listenSessionPromisesRef.current.delete(position);
      }
    });
    return promise;
  }

  const playlistRows = useMemo(
    () =>
      Array.from({ length: exchange.burner.totalTracks }, (_, index) => {
        const position = index + 1;
        const track = revealedTrackMap.get(position) ?? null;
        const revealed = Boolean(track);
        const active = position === activeTrackPosition;
        const canStart = nextLockedPosition === position;
        const stateLabel = revealed
          ? active
            ? "Loaded"
            : "Revealed"
          : canStart
            ? "Up next"
            : "Locked";
        const detail = track
          ? `${track.artist}${track.albumName ? ` • ${track.albumName}` : ""}`
          : canStart
            ? loadedPlayerPosition !== null && loadedPlayerPosition !== position
              ? `Selected next. Press Play when you're ready to switch from Track ${formatTrackPosition(loadedPlayerPosition)}.`
              : "Press play to start and reveal this song."
            : "Hidden until the earlier songs have started.";

        return {
          active,
          canPlayInline: getPlaybackMedium(track) !== "none",
          canStart,
          detail,
          position,
          revealed,
          stateLabel,
          title: track?.title ?? "Hidden",
          track,
        };
      }),
    [
      activeTrackPosition,
      exchange.burner.totalTracks,
      loadedPlayerPosition,
      nextLockedPosition,
      revealedTrackMap,
    ],
  );
  const accessiblePositions = useMemo(() => {
    const positions = new Set<number>([activeTrackPosition]);

    for (const row of playlistRows) {
      if (row.revealed || row.canStart) {
        positions.add(row.position);
      }
    }

    return Array.from(positions).sort((left, right) => left - right);
  }, [activeTrackPosition, playlistRows]);
  const previousSelectablePosition =
    accessiblePositions
      .filter((position) => position < activeTrackPosition)
      .at(-1) ?? null;
  const nextSelectablePosition =
    accessiblePositions.find((position) => position > activeTrackPosition) ??
    null;
  const previousTransportPosition =
    activeTrackQueuedAfterCurrent && loadedPlayerPosition !== null
      ? loadedPlayerPosition
      : previousSelectablePosition;
  const nextTransportPosition = activeTrackQueuedAfterCurrent
    ? activeTrackPosition
    : nextSelectablePosition;

  const revealTrack = useCallback(
    (track: RevealedTrack) => {
      const normalizedTrack = normalizeYouTubeTrackMetadata(track);
      forgetPrefetchedTrack(normalizedTrack.position);

      setRevealedTracks((current) => {
        if (
          current.some(
            (existingTrack) =>
              existingTrack.position === normalizedTrack.position,
          )
        ) {
          return current;
        }

        return [...current, normalizedTrack].sort(
          (left, right) => left.position - right.position,
        );
      });
      setStartedPositions((current) =>
        Array.from(new Set([...current, normalizedTrack.position])).sort(
          (left, right) => left - right,
        ),
      );
      setActiveTrackPosition(normalizedTrack.position);
    },
    [forgetPrefetchedTrack],
  );

  const finalizeTrackStart = useCallback(
    async (track: RevealedTrack) => {
      if (
        startedPositionsRef.current.includes(track.position) ||
        finalizingPositionsRef.current.has(track.position)
      ) {
        return;
      }

      finalizingPositionsRef.current.add(track.position);
      setRequestState("advancing");

      try {
        let startedTrack = normalizeYouTubeTrackMetadata(track);
        const listenSessionPromise = listenSessionPromisesRef.current.get(
          track.position,
        );

        if (listenSessionPromise) {
          const started = await listenSessionPromise;
          if (started.status === "blocked") {
            setStatusMessage("Burner lost its place. Refresh and try again.");
            return;
          }

          if (started.track) {
            startedTrack = rememberPrefetchedTrack(started.track);
          }
        }

        revealTrack(startedTrack);
        setPlayerTrack((current) =>
          current?.position === startedTrack.position
            ? { ...current, pendingReveal: false, track: startedTrack }
            : current,
        );

        if (exchange.isLocalShare) {
          const nextPosition =
            startedTrack.position < exchange.burner.totalTracks
              ? startedTrack.position + 1
              : null;
          setNextLockedPosition(nextPosition);
          setStatusMessage(
            nextPosition
              ? `Track ${formatTrackPosition(startedTrack.position)} started. Track ${formatTrackPosition(nextPosition)} is up next.`
              : "Last track started. The entire disc is visible now.",
          );
          return;
        }

        const unlocked = await completeTrackUnlock({
          burnerId: exchange.burner.id,
          position: startedTrack.position,
          elapsedSeconds: 0,
          observedCompletion: false,
          sessionToken: exchange.sessionToken,
        });

        if (unlocked.status === "blocked") {
          setStatusMessage("Burner lost its place. Refresh and try again.");
          return;
        }

        if (unlocked.nextTrack) {
          rememberPrefetchedTrack(unlocked.nextTrack);
        }

        setNextLockedPosition(unlocked.nextPosition ?? null);
        setStatusMessage(
          unlocked.nextPosition
            ? `Track ${formatTrackPosition(startedTrack.position)} started. Track ${formatTrackPosition(unlocked.nextPosition)} is unlocked next.`
            : "Last track started. The entire disc is visible now.",
        );
      } catch (error) {
        setStatusMessage((error as Error).message);
      } finally {
        finalizingPositionsRef.current.delete(track.position);
        setRequestState("idle");
      }
    },
    [
      exchange.burner.id,
      exchange.burner.totalTracks,
      exchange.isLocalShare,
      exchange.sessionToken,
      rememberPrefetchedTrack,
      revealTrack,
    ],
  );

  useEffect(() => {
    playerTrackRef.current = playerTrack;
  }, [playerTrack]);

  useEffect(() => {
    startedPositionsRef.current = startedPositions;
  }, [startedPositions]);

  useEffect(() => {
    writeReceiverState(exchange.burner.id, {
      activeTrackPosition,
      revealedTracks,
      nextLockedPosition,
      startedPositions,
    });
  }, [
    activeTrackPosition,
    exchange.burner.id,
    nextLockedPosition,
    revealedTracks,
    startedPositions,
  ]);

  useEffect(() => {
    const currentPositions = new Set(
      revealedTracks.map((track) => track.position),
    );
    const newlyRevealed: number[] = [];
    for (const position of currentPositions) {
      if (!prevRevealedPositionsRef.current.has(position)) {
        newlyRevealed.push(position);
      }
    }
    prevRevealedPositionsRef.current = currentPositions;

    if (newlyRevealed.length === 0) {
      return;
    }

    const latest = Math.max(...newlyRevealed);
    setJustRevealedPosition(latest);

    const timeout = window.setTimeout(() => {
      setJustRevealedPosition((current) =>
        current === latest ? null : current,
      );
    }, 2800);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [revealedTracks]);

  useEffect(() => {
    try {
      const dismissed = window.localStorage.getItem(
        `burner-receiver-intro-dismissed:${exchange.burner.id}`,
      );
      if (!dismissed) {
        setShowIntro(true);
      }
    } catch {
      setShowIntro(true);
    }
  }, [exchange.burner.id]);

  function dismissIntro() {
    setShowIntro(false);
    try {
      window.localStorage.setItem(
        `burner-receiver-intro-dismissed:${exchange.burner.id}`,
        "1",
      );
    } catch {
      // ignore storage errors
    }
  }

  useEffect(() => {
    if (!playerTrack) {
      setPlayerReady(false);
      setIsPlaying(false);
      return;
    }

    const videoId = parseYouTubeVideoId(playerTrack.track.providerUri ?? "");
    if (!videoId) {
      // Not a YouTube track — the inline <audio> effect owns playback state.
      return;
    }
    // A YouTube track is taking over the player: silence any audio preview.
    try {
      audioRef.current?.pause();
    } catch {
      // Ignore audio teardown races while switching mediums.
    }
    const resolvedVideoId = videoId;
    const nextPlayerTrack = playerTrack;

    let cancelled = false;

    async function ensurePlayer() {
      try {
        const YT = await loadYouTubeIframeApi();
        if (cancelled || !playerHostRef.current) {
          return;
        }

        const handleStateChange = (event: YouTubePlayerEvent) => {
          const currentTrack = playerTrackRef.current;
          if (!currentTrack) {
            return;
          }

          switch (event.data) {
            case 1:
              setIsPlaying(true);
              if (currentTrack.pendingReveal) {
                void finalizeTrackStart(currentTrack.track);
              }
              break;
            case 0:
              setIsPlaying(false);
              if (currentTrack.pendingReveal) {
                setRequestState("idle");
                setStatusMessage(
                  `Track ${formatTrackPosition(currentTrack.position)} stays hidden until playback actually starts.`,
                );
                break;
              }
              playNextTrackRef.current();
              break;
            case 2:
            case 5:
              setIsPlaying(false);
              if (currentTrack.pendingReveal) {
                setRequestState("idle");
                setStatusMessage(
                  `Track ${formatTrackPosition(currentTrack.position)} stays hidden until playback actually starts.`,
                );
              }
              break;
            default:
              break;
          }
        };

        if (!playerRef.current) {
          playerRef.current = new YT.Player(playerHostRef.current, {
            height: "100%",
            width: "100%",
            videoId: resolvedVideoId,
            playerVars: {
              autoplay: playerTrackRef.current?.autoplay ? 1 : 0,
              controls: 1,
              enablejsapi: 1,
              origin: getCanonicalBrowserOrigin(window.location.origin),
              playsinline: 1,
              rel: 0,
            },
            events: {
              onReady: (event) => {
                setPlayerReady(true);

                if (playerTrackRef.current?.autoplay) {
                  event.target.playVideo();
                }
              },
              onStateChange: handleStateChange,
              onError: (event) => {
                const currentTrack = playerTrackRef.current;

                setIsPlaying(false);
                setRequestState("idle");

                if (currentTrack?.pendingReveal && event.data === 5) {
                  setStatusMessage(
                    `Track ${formatTrackPosition(currentTrack.position)} is loaded. Press Play again to start it inside Burner.`,
                  );
                  return;
                }

                if (
                  currentTrack &&
                  (event.data === 101 || event.data === 150)
                ) {
                  setStatusMessage(
                    `Track ${formatTrackPosition(currentTrack.position)} will not play inline on YouTube. Use the provider link instead.`,
                  );
                  return;
                }

                setStatusMessage(
                  "YouTube did not start yet. The title stays hidden until playback actually begins.",
                );
              },
            },
          });

          return;
        }

        setPlayerReady(true);

        if (nextPlayerTrack.autoplay) {
          playerRef.current.loadVideoById(resolvedVideoId);
          return;
        }

        playerRef.current.cueVideoById(resolvedVideoId);
        setIsPlaying(false);
      } catch (error) {
        setPlayerReady(false);
        setIsPlaying(false);
        setRequestState("idle");
        setStatusMessage((error as Error).message);
      }
    }

    setPlayerReady(false);
    setIsPlaying(false);
    void ensurePlayer();

    return () => {
      cancelled = true;
    };
  }, [finalizeTrackStart, playerTrack]);

  useEffect(() => {
    if (!playerTrackRef.current) {
      return;
    }

    if (playerTrackRef.current.position === activeTrackPosition) {
      return;
    }

    try {
      playerRef.current?.pauseVideo();
    } catch {
      // Ignore YouTube API timing failures while switching rows.
    }

    try {
      audioRef.current?.pause();
    } catch {
      // Ignore audio teardown races while switching rows.
    }

    setIsPlaying(false);
  }, [activeTrackPosition]);

  useEffect(() => {
    return () => {
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, []);

  // Wire the inline <audio> element so Apple Music (and any preview-only) tracks
  // play through the same transport, reveal, and unlock flow as YouTube.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    const isActiveAudioTrack = () => {
      const current = playerTrackRef.current;
      return Boolean(current && getPlaybackMedium(current.track) === "audio");
    };

    const handlePlaying = () => {
      if (!isActiveAudioTrack()) {
        return;
      }

      const current = playerTrackRef.current;
      setIsPlaying(true);
      if (current?.pendingReveal) {
        void finalizeTrackStart(current.track);
      }
    };

    const handlePause = () => {
      if (!isActiveAudioTrack() || audio.ended) {
        return;
      }

      setIsPlaying(false);
    };

    const handleEnded = () => {
      if (!isActiveAudioTrack()) {
        return;
      }

      setIsPlaying(false);
      if (!playerTrackRef.current?.pendingReveal) {
        playNextTrackRef.current();
      }
    };

    const handleError = () => {
      if (!isActiveAudioTrack()) {
        return;
      }

      const current = playerTrackRef.current;
      setIsPlaying(false);
      setRequestState("idle");
      setStatusMessage(
        `Track ${formatTrackPosition(current?.position ?? activeTrackPosition)} could not start its preview. Use the provider link to listen.`,
      );
    };

    const handleTimeUpdate = () => {
      if (!isActiveAudioTrack()) {
        return;
      }

      setAudioCurrentTime(audio.currentTime);
    };

    const handleDurationChange = () => {
      if (!isActiveAudioTrack()) {
        return;
      }

      setAudioDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    };

    audio.addEventListener("playing", handlePlaying);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleDurationChange);
    audio.addEventListener("durationchange", handleDurationChange);

    return () => {
      audio.removeEventListener("playing", handlePlaying);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleDurationChange);
      audio.removeEventListener("durationchange", handleDurationChange);
    };
  }, [activeTrackPosition, finalizeTrackStart]);

  // Load and (optionally) start the preview whenever an audio track is queued.
  useEffect(() => {
    const audio = audioRef.current;
    if (!playerTrack || !audio) {
      return;
    }

    if (getPlaybackMedium(playerTrack.track) !== "audio") {
      return;
    }

    const previewUrl = playerTrack.track.previewUrl ?? "";
    if (!previewUrl) {
      return;
    }

    // Take the player away from any YouTube track.
    try {
      playerRef.current?.pauseVideo();
    } catch {
      // Ignore YouTube teardown races while switching mediums.
    }

    if (audio.src !== previewUrl) {
      audio.src = previewUrl;
    }
    audio.currentTime = 0;
    audio.load();
    setPlayerReady(true);
    setIsPlaying(false);
    setAudioCurrentTime(0);
    setAudioDuration(0);

    if (playerTrack.autoplay) {
      void audio.play().catch(() => {
        setRequestState("idle");
        setStatusMessage(
          `Press Play to start the preview for Track ${formatTrackPosition(playerTrack.position)}.`,
        );
      });
    }
  }, [playerTrack]);

  function queueTrackForPlayback(
    track: RevealedTrack,
    options: { autoplay: boolean; pendingReveal: boolean },
  ) {
    if (getPlaybackMedium(track) === "none") {
      setPlayerTrack((current) =>
        current?.position === track.position ? null : current,
      );
      return false;
    }

    setPlayerTrack((current) => ({
      autoplay: options.autoplay,
      key: (current?.key ?? 0) + 1,
      pendingReveal: options.pendingReveal,
      position: track.position,
      track,
    }));
    return true;
  }

  async function beginTrack(position = activeTrackPosition) {
    if (requestState !== "idle") {
      return;
    }

    if (
      !startedPositions.includes(position) &&
      nextLockedPosition !== null &&
      position !== nextLockedPosition
    ) {
      setStatusMessage(
        `Track ${formatTrackPosition(nextLockedPosition)} has to start before Track ${formatTrackPosition(position)}.`,
      );
      setActiveTrackPosition(nextLockedPosition);
      return;
    }

    if (startedPositions.includes(position)) {
      const existingTrack = revealedTrackMap.get(position) ?? null;
      setActiveTrackPosition(position);

      if (
        existingTrack &&
        queueTrackForPlayback(existingTrack, {
          autoplay: true,
          pendingReveal: false,
        })
      ) {
        setStatusMessage(
          `Track ${formatTrackPosition(position)} is playing inside Burner.`,
        );
        return;
      }

      setStatusMessage(
        `Track ${formatTrackPosition(position)} is already revealed. Open it from ${providerLabel(
          existingTrack?.provider ?? "generic",
        )} if inline playback is unavailable.`,
      );
      return;
    }

    setRequestState("starting");

    try {
      let startedTrack: RevealedTrack | null = null;

      if (exchange.isLocalShare) {
        const localTrack = localTracks[position - 1];
        if (!localTrack) {
          throw new Error("That hidden track could not be loaded.");
        }

        startedTrack = buildRevealedTrackFromLocalTrack(localTrack, position);
      } else {
        const prefetchedTrack =
          prefetchedTracks[position] ??
          (normalizedFirstTrack.position === position
            ? normalizedFirstTrack
            : null);

        if (prefetchedTrack) {
          startedTrack = prefetchedTrack;

          const listenSessionPromise = registerListenSessionPromise(
            position,
            startListenSession({
              burnerId: exchange.burner.id,
              position,
              provider: prefetchedTrack.provider,
              sessionToken: exchange.sessionToken,
            }),
          );

          void listenSessionPromise
            .then((started) => {
              if (started.status === "blocked") {
                try {
                  playerRef.current?.pauseVideo();
                } catch {
                  // Ignore YouTube timing issues while cancelling playback.
                }

                setIsPlaying(false);
                setRequestState("idle");
                setStatusMessage(
                  "That track is not ready yet. Start the earlier hidden track first.",
                );
                return;
              }

              if (started.track) {
                const normalizedStartedTrack = rememberPrefetchedTrack(
                  started.track,
                );
                setPlayerTrack((current) =>
                  current?.position === position
                    ? { ...current, track: normalizedStartedTrack }
                    : current,
                );
              }
            })
            .catch((error) => {
              setRequestState("idle");
              setStatusMessage((error as Error).message);
            });
        } else {
          const started = await startListenSession({
            burnerId: exchange.burner.id,
            position,
            provider:
              activeRevealedTrack?.provider ?? exchange.firstTrack.provider,
            sessionToken: exchange.sessionToken,
          });

          if (started.status === "blocked") {
            setStatusMessage(
              "That track is not ready yet. Start the earlier hidden track first.",
            );
            setRequestState("idle");
            return;
          }

          if (!started.track) {
            throw new Error("Burner could not load that track.");
          }

          startedTrack = rememberPrefetchedTrack(started.track);
        }
      }

      if (!startedTrack) {
        throw new Error("Burner could not load that track.");
      }

      setActiveTrackPosition(position);

      const queued = queueTrackForPlayback(startedTrack, {
        autoplay: true,
        pendingReveal: true,
      });
      if (!queued) {
        // Providers without an inline browser player (e.g. Apple Music) can't
        // embed in the receiver yet. Reveal the track and unlock the next one
        // so the playlist never stalls, then point the listener at the
        // provider link to actually listen.
        await finalizeTrackStart(startedTrack);
        setStatusMessage(
          `Track ${formatTrackPosition(position)} is revealed. Open it on ${providerLabel(startedTrack.provider)} to listen — inline playback isn't available for this source yet.`,
        );
        return;
      }

      setRequestState("idle");
      setStatusMessage(
        `Track ${formatTrackPosition(position)} is armed. Burner only reveals it once playback starts.`,
      );
    } catch (error) {
      setRequestState("idle");
      setStatusMessage((error as Error).message);
    }
  }

  function viewRevealedTrack(position: number) {
    const selectedTrack = revealedTrackMap.get(position) ?? null;
    setActiveTrackPosition(position);

    if (selectedTrack) {
      if (
        queueTrackForPlayback(selectedTrack, {
          autoplay: false,
          pendingReveal: false,
        })
      ) {
        setStatusMessage(
          `Track ${formatTrackPosition(position)} is loaded in the inline player.`,
        );
        return;
      }

      setStatusMessage(
        `Track ${formatTrackPosition(position)} is revealed, but it still needs ${providerLabel(selectedTrack.provider)} for playback.`,
      );
      return;
    }

    if (nextLockedPosition === position) {
      setStatusMessage(
        loadedPlayerPosition !== null && loadedPlayerPosition !== position
          ? `Track ${formatTrackPosition(position)} is selected next. Press Play when you're ready to switch from Track ${formatTrackPosition(loadedPlayerPosition)}.`
          : `Track ${formatTrackPosition(position)} is next in line. Press play to start it and reveal the title.`,
      );
      return;
    }

    setStatusMessage("That song is still locked behind the tracks above it.");
  }

  function playActiveTrackInline() {
    if (!activeTrackStarted) {
      if (
        playerTrack?.pendingReveal &&
        playerTrack.position === activeTrackPosition
      ) {
        if (getPlaybackMedium(playerTrack.track) === "audio") {
          const audio = audioRef.current;
          if (!audio) {
            setStatusMessage(
              `Track ${formatTrackPosition(activeTrackPosition)} is still loading in the player. Press Play again in a moment.`,
            );
            return;
          }

          setRequestState("starting");
          setStatusMessage(
            `Starting Track ${formatTrackPosition(activeTrackPosition)}. Burner will reveal it as soon as it plays.`,
          );
          void audio.play().catch(() => {
            setRequestState("idle");
            setStatusMessage(
              "The browser blocked playback. Press Play again after interacting with the page.",
            );
          });
          return;
        }

        if (!playerRef.current || !playerReady) {
          setStatusMessage(
            `Track ${formatTrackPosition(activeTrackPosition)} is still loading in the player. Press Play again in a moment.`,
          );
          return;
        }

        setRequestState("starting");
        setStatusMessage(
          `Starting Track ${formatTrackPosition(activeTrackPosition)}. Burner will reveal it as soon as it plays.`,
        );
        playerRef.current.playVideo();
        return;
      }

      if (
        loadedPlayerPosition !== null &&
        loadedPlayerPosition !== activeTrackPosition &&
        loadedPlayerTrackStarted
      ) {
        setStatusMessage(
          `Switching from Track ${formatTrackPosition(loadedPlayerPosition)} to Track ${formatTrackPosition(activeTrackPosition)}. Burner will reveal it as soon as playback starts.`,
        );
      }

      void beginTrack();
      return;
    }

    if (!activeRevealedTrack || !activeTrackCanPlayInline) {
      setStatusMessage(
        `Track ${formatTrackPosition(activeTrackPosition)} is revealed, but inline playback is unavailable for this source.`,
      );
      return;
    }

    if (getPlaybackMedium(activeRevealedTrack) === "audio") {
      const audio = audioRef.current;
      if (!audio || playerTrackRef.current?.position !== activeTrackPosition) {
        if (
          queueTrackForPlayback(activeRevealedTrack, {
            autoplay: true,
            pendingReveal: false,
          })
        ) {
          setStatusMessage(
            `Track ${formatTrackPosition(activeTrackPosition)} is loading inside Burner.`,
          );
        }
        return;
      }

      if (!audio.paused) {
        audio.pause();
        setIsPlaying(false);
        setStatusMessage(
          `Track ${formatTrackPosition(activeTrackPosition)} is paused.`,
        );
        return;
      }

      void audio.play().catch(() => {
        setStatusMessage(
          "The browser blocked playback. Press Play again after interacting with the page.",
        );
      });
      setStatusMessage(
        `Track ${formatTrackPosition(activeTrackPosition)} preview is playing inside Burner.`,
      );
      return;
    }

    if (
      !playerRef.current ||
      !playerReady ||
      playerTrackRef.current?.position !== activeTrackPosition
    ) {
      if (
        queueTrackForPlayback(activeRevealedTrack, {
          autoplay: true,
          pendingReveal: false,
        })
      ) {
        setStatusMessage(
          `Track ${formatTrackPosition(activeTrackPosition)} is loading inside Burner.`,
        );
      }
      return;
    }

    const playerState = playerRef.current.getPlayerState();
    if (playerState === 1 || playerState === 3) {
      playerRef.current.pauseVideo();
      setIsPlaying(false);
      setStatusMessage(
        `Track ${formatTrackPosition(activeTrackPosition)} is paused.`,
      );
      return;
    }

    playerRef.current.playVideo();
    setStatusMessage(
      `Track ${formatTrackPosition(activeTrackPosition)} is playing inside Burner.`,
    );
  }

  function focusNextLockedTrack() {
    if (!nextLockedPosition) {
      return;
    }

    setActiveTrackPosition(nextLockedPosition);
    setStatusMessage(
      loadedPlayerPosition !== null &&
        loadedPlayerPosition !== nextLockedPosition
        ? `Track ${formatTrackPosition(nextLockedPosition)} is selected next. Press Play when you're ready to switch from Track ${formatTrackPosition(loadedPlayerPosition)}.`
        : `Track ${formatTrackPosition(nextLockedPosition)} is queued next. Press play to find out what it is.`,
    );
  }

  function playTrackPosition(position: number) {
    setActiveTrackPosition(position);
    void beginTrack(position);
  }

  function playPreviousTrack() {
    if (previousTransportPosition === null) {
      return;
    }

    playTrackPosition(previousTransportPosition);
  }

  function playNextTrack() {
    if (nextTransportPosition === null) {
      return;
    }

    playTrackPosition(nextTransportPosition);
  }

  playNextTrackRef.current = playNextTrack;

  return (
    <section className="receiver-shell">
      <section className="itunes-window receiver-window">
        <header className="itunes-titlebar">
          <div aria-hidden="true" className="itunes-traffic">
            <span />
            <span />
            <span />
          </div>
          <strong className="itunes-title">{exchange.burner.title}</strong>
          <div className="itunes-search-shell" />
        </header>

        <section className="receiver-stage">
          {showIntro && !receiverShareDialogOpen ? (
            <ReceiverIntroBanner
              onDismiss={dismissIntro}
              senderName={exchange.burner.senderName}
              title={exchange.burner.title}
            />
          ) : null}

          <header className="receiver-banner">
            <div
              aria-hidden="true"
              className="receiver-banner__wash"
              style={
                mixtapeArtwork
                  ? {
                      backgroundImage: `linear-gradient(135deg, rgba(248, 251, 255, 0.96), rgba(218, 226, 238, 0.84)), url("${mixtapeArtwork}")`,
                    }
                  : undefined
              }
            />
            <div className="receiver-banner__art">
              {mixtapeArtwork ? (
                <div
                  className={[
                    "receiver-banner__artimage",
                    isPlaying ? "receiver-banner__artimage--playing" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  style={{ backgroundImage: `url("${mixtapeArtwork}")` }}
                />
              ) : (
                <div className="receiver-banner__artfallback">
                  {exchange.burner.title}
                </div>
              )}
            </div>

            <div className="receiver-banner__copy">
              <span className="receiver-banner__eyebrow">Burner CD</span>
              <h1>{exchange.burner.title}</h1>
              <p className="receiver-banner__headline">
                Burned by {exchange.burner.senderName}
              </p>
              <p className="receiver-banner__detail">{mixtapeDescription}</p>
            </div>

            <div className="receiver-banner__stats">
              <span className="receiver-toolbar__item">
                {revealedTracks.length}/{exchange.burner.totalTracks} revealed
              </span>
              <span className="receiver-toolbar__item">
                {hiddenTrackCount > 0
                  ? `${hiddenTrackCount} hidden`
                  : "Disc unlocked"}
              </span>
            </div>

            <button
              className="receiver-banner__share"
              onClick={() => {
                dismissIntro();
                setReceiverShareDialogOpen(true);
                setReceiverShareFeedback(null);
              }}
              type="button"
            >
              Share with others
            </button>
          </header>

          <section className="receiver-media">
            <div className="receiver-playerpanel">
              <div className="receiver-playerpanel__header">
                <div className="receiver-playerpanel__copy">
                  <span className="receiver-playerpanel__eyebrow">
                    {bannerEyebrow}
                  </span>
                  <h2>{currentVisibleTitle}</h2>
                  <p className="receiver-playerpanel__headline">
                    {playerPanelHeadline}
                  </p>
                  <p className="receiver-playerpanel__detail">
                    {playerPanelDetail}
                  </p>
                  {activeTrackQueuedAfterCurrent ? (
                    <span className="receiver-previewbar__queue">
                      Up next: Track {formatTrackPosition(activeTrackPosition)}.
                      Press Play when you&apos;re ready to switch.
                    </span>
                  ) : null}
                </div>
                <div className="receiver-transport">
                  <div className="receiver-transport__controls">
                    <button
                      className="receiver-transport__button"
                      aria-label={
                        previousTransportPosition === null
                          ? "No previous revealed track"
                          : `Previous track ${formatTrackPosition(previousTransportPosition)}`
                      }
                      disabled={
                        previousTransportPosition === null ||
                        requestState !== "idle"
                      }
                      onClick={playPreviousTrack}
                      title="Previous track"
                      type="button"
                    >
                      <TransportIcon kind="previous" />
                    </button>
                    <button
                      className="receiver-transport__button receiver-transport__button--primary"
                      aria-label={transportPlayAriaLabel}
                      disabled={requestState === "advancing"}
                      onClick={playActiveTrackInline}
                      title={transportPlayLabel}
                      type="button"
                    >
                      <TransportIcon kind={transportPlayIconKind} />
                    </button>
                    <button
                      className="receiver-transport__button"
                      aria-label={
                        nextTransportPosition === null
                          ? "No next available track"
                          : `Next track ${formatTrackPosition(nextTransportPosition)}`
                      }
                      disabled={
                        nextTransportPosition === null ||
                        requestState !== "idle"
                      }
                      onClick={playNextTrack}
                      title="Next track"
                      type="button"
                    >
                      <TransportIcon kind="next" />
                    </button>
                  </div>
                </div>
              </div>
              <span
                aria-live="polite"
                className="receiver-visually-hidden"
                role="status"
              >
                {statusMessage}
              </span>
              <div
                className={[
                  "receiver-playerframe",
                  "receiver-playerframe--stage",
                  loadedPlayerMedium === "audio"
                    ? "receiver-playerframe--audio"
                    : "",
                  showPlayerLoadingTransition
                    ? "receiver-playerframe--loading"
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <div
                  ref={playerHostRef}
                  className={`itunes-youtubeplayer ${loadedPlayerMedium === "youtube" ? "" : "itunes-youtubeplayer--hidden"}`}
                />
                <audio
                  ref={audioRef}
                  className="receiver-audio"
                  preload="none"
                />
                {loadedPlayerMedium === "audio" ? (
                  <div className="receiver-audioplayer">
                    <div
                      aria-hidden="true"
                      className={[
                        "receiver-audioplayer__art",
                        isPlaying ? "receiver-audioplayer__art--playing" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      style={
                        currentVisibleTrack?.albumArtUrl
                          ? {
                              backgroundImage: `url("${currentVisibleTrack.albumArtUrl}")`,
                            }
                          : undefined
                      }
                    >
                      {currentVisibleTrack?.albumArtUrl ? null : (
                        <span className="receiver-audioplayer__artfallback">
                          ♪
                        </span>
                      )}
                    </div>
                    <div className="receiver-audioplayer__body">
                      <div className="receiver-audioplayer__meta">
                        <strong>{currentVisibleTitle}</strong>
                        <span>
                          {[
                            currentVisibleArtist,
                            currentVisibleProvider
                              ? providerLabel(currentVisibleProvider)
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" • ")}
                        </span>
                      </div>
                      <input
                        aria-label={`Seek preview for Track ${formatTrackPosition(activeTrackPosition)}`}
                        className="receiver-audioplayer__scrubber"
                        max={audioScrubMax}
                        min={0}
                        onChange={(event) => {
                          const audio = audioRef.current;
                          const nextTime = Number(event.target.value);
                          if (audio) {
                            audio.currentTime = nextTime;
                          }
                          setAudioCurrentTime(nextTime);
                        }}
                        step={0.1}
                        style={
                          {
                            "--audio-progress": `${audioProgressPct}%`,
                          } as CSSProperties
                        }
                        type="range"
                        value={Math.min(audioCurrentTime, audioScrubMax)}
                      />
                      <div className="receiver-audioplayer__times">
                        <span>{formatPlaybackTime(audioCurrentTime)}</span>
                        <span>{formatPlaybackTime(audioScrubMax)}</span>
                      </div>
                      <p className="receiver-audioplayer__hint">
                        {currentVisibleProviderLink
                          ? `30-second preview — open on ${
                              currentVisibleProvider
                                ? providerLabel(currentVisibleProvider)
                                : "the provider"
                            } below for the full song.`
                          : "30-second preview."}
                      </p>
                    </div>
                  </div>
                ) : null}
                {loadedPlayerMedium === "none" ? (
                  <div className="receiver-playerplaceholder">
                    <strong>
                      {activeTrackStarted
                        ? "Inline playback unavailable for this track."
                        : "Press Play or Next to start the next hidden track."}
                    </strong>
                    <span>
                      {activeTrackStarted
                        ? "Use the provider link if this source will not embed."
                        : "Burner keeps the title hidden until playback actually begins."}
                    </span>
                  </div>
                ) : null}
                {showPlayerLoadingTransition ? (
                  <div className="receiver-playerloading">
                    <div className="receiver-playerloading__content">
                      <span className="receiver-playerloading__eyebrow">
                        Loading next reveal
                      </span>
                      <strong>
                        Cueing Track {formatTrackPosition(activeTrackPosition)}
                      </strong>
                      <span className="receiver-playerloading__detail">
                        Burner will reveal the title the moment playback
                        actually starts.
                      </span>
                      <span
                        aria-hidden="true"
                        className="receiver-playerloading__bars"
                      >
                        <span />
                        <span />
                        <span />
                      </span>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="receiver-playerpanel__meta">
                {nextLockedPosition &&
                nextLockedPosition !== activeTrackPosition ? (
                  <button
                    className="receiver-transport__link"
                    disabled={requestState !== "idle"}
                    onClick={focusNextLockedTrack}
                    type="button"
                  >
                    Select Track {formatTrackPosition(nextLockedPosition)}
                  </button>
                ) : null}
                {currentVisibleProviderLink && currentVisibleProvider ? (
                  <a
                    className="receiver-transport__link"
                    href={currentVisibleProviderLink}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Open on {providerLabel(currentVisibleProvider)}
                  </a>
                ) : null}
              </div>
            </div>
          </section>

          <section className="receiver-tracksection">
            <div className="receiver-tracksection__header">
              <strong>Playlist</strong>
              <span>
                {hiddenTrackCount > 0
                  ? "Every track stays in order here. Hidden songs stay masked until they start."
                  : "Every track is revealed, but the full running order still stays in view."}
              </span>
            </div>

            <div className="receiver-trackstack">
              {playlistRows.map((row) => {
                const isPlayingRow =
                  row.position === loadedPlayerPosition && isPlaying;
                const isLoadedRow =
                  row.position === currentVisiblePosition && row.revealed;
                const isJustRevealed = justRevealedPosition === row.position;

                return (
                  <button
                    className={[
                      "receiver-trackcard",
                      row.revealed ? "receiver-trackcard--revealed" : "",
                      row.active ? "receiver-trackcard--selected" : "",
                      row.canStart ? "receiver-trackcard--next" : "",
                      !row.revealed && !row.canStart
                        ? "receiver-trackcard--locked"
                        : "",
                      isPlayingRow ? "receiver-trackcard--playing" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    disabled={!row.revealed && !row.canStart}
                    key={row.position}
                    onClick={() => {
                      if (row.revealed || row.canStart) {
                        viewRevealedTrack(row.position);
                      }
                    }}
                    type="button"
                  >
                    <span className="receiver-trackcard__index">
                      {formatTrackPosition(row.position)}
                    </span>
                    <span className="receiver-trackcard__copy">
                      <strong>{row.title}</strong>
                      <span>{row.detail}</span>
                    </span>
                    <span className="receiver-trackcard__state">
                      {isPlayingRow
                        ? "Playing"
                        : row.active && row.canStart
                          ? "Selected"
                          : row.active && row.revealed
                            ? "Selected"
                            : isLoadedRow
                              ? "Loaded"
                              : row.canStart
                                ? "Ready"
                                : row.revealed
                                  ? "Revealed"
                                  : "Locked"}
                      {isJustRevealed ? (
                        <span
                          aria-live="polite"
                          className="itunes-row__unlock-badge"
                        >
                          Just unlocked
                        </span>
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <footer className="itunes-statusbar receiver-statusbar">
            <span>
              {hiddenTrackCount > 0
                ? `${hiddenTrackCount} ${hiddenTrackCount === 1 ? "track" : "tracks"} still hidden`
                : "Disc fully revealed"}
            </span>
            <span>
              {activeTrackUsesDifferentLoadedPlayer &&
              loadedPlayerTrackStarted &&
              loadedPlayerTrack
                ? `Playing ${loadedPlayerTrack.title}`
                : activeTrackStarted
                  ? `Loaded ${activeTrack.title}`
                  : `Waiting on Track ${formatTrackPosition(activeTrackPosition)}`}
            </span>
            <span>
              {nextLockedPosition
                ? `Next reveal ${formatTrackPosition(nextLockedPosition)}`
                : "No locks left"}
            </span>
          </footer>
        </section>
      </section>

      {receiverShareDialogOpen ? (
        <ShareDialog
          copied={receiverShareState === "copied"}
          emailHref={receiverShareEmailHref}
          feedback={receiverShareFeedback}
          itemCountLabel={`${exchange.burner.totalTracks} track${exchange.burner.totalTracks === 1 ? "" : "s"}`}
          onClose={() => {
            setReceiverShareDialogOpen(false);
            setReceiverShareFeedback(null);
            setReceiverShareState("idle");
          }}
          onCopy={() => void copyReceiverShareUrl()}
          shareUrl={shareUrl}
          title={exchange.burner.title}
        />
      ) : null}
    </section>
  );
}
