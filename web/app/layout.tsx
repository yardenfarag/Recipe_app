import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk } from "next/font/google";

import { bootScript, themeCss } from "@/lib/theme";

import { Providers } from "./providers";
import "./globals.css";

// Body text. Cyrillic for Russian; Hebrew and Arabic use the system's fonts (see --font-sans in globals.css).
const inter = Inter({ subsets: ["latin", "latin-ext", "cyrillic"], variable: "--font-inter", display: "swap" });
// Headings, big numbers and main buttons (PIN-160).
const spaceGrotesk = Space_Grotesk({ subsets: ["latin", "latin-ext"], variable: "--font-space-grotesk", display: "swap" });

export const metadata: Metadata = {
  title: "Pinch",
  description: "Save recipes from any video or website.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The head script sets lang, dir, data-pack and data-scheme from saved choices before the first paint.
    <html lang="en" className={`${inter.variable} ${spaceGrotesk.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <style id="pinch-themes" dangerouslySetInnerHTML={{ __html: themeCss() }} />
        <script dangerouslySetInnerHTML={{ __html: bootScript() }} />
      </head>
      <body className="flex min-h-full flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
