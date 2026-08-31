import { demoDraft } from "./provider-catalog";

export const DEMO_SHARE_SLUGS = new Set(["demo", "test"]);

export function demoShareMeta() {
  return {
    coverImageUrl: demoDraft.coverImageUrl || null,
    note: demoDraft.note ?? null,
    senderName: demoDraft.senderName,
    slug: "demo",
    title: demoDraft.title,
    totalTracks: demoDraft.tracks.length,
  };
}

export function sharePageTitle(input: { senderName: string; title: string }) {
  const sender = input.senderName.trim() || "Someone";
  const title = input.title.trim();
  return title ? `${sender} burned you a CD — ${title}` : `${sender} burned you a CD`;
}

export function sharePageDescription(input: { note?: string | null; title: string }) {
  const title = input.title.trim();
  const note = input.note?.trim();
  if (note) {
    return note;
  }
  if (title) {
    return `“${title}” — tracks stay hidden until they play. Just like a real burner CD.`;
  }
  return "Tracks stay hidden until they play. Just like a real burner CD.";
}
