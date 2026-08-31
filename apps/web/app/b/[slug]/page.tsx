import type { Metadata } from "next";

import { ReceiverPageClient } from "../../../components/receiver-page-client";
import { getPublicShareMeta } from "../../../lib/server/public-burner";
import {
  DEMO_SHARE_SLUGS,
  demoShareMeta,
  sharePageDescription,
  sharePageTitle,
} from "../../../lib/share-meta";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const meta = DEMO_SHARE_SLUGS.has(slug)
    ? demoShareMeta()
    : ((await getPublicShareMeta(slug)) ?? {
        coverImageUrl: null,
        note: null,
        senderName: "Someone",
        slug,
        title: "",
        totalTracks: 0,
      });

  const title = sharePageTitle(meta);
  const description = sharePageDescription(meta);

  return {
    title,
    description,
    robots: DEMO_SHARE_SLUGS.has(slug)
      ? { index: true, follow: true }
      : { index: false, follow: false },
    openGraph: {
      title,
      description,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function BurnerPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ token?: string; payload?: string }>;
}) {
  const { slug } = await params;
  const { token, payload } = await searchParams;

  return <ReceiverPageClient payload={payload} slug={slug} token={token} />;
}
