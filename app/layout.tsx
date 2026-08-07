import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Magnanimous",
  description: "A private digital order for discipline, vitality, and the long life."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
