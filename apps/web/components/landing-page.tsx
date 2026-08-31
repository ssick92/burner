import Link from "next/link";

import { burnerTagline } from "../lib/brand";
import { demoDraft } from "../lib/provider-catalog";
import { BurnerLogo } from "./burner-logo";

export function LandingPage() {
  return (
    <main className="landing">
      <header className="landing-nav">
        <BurnerLogo href="/" iconSize={40} scale={0.78} />
        <div className="landing-nav__actions">
          <Link className="button button--secondary" href="/b/demo">
            Play the demo
          </Link>
          <Link className="button button--primary" href="/studio">
            Burn a CD
          </Link>
        </div>
      </header>

      <section className="landing-hero">
        <div className="landing-hero__copy">
          <span className="eyebrow">A mix they have to listen to</span>
          <h1>Send someone a CD they can't skip ahead on.</h1>
          <p>
            Pick the songs, Sharpie the cover, burn a link. Tracks stay hidden
            until they play — no spoilers, just like a real burner.
          </p>
          <div className="landing-hero__actions">
            <Link className="button button--primary button--hero" href="/studio">
              Burn a CD
            </Link>
            <Link className="button button--secondary" href="/b/demo">
              Hear “{demoDraft.title}”
            </Link>
          </div>
          <p className="landing-hero__fine">{burnerTagline} No account required.</p>
        </div>

        <Link className="landing-jewel" href="/b/demo">
          <div className="landing-jewel__disc" aria-hidden="true">
            <span className="landing-jewel__hub" />
          </div>
          <div className="landing-jewel__case">
            {demoDraft.coverImageUrl ? (
              <div
                className="landing-jewel__cover"
                style={{ backgroundImage: `url("${demoDraft.coverImageUrl}")` }}
              />
            ) : null}
            <div className="landing-jewel__label">
              <span className="eyebrow">Burned by {demoDraft.senderName}</span>
              <strong>{demoDraft.title}</strong>
              <p>Track 01 hidden until Play</p>
            </div>
          </div>
        </Link>
      </section>

      <section className="landing-steps" aria-label="How Burner works">
        <article>
          <span>01</span>
          <h2>Pick the songs</h2>
          <p>Search YouTube or paste a playlist. Keep it to a disc's worth.</p>
        </article>
        <article>
          <span>02</span>
          <h2>Make it theirs</h2>
          <p>Title, cover, a short note. The stuff you used to write on the sleeve.</p>
        </article>
        <article>
          <span>03</span>
          <h2>They listen in order</h2>
          <p>Each track reveals itself only once it starts. No skipping to the end.</p>
        </article>
      </section>

      <footer className="landing-footer">
        <p>Burner is a digital mix CD. Not a streaming service.</p>
        <nav>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/studio">Studio</Link>
        </nav>
      </footer>
    </main>
  );
}
