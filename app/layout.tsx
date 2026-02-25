import type { Metadata } from "next";
import localFont from "next/font/local";

import "./globals.css";

const astroGlyph = localFont({
  src: "../public/fonts/starfont-sans.ttf",
  variable: "--font-astro-glyph",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Natal Report",
  description: "Minimalist natal report app powered by FreeAstroAPI.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={astroGlyph.variable}>{children}</body>
    </html>
  );
}
