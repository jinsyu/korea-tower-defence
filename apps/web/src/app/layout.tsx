import type { Metadata, Viewport } from "next";
import { Black_Han_Sans, Gothic_A1 } from "next/font/google";
import { SITE_DESCRIPTION, SITE_NAME, THEME_COLOR, siteUrl } from "@/lib/site";
import "./globals.css";

// Hangul glyphs are not in any preloadable subset, so preload is off;
// next/font still self-hosts every unicode-range chunk (no Google request at runtime).
const gothicA1 = Gothic_A1({
  variable: "--font-sans",
  weight: ["400", "700", "900"],
  preload: false,
});

const blackHanSans = Black_Han_Sans({
  variable: "--font-display",
  weight: "400",
  preload: false,
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: SITE_NAME, template: `%s | ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "ko_KR",
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: THEME_COLOR,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={`${gothicA1.variable} ${blackHanSans.variable} h-full antialiased`}>
      <body className="flex min-h-dvh flex-col">{children}</body>
    </html>
  );
}
