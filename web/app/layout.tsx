import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import localFont from "next/font/local";

import { frontDoorScript } from "@/lib/onboarding/frontDoor";
import { bootScript, themeCss } from "@/lib/theme";

import { Providers } from "./providers";
import "./globals.css";

// Body text. Cyrillic for Russian; Hebrew comes from Heebo, Arabic from the system's fonts (see globals.css).
const inter = Inter({ subsets: ["latin", "latin-ext", "cyrillic"], variable: "--font-inter", display: "swap" });
// Headings, big numbers and main buttons (PIN-160). Hebrew headings use Rubik.
const spaceGrotesk = Space_Grotesk({ subsets: ["latin", "latin-ext"], variable: "--font-space-grotesk", display: "swap" });
// Hebrew: Heebo for body text, Rubik for headings (files and licence in app/fonts/). They come first in the font
// stacks (globals.css) because Inter's fallback face is local Arial, which has Hebrew and would win if they came
// after it. So they must hold Hebrew letters only: self-hosted rather than next/font/google, which adds every
// subset, and no Arial fallback face of their own. Otherwise they'd take Latin text from Inter and Space Grotesk.
// (Font loader options must be literals, so the unicode-range is written twice.)
const heebo = localFont({
  src: "./fonts/heebo-hebrew.woff2",
  weight: "100 900",
  variable: "--font-heebo",
  display: "swap",
  adjustFontFallback: false,
  declarations: [{ prop: "unicode-range", value: "U+0307-0308, U+0590-05FF, U+200C-2010, U+20AA, U+25CC, U+FB1D-FB4F" }],
});
const rubik = localFont({
  src: "./fonts/rubik-hebrew.woff2",
  weight: "300 900",
  variable: "--font-rubik",
  display: "swap",
  adjustFontFallback: false,
  declarations: [{ prop: "unicode-range", value: "U+0307-0308, U+0590-05FF, U+200C-2010, U+20AA, U+25CC, U+FB1D-FB4F" }],
});

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
    <html lang="en" className={`${inter.variable} ${spaceGrotesk.variable} ${heebo.variable} ${rubik.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        {/* First, before anything loads: a signed-out visit to /app goes on to the welcome page or sign-in (PIN-174). */}
        <script dangerouslySetInnerHTML={{ __html: frontDoorScript() }} />
        <style id="pinch-themes" dangerouslySetInnerHTML={{ __html: themeCss() }} />
        <script dangerouslySetInnerHTML={{ __html: bootScript() }} />
      </head>
      <body className="flex min-h-full flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
