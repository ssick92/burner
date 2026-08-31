import { ImageResponse } from "next/og";

import { burnerTagline } from "../lib/brand";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Burner — send someone a CD they can't skip ahead on.";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "linear-gradient(180deg, #e8eef6 0%, #bec8d6 100%)",
          fontFamily: "Avenir Next, Helvetica Neue, sans-serif",
          color: "#171b22",
          padding: 72,
          gap: 48,
          alignItems: "center",
        }}
      >
        <div
          style={{
            width: 260,
            height: 260,
            borderRadius: "50%",
            background:
              "radial-gradient(circle at 50% 50%, #f4f7fb 0 16%, #1a1c22 17% 20%, #4a5364 38%, #111318 72%, #000 100%)",
            boxShadow: "0 24px 48px rgba(16,22,34,0.28)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              background: "#cfd6e0",
              boxShadow: "inset 0 0 0 3px #8b93a0",
            }}
          />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 760 }}>
          <div
            style={{
              fontSize: 22,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "#5e697a",
            }}
          >
            {burnerTagline}
          </div>
          <div style={{ fontSize: 64, fontWeight: 800, lineHeight: 0.95 }}>
            Burner
          </div>
          <div style={{ fontSize: 32, color: "#313a48", lineHeight: 1.2 }}>
            Send someone a CD they can’t skip ahead on.
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
