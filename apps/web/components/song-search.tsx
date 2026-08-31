"use client";

import { useEffect, useRef, useState } from "react";

import type { ImportedTrack } from "@burner/core";

type SongSearchProps = {
  disabled?: boolean;
  onAddTrack: (track: ImportedTrack) => void;
};

type SearchResponse = {
  error?: string;
  tracks?: ImportedTrack[];
};

export function SongSearch({ disabled, onAddTrack }: SongSearchProps) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ImportedTrack[]>([]);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setError(null);
      setBusy(false);
      return;
    }

    const handle = window.setTimeout(async () => {
      const requestId = ++requestIdRef.current;
      setBusy(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/youtube/search?q=${encodeURIComponent(trimmed)}`,
        );
        const payload = (await response.json()) as SearchResponse;
        if (requestId !== requestIdRef.current) {
          return;
        }
        if (!response.ok) {
          throw new Error(payload.error || "Search failed.");
        }
        setResults(payload.tracks ?? []);
        if ((payload.tracks ?? []).length === 0) {
          setError("No songs found. Try a title and artist, or paste a link below.");
        }
      } catch (nextError) {
        if (requestId !== requestIdRef.current) {
          return;
        }
        setResults([]);
        setError((nextError as Error).message);
      } finally {
        if (requestId === requestIdRef.current) {
          setBusy(false);
        }
      }
    }, 280);

    return () => window.clearTimeout(handle);
  }, [query]);

  return (
    <div className="song-search">
      <label className="field">
        <span>Search songs</span>
        <input
          className="input"
          disabled={disabled}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Song or artist — e.g. Take On Me a-ha"
          type="search"
          value={query}
        />
      </label>
      {busy ? <p className="itunes-coverfield__hint">Searching YouTube…</p> : null}
      {error ? <p className="status-message status-message--compact">{error}</p> : null}
      {results.length > 0 ? (
        <ul className="song-search__results">
          {results.map((track) => (
            <li key={track.providerTrackId}>
              <button
                className="song-search__result"
                disabled={disabled}
                onClick={() => {
                  onAddTrack(track);
                  setQuery("");
                  setResults([]);
                  setError(null);
                }}
                type="button"
              >
                {track.albumArtUrl ? (
                  <span
                    aria-hidden="true"
                    className="song-search__art"
                    style={{ backgroundImage: `url("${track.albumArtUrl}")` }}
                  />
                ) : (
                  <span aria-hidden="true" className="song-search__art" />
                )}
                <span className="song-search__copy">
                  <strong>{track.title}</strong>
                  <span>{track.artist}</span>
                </span>
                <span className="song-search__add">Add</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
