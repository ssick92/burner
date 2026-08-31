import type { Metadata } from "next";

import { HomeClient } from "../../components/home-client";

export const metadata: Metadata = {
  title: "Studio",
  description: "Search songs, Sharpie a cover, and burn a CD they have to listen to in order.",
};

export default function StudioPage() {
  return <HomeClient />;
}
