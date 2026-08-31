import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  extractYtInitialData,
  tracksFromYouTubeSearchData,
} from "./youtube-search";

describe("extractYtInitialData", () => {
  it("parses an assignment even when strings contain braces", () => {
    const payload = extractYtInitialData(
      `window.ytInitialData = {"ok":true,"text":"a { nested } brace","videoRenderer":{"videoId":"dQw4w9WgXcQ"}};`,
    );
    expect(payload).toEqual({
      ok: true,
      text: "a { nested } brace",
      videoRenderer: { videoId: "dQw4w9WgXcQ" },
    });
  });

  it("returns null when the blob is missing", () => {
    expect(extractYtInitialData("<html></html>")).toBeNull();
  });
});

describe("tracksFromYouTubeSearchData", () => {
  it("collects unique video renderers as imported tracks", () => {
    const tracks = tracksFromYouTubeSearchData({
      contents: {
        items: [
          {
            videoRenderer: {
              videoId: "dQw4w9WgXcQ",
              title: { runs: [{ text: "a-ha - Take On Me (Official Video)" }] },
              ownerText: { runs: [{ text: "a-ha" }] },
              thumbnail: {
                thumbnails: [{ url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg" }],
              },
            },
          },
          {
            videoRenderer: {
              videoId: "dQw4w9WgXcQ",
              title: { simpleText: "duplicate" },
            },
          },
        ],
      },
    });

    expect(tracks).toHaveLength(1);
    expect(tracks[0]).toMatchObject({
      provider: "youtubeMusic",
      providerTrackId: "dQw4w9WgXcQ",
      artist: "a-ha",
      externalUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    });
    expect(tracks[0].title.toLowerCase()).toContain("take on me");
  });
});
