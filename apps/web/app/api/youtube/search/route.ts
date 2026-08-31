import { NextResponse } from "next/server";

import type { ImportedTrack } from "@burner/core";

import { createRateLimiter, readClientKey } from "../../../../lib/rate-limit";
import { searchYouTubeTracks } from "../../../../lib/server/youtube-search";

export const dynamic = "force-dynamic";

const consumeToken = createRateLimiter({
  capacity: 16,
  refillPerSecond: 16 / 60,
});

export async function GET(request: Request) {
  const clientKey = readClientKey(request);
  if (!consumeToken(clientKey)) {
    return NextResponse.json(
      { error: "Too many searches. Slow down and try again." },
      { status: 429, headers: { "Retry-After": "30" } },
    );
  }

  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) {
    return NextResponse.json({ tracks: [] as ImportedTrack[] });
  }

  try {
    const tracks = await searchYouTubeTracks(query);
    return NextResponse.json({ tracks });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message, tracks: [] as ImportedTrack[] },
      { status: 400 },
    );
  }
}
