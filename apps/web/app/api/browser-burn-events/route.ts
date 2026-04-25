import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { createRateLimiter, readClientKey } from "../../../lib/rate-limit";

export const dynamic = "force-dynamic";

type BrowserBurnEventSource = "anonymous-browser" | "local-fallback";

const VALID_SOURCES = new Set<BrowserBurnEventSource>([
  "anonymous-browser",
  "local-fallback",
]);

const consumeToken = createRateLimiter({
  capacity: 10,
  refillPerSecond: 10 / 60,
});

function getSupabaseUrl() {
  const value = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!value) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not configured.");
  }
  return value;
}

function getSupabaseServiceRoleKey() {
  const value = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!value) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured.");
  }
  return value;
}

function createServiceClient() {
  return createClient(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function POST(request: Request) {
  const clientKey = readClientKey(request);
  if (!consumeToken(clientKey)) {
    return NextResponse.json(
      { error: "Too many burns counted from this connection. Try again soon." },
      { status: 429, headers: { "Retry-After": "30" } },
    );
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      source?: unknown;
      trackCount?: unknown;
      hasCover?: unknown;
    };

    const source =
      typeof body.source === "string" && VALID_SOURCES.has(body.source as BrowserBurnEventSource)
        ? (body.source as BrowserBurnEventSource)
        : null;
    const trackCount =
      typeof body.trackCount === "number" && Number.isInteger(body.trackCount)
        ? body.trackCount
        : null;

    if (!source) {
      return NextResponse.json({ error: "source is required" }, { status: 400 });
    }

    if (!trackCount || trackCount < 1 || trackCount > 30) {
      return NextResponse.json(
        { error: "trackCount must be between 1 and 30" },
        { status: 400 },
      );
    }

    const serviceClient = createServiceClient();
    const { error } = await serviceClient.from("browser_burn_events").insert({
      source,
      track_count: trackCount,
      has_cover: body.hasCover === true,
    });

    if (error) {
      throw error;
    }

    return NextResponse.json({ counted: true });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Burn count could not be recorded." },
      { status: 500 },
    );
  }
}
