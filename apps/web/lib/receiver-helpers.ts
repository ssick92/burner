import type { ImportedTrack, RevealedTrack } from "@burner/core";

import { normalizeYouTubeTrackMetadata } from "./youtube";

export function buildHiddenPlaceholder(position: number): RevealedTrack {
  return {
    position,
    title: "Hidden",
    artist: "Hidden until play starts",
    provider: "generic",
    playbackCapabilities: ["handoffPlayback"],
  };
}

export function buildRevealedTrackFromLocalTrack(
  track: ImportedTrack,
  position: number,
): RevealedTrack {
  return normalizeYouTubeTrackMetadata({
    position,
    title: track.title,
    artist: track.artist,
    albumArtUrl: track.albumArtUrl,
    albumName: track.albumName,
    provider: track.provider,
    providerUri: track.handoffUri ?? track.deepLink ?? track.externalUrl,
    previewUrl: track.previewUrl,
    playbackCapabilities: ["handoffPlayback"],
  });
}

export function formatTrackPosition(position: number) {
  return String(position).padStart(2, "0");
}

export function providerLabel(provider: RevealedTrack["provider"]) {
  if (provider === "youtubeMusic") {
    return "YouTube";
  }

  if (provider === "generic") {
    return "Link";
  }

  return provider.charAt(0).toUpperCase() + provider.slice(1);
}
