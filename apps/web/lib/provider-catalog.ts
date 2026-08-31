import type { BurnerDraft, ImportedTrack } from "@burner/core";

export const defaultDraft: BurnerDraft = {
  title: "",
  senderName: "",
  note: "",
  revealMode: "verified-or-timed",
  coverImageUrl: "",
  tracks: [],
};

export const demoTracks: ImportedTrack[] = [
  {
    provider: "youtubeMusic",
    providerTrackId: "dQw4w9WgXcQ",
    title: "Never Gonna Give You Up",
    artist: "Rick Astley",
    albumName: "Whenever You Need Somebody",
    albumArtUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    externalUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    handoffUri: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  },
  {
    provider: "youtubeMusic",
    providerTrackId: "3JWTaaS7LdU",
    title: "Take On Me",
    artist: "a-ha",
    albumName: "Hunting High and Low",
    albumArtUrl: "https://i.ytimg.com/vi/3JWTaaS7LdU/hqdefault.jpg",
    externalUrl: "https://www.youtube.com/watch?v=3JWTaaS7LdU",
    handoffUri: "https://www.youtube.com/watch?v=3JWTaaS7LdU",
  },
  {
    provider: "youtubeMusic",
    providerTrackId: "fJ9rUzIMcZQ",
    title: "Bohemian Rhapsody",
    artist: "Queen Official",
    albumName: "A Night at the Opera",
    albumArtUrl: "https://i.ytimg.com/vi/fJ9rUzIMcZQ/hqdefault.jpg",
    externalUrl: "https://www.youtube.com/watch?v=fJ9rUzIMcZQ",
    handoffUri: "https://www.youtube.com/watch?v=fJ9rUzIMcZQ",
  },
];

export const demoDraft: BurnerDraft = {
  title: "After School Voicemail",
  senderName: "Skye",
  note: "Track 2 was the one I almost left off. Keep it in.",
  revealMode: "verified-or-timed",
  coverImageUrl:
    "https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=1200&q=80",
  tracks: demoTracks,
};
