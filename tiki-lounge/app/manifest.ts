import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Lagoon Lounge — A Magnanimis Listening Room",
    short_name: "Lagoon Lounge",
    description: "An immersive lagoon listening room for long-form music.",
    start_url: "/",
    display: "standalone",
    background_color: "#071012",
    theme_color: "#071012",
    orientation: "any",
    icons: [
      {
        src: "/lagoon-lounge-icon-192.png",
        sizes: "192x192",
        type: "image/png"
      },
      {
        src: "/lagoon-lounge-icon-512.png",
        sizes: "512x512",
        type: "image/png"
      }
    ]
  };
}
