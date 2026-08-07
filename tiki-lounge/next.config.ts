import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/cast-media/:path*",
        headers: [
          {
            key: "Access-Control-Allow-Origin",
            value: "*"
          },
          {
            key: "Content-Type",
            value: "video/mp2t"
          }
        ]
      },
      {
        source: "/cast-hls/:path*",
        headers: [
          {
            key: "Access-Control-Allow-Origin",
            value: "*"
          }
        ]
      },
      {
        source: "/audio/beach-noir/:path*",
        headers: [
          {
            key: "Access-Control-Allow-Origin",
            value: "*"
          }
        ]
      }
    ];
  },
  turbopack: {
    root: process.cwd()
  }
};

export default nextConfig;
