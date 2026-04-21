import "./globals.css";
import type { Metadata } from "next";
import { webRetroThemeClassName, webRetroThemeCss } from "@burner/ui";

import { CanonicalLocalhost } from "../components/canonical-localhost";

export const metadata: Metadata = {
  title: "Burner",
  description: "Create YouTube-powered mixtape links and reveal tracks one by one in the browser.",
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
