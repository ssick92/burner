import type { Metadata } from "next";
import Link from "next/link";

import { burnerBrandName } from "../../lib/brand";

export const metadata: Metadata = {
  title: "Terms",
  description: "How Burner mix CDs work, and what you're responsible for.",
};

export default function TermsPage() {
  return (
    <main className="legal-page">
      <Link className="my-burns__back" href="/">
        ← Back to Burner
      </Link>
      <h1>Terms</h1>
      <p>
        {burnerBrandName} lets you arrange public song links into a shareable
        mix CD. You are responsible for the links you add and for sending the
        disc only to people who should have it.
      </p>
      <h2>Playback</h2>
      <p>
        Songs play through the original provider (usually YouTube). We don&apos;t
        host audio files. If a video is blocked, private, or removed, that
        track won&apos;t play.
      </p>
      <h2>Accounts</h2>
      <p>
        You can burn without an account. Creating one stores your burn history.
        Don&apos;t share your password. We may remove abusive or illegal content.
      </p>
      <p>
        Questions:{" "}
        <a href="mailto:hello@burnercd.com">hello@burnercd.com</a>
      </p>
    </main>
  );
}
