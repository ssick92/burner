import { createBurnerShell } from "@burner/core";
import type { RevealedTrack } from "@burner/core";

import { demoDraft } from "./provider-catalog";

export const draft = {
  ...demoDraft,
};

export const demoExchange = {
  sessionToken: "web-demo-session",
  burner: createBurnerShell({
    id: "web-demo-burner",
    slug: "demo",
    draft,
  }),
  firstTrack: {
    position: 1,
    title: draft.tracks[0].title,
    artist: draft.tracks[0].artist,
    albumArtUrl: draft.tracks[0].albumArtUrl,
    albumName: draft.tracks[0].albumName,
    provider: draft.tracks[0].provider,
    providerUri: draft.tracks[0].handoffUri,
    playbackCapabilities: ["handoffPlayback"],
  } satisfies RevealedTrack,
  localTracks: draft.tracks,
  isLocalShare: true as const,
};
