import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type RouteBody = {
  burnerId?: unknown;
};

type BurnerRow = {
  id: string;
  title: string;
  sender_name: string;
  note: string | null;
  cover_image_url: string | null;
  reveal_mode: "timed" | "verified-or-timed";
};

type TrackRow = {
  position: number;
  encrypted_payload: string;
};

type ImportedTrack = {
  provider: string;
  providerTrackId: string;
  title: string;
  artist: string;
  albumName?: string;
  albumArtUrl?: string;
  durationMs?: number;
  previewUrl?: string;
  deepLink?: string;
  externalUrl?: string;
  handoffUri?: string;
};

const decoder = new TextDecoder();

function getSupabaseUrl() {
  const value = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!value) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not configured.");
  }
  return value;
}

function getSupabaseAnonKey() {
  const value = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!value) {
    throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is not configured.");
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

function getFieldEncryptionKey() {
  const value = process.env.FIELD_ENCRYPTION_KEY?.trim();
  if (!value) {
    throw new Error("FIELD_ENCRYPTION_KEY is not configured.");
  }
  return value;
}

function createServiceClient() {
  return createClient(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function createUserClient(authHeader: string) {
  return createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: authHeader } },
  });
}

function fromBase64(value: string) {
  return Uint8Array.from(Buffer.from(value, "base64"));
}

function fromHex(value: string) {
  if (value.length % 2 !== 0) {
    throw new Error("FIELD_ENCRYPTION_KEY hex value must have an even length.");
  }
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < value.length; index += 2) {
    bytes[index / 2] = Number.parseInt(value.slice(index, index + 2), 16);
  }
  return bytes;
}

function parseEncryptionKey(rawKey: string) {
  const trimmed = rawKey.trim();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return fromHex(trimmed);
  }
  return fromBase64(trimmed);
}

async function importAesKey() {
  return crypto.subtle.importKey(
    "raw",
    parseEncryptionKey(getFieldEncryptionKey()),
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );
}

async function decryptJson<T>(payload: string): Promise<T> {
  const key = await importAesKey();
  const parsed = JSON.parse(payload) as { ciphertext: string; iv: string };
  const clearBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(parsed.iv) },
    key,
    fromBase64(parsed.ciphertext),
  );
  return JSON.parse(decoder.decode(clearBuffer)) as T;
}

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Missing auth header" }, { status: 401 });
    }

    const userClient = createUserClient(authHeader);
    const serviceClient = createServiceClient();
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as RouteBody;
    const burnerId = typeof body.burnerId === "string" ? body.burnerId.trim() : "";
    if (!burnerId) {
      return NextResponse.json({ error: "burnerId is required" }, { status: 400 });
    }

    const { data: burner, error: burnerError } = await serviceClient
      .from("burners")
      .select("id, title, sender_name, note, cover_image_url, reveal_mode")
      .eq("id", burnerId)
      .eq("sender_id", user.id)
      .single<BurnerRow>();

    if (burnerError || !burner) {
      return NextResponse.json({ error: "Burner not found" }, { status: 404 });
    }

    const { data: trackRows, error: tracksError } = await serviceClient
      .from("burner_tracks")
      .select("position, encrypted_payload")
      .eq("burner_id", burner.id)
      .order("position", { ascending: true });

    if (tracksError) {
      throw tracksError;
    }

    const tracks: ImportedTrack[] = [];
    for (const row of (trackRows ?? []) as TrackRow[]) {
      const payload = await decryptJson<{ position: number; track: ImportedTrack }>(
        row.encrypted_payload,
      );
      tracks.push(payload.track);
    }

    return NextResponse.json({
      title: burner.title,
      senderName: burner.sender_name,
      note: burner.note ?? undefined,
      coverImageUrl: burner.cover_image_url ?? undefined,
      revealMode: burner.reveal_mode,
      tracks,
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Burner could not load that draft." },
      { status: 400 },
    );
  }
}
