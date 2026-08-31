import { describe, expect, it } from "vitest";

import {
  DEMO_SHARE_SLUGS,
  demoShareMeta,
  sharePageDescription,
  sharePageTitle,
} from "./share-meta";

describe("share meta", () => {
  it("treats demo and test slugs as local demo discs", () => {
    expect(DEMO_SHARE_SLUGS.has("demo")).toBe(true);
    expect(DEMO_SHARE_SLUGS.has("test")).toBe(true);
    expect(DEMO_SHARE_SLUGS.has("abc123")).toBe(false);
  });

  it("builds a sender-first share title without leaking tracks", () => {
    expect(sharePageTitle({ senderName: "Skye", title: "Late Night Burner" })).toBe(
      "Skye burned you a CD — Late Night Burner",
    );
    expect(sharePageTitle({ senderName: "  ", title: "" })).toBe(
      "Someone burned you a CD",
    );
  });

  it("prefers the sender note over a generic description", () => {
    expect(
      sharePageDescription({
        note: "Track 2 was the one I almost left off.",
        title: "Late Night Burner",
      }),
    ).toBe("Track 2 was the one I almost left off.");
    expect(sharePageDescription({ note: null, title: "Late Night Burner" })).toContain(
      "Late Night Burner",
    );
    expect(sharePageDescription({ note: "  ", title: "" })).toContain(
      "Tracks stay hidden",
    );
  });

  it("exposes demo cover and sender without a tracklist", () => {
    const meta = demoShareMeta();
    expect(meta.senderName).toBe("Skye");
    expect(meta.totalTracks).toBeGreaterThan(0);
    expect(meta).not.toHaveProperty("tracks");
  });
});
