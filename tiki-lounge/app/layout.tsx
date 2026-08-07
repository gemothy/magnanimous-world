import type { Metadata, Viewport } from "next";
import "./globals.css";

const configuredSiteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.VERCEL_PROJECT_PRODUCTION_URL ||
  "localhost:3000";
const siteUrl = configuredSiteUrl.startsWith("http")
  ? configuredSiteUrl
  : `${configuredSiteUrl.startsWith("localhost") ? "http" : "https"}://${configuredSiteUrl}`;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Lagoon Lounge — A Magnanimis Listening Room",
    template: "%s — Lagoon Lounge"
  },
  description:
    "An immersive lagoon listening room for long-form music, quiet focus, and television-sized escape.",
  applicationName: "Lagoon Lounge",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Lagoon Lounge"
  },
  icons: {
    icon: [
      {
        url: "/lagoon-lounge-icon-192.png",
        sizes: "192x192",
        type: "image/png"
      },
      {
        url: "/lagoon-lounge-icon-512.png",
        sizes: "512x512",
        type: "image/png"
      }
    ],
    apple: "/lagoon-lounge-icon-180.png"
  },
  openGraph: {
    title: "Lagoon Lounge",
    description: "A Magnanimis listening room from daylight to moonlight.",
    type: "website",
    images: [
      {
        url: "/lagoon-lounge-og.jpg",
        width: 1200,
        height: 630,
        alt: "Lagoon Lounge listening room"
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: "Lagoon Lounge",
    description: "A Magnanimis listening room from daylight to moonlight.",
    images: ["/lagoon-lounge-og.jpg"]
  }
};

export const viewport: Viewport = {
  themeColor: "#071012",
  colorScheme: "dark",
  viewportFit: "cover"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
