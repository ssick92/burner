import type { Metadata } from "next";
import Link from "next/link";

import { burnerBrandName } from "../../lib/brand";

export const metadata: Metadata = {
  title: "Privacy",
  description: "What Burner stores, and what it doesn't.",
};

export default function PrivacyPage() {
  return (
    <main className="legal-page">
      <Link className="my-burns__back" href="/">
        ← Back to Burner
      </Link>
      <h1>Privacy</h1>
      <p>
        {burnerBrandName} is a mix-CD maker. We collect only what we need to
        burn and share a disc.
      </p>
      <h2>What we store</h2>
      <ul>
        <li>Disc title, sender name, note, cover art, and song links you add.</li>
        <li>
          Optional account details (email, display name, hashed password or
          Google sign-in) so you can reopen burns later.
        </li>
        <li>Anonymous listen progress on a share link, so tracks stay hidden until they play.</li>
      </ul>
      <h2>What we don't do</h2>
      <ul>
        <li>We don't sell your data.</li>
        <li>We don't put unrevealed track titles in public share previews.</li>
        <li>Share links are meant for the person you send them to. Treat them like a mix you handed over.</li>
      </ul>
      <p>
        Questions:{" "}
        <a href="mailto:hello@burnercd.com">hello@burnercd.com</a>
      </p>
    </main>
  );
}
