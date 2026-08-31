import "server-only";

import type { ImportedTrack } from "@burner/core";

import {
  buildYouTubeThumbnailUrl,
  buildYouTubeWatchUrl,
  deriveYouTubeTrackIdentity,
} from "../youtube";

const MAX_RESULTS = 8;

type VideoRenderer = {
  videoId?: string;
  title?: { runs?: Array<{ text?: string }>; simpleText?: string };
  ownerText?: { runs?: Array<{ text?: string }> };
  longBylineText?: { runs?: Array<{ text?: string }> };
  thumbnail?: { thumbnails?: Array<{ url?: string }> };
};

export function extractYtInitialData(html: string) {
  const needles = ["ytInitialData =", "ytInitialData=", "ytInitialData"];
  let marker = -1;
  for (const needle of needles) {
    marker = html.indexOf(needle);
    if (marker >= 0) {
      break;
    }
  }
  if (marker < 0) {
    return null;
  }

  const start = html.indexOf("{", marker);
  if (start < 0) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < html.length; index += 1) {
    const char = html[index];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{") {
      depth += 1;
      continue;
    }
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, index + 1)) as unknown;
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}

function collectVideoRenderers(node: unknown, found: VideoRenderer[]) {
  if (found.length >= MAX_RESULTS * 3 || node == null) {
    return;
  }

  if (Array.isArray(node)) {
    for (const item of node) {
      collectVideoRenderers(item, found);
      if (found.length >= MAX_RESULTS * 3) return;
    }
    return;
  }

  if (typeof node !== "object") {
    return;
  }

  const record = node as Record<string, unknown>;
  if (record.videoRenderer && typeof record.videoRenderer === "object") {
    found.push(record.videoRenderer as VideoRenderer);
    return;
  }

  for (const value of Object.values(record)) {
    collectVideoRenderers(value, found);
    if (found.length >= MAX_RESULTS * 3) return;
  }
}

function rendererTitle(renderer: VideoRenderer) {
  return (
    renderer.title?.runs?.map((run) => run.text ?? "").join("") ||
    renderer.title?.simpleText ||
    ""
  ).trim();
}

function rendererArtist(renderer: VideoRenderer) {
  return (
    renderer.ownerText?.runs?.[0]?.text ||
    renderer.longBylineText?.runs?.[0]?.text ||
    ""
  ).trim();
}

export function tracksFromYouTubeSearchData(payload: unknown): ImportedTrack[] {
  const renderers: VideoRenderer[] = [];
  collectVideoRenderers(payload, renderers);

  const tracks: ImportedTrack[] = [];
  const seen = new Set<string>();

  for (const renderer of renderers) {
    const videoId = renderer.videoId?.trim();
    if (!videoId || seen.has(videoId)) {
      continue;
    }

    const identity = deriveYouTubeTrackIdentity({
      authorName: rendererArtist(renderer),
      title: rendererTitle(renderer),
    });
    if (!identity.title) {
      continue;
    }

    seen.add(videoId);
    const watchUrl = buildYouTubeWatchUrl(videoId);
    tracks.push({
      provider: "youtubeMusic",
      providerTrackId: videoId,
      title: identity.title,
      artist: identity.artist || "YouTube upload",
      albumArtUrl:
        renderer.thumbnail?.thumbnails?.at(-1)?.url ||
        buildYouTubeThumbnailUrl(videoId),
      externalUrl: watchUrl,
      handoffUri: watchUrl,
    });

    if (tracks.length >= MAX_RESULTS) {
      break;
    }
  }

  return tracks;
}

export async function searchYouTubeTracks(rawQuery: string): Promise<ImportedTrack[]> {
  const query = rawQuery.trim();
  if (query.length < 2) {
    return [];
  }

  const url = new URL("https://www.youtube.com/results");
  url.searchParams.set("search_query", query);
  url.searchParams.set("sp", "EgIQAQ==");

  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      "Accept-Language": "en-US,en;q=0.9",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    },
  });

  if (!response.ok) {
    throw new Error("Burner could not search YouTube right now. Paste a song link instead.");
  }

  const payload = extractYtInitialData(await response.text());
  if (!payload) {
    throw new Error("Burner could not read those search results. Paste a song link instead.");
  }

  return tracksFromYouTubeSearchData(payload);
}
