import "./globals.css";
import type { Metadata } from "next";
import { webRetroThemeClassName, webRetroThemeCss } from "@burner/ui";

import { CanonicalLocalhost } from "../components/canonical-localhost";
import {
  burnerBrandName,
  burnerMetaDescription,
  burnerTagline,
} from "../lib/brand";

export const metadata: Metadata = {
  title: `${burnerBrandName} | ${burnerTagline}`,
  description: burnerMetaDescription,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <style id="burner-web-retro-theme">{webRetroThemeCss}</style>
      </head>
      <body className={webRetroThemeClassName}>
        <CanonicalLocalhost />
        {children}
      </body>
    </html>
  );
}
