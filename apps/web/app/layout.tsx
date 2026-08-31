import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Analytics } from "@vercel/analytics/next";
import { webRetroThemeClassName, webRetroThemeCss } from "@burner/ui";

import { CanonicalLocalhost } from "../components/canonical-localhost";
import { ThemeToggle } from "../components/theme-toggle";
import {
  burnerBrandName,
  burnerMetaDescription,
  burnerSiteUrl,
  burnerTagline,
} from "../lib/brand";

export const metadata: Metadata = {
  metadataBase: new URL(burnerSiteUrl),
  title: {
    default: `${burnerBrandName} | ${burnerTagline}`,
    template: `%s | ${burnerBrandName}`,
  },
  description: burnerMetaDescription,
  applicationName: burnerBrandName,
  openGraph: {
    title: `${burnerBrandName} | ${burnerTagline}`,
    description: burnerMetaDescription,
    url: burnerSiteUrl,
    siteName: burnerBrandName,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: `${burnerBrandName} | ${burnerTagline}`,
    description: burnerMetaDescription,
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/apple-icon.svg", type: "image/svg+xml" }],
  },
};

const themeBootScript = `
(function () {
  try {
    var stored = localStorage.getItem('burner-theme');
    var preference = stored === 'dark' || stored === 'light' || stored === 'system'
      ? stored
      : 'system';
    var prefersDark =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches;
    var theme = preference === 'dark' || preference === 'light'
      ? preference
      : prefersDark ? 'dark' : 'light';
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.themePreference = preference;
  } catch (e) {
    document.documentElement.dataset.theme = 'light';
    document.documentElement.dataset.themePreference = 'system';
  }
})();
`.trim();

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html className={webRetroThemeClassName} lang="en" suppressHydrationWarning>
      <head>
        <style id="burner-web-retro-theme">{webRetroThemeCss}</style>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body>
        <ThemeToggle />
        <CanonicalLocalhost />
        {children}
        <Analytics />
      </body>
    </html>
  );
}
