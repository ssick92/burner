import { ImageResponse } from "next/og";

import { getPublicShareMeta } from "../../../lib/server/public-burner";
import { DEMO_SHARE_SLUGS, demoShareMeta } from "../../../lib/share-meta";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const emptyMeta = {
  coverImageUrl: null as string | null,
  note: null as string | null,
  senderName: "Someone",
  slug: "",
  title: "",
  totalTracks: 0,
};

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const meta = DEMO_SHARE_SLUGS.has(slug)
    ? demoShareMeta()
    : ((await getPublicShareMeta(slug)) ?? { ...emptyMeta, slug });

  const sender = meta.senderName.trim() || "Someone";
  const title = meta.title.trim() || "a Burner CD";
  const cover =
    meta.coverImageUrl && /^https?:\/\//.test(meta.coverImageUrl)
      ? meta.coverImageUrl
      : null;

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
          padding: 64,
          gap: 48,
          alignItems: "center",
        }}
      >
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt=""
            src={cover}
            width={280}
            height={280}
            style={{
              width: 280,
              height: 280,
              borderRadius: 8,
              objectFit: "cover",
              boxShadow: "0 24px 48px rgba(16,22,34,0.28)",
              flexShrink: 0,
            }}
          />
        ) : (
          <div
            style={{
              width: 280,
              height: 280,
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
                width: 42,
                height: 42,
                borderRadius: "50%",
                background: "#cfd6e0",
                boxShadow: "inset 0 0 0 3px #8b93a0",
              }}
            />
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 720 }}>
          <div
            style={{
              fontSize: 22,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "#5e697a",
            }}
          >
            Burner CD
          </div>
          <div style={{ fontSize: 54, fontWeight: 700, lineHeight: 1.05 }}>
            {sender} burned you a CD
          </div>
          <div style={{ fontSize: 32, color: "#313a48" }}>“{title}”</div>
          <div style={{ fontSize: 22, color: "#5e697a" }}>
            Tracks stay hidden until they play.
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
