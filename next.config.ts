import type { NextConfig } from "next";

// In Docker the API runs as a separate container; NEXT_PUBLIC_API_URL is set
// by docker-compose.yml. Falls back to localhost for local dev.
const API_URL = process.env.NEXT_PUBLIC_API_URL;
const isRemoteApi = Boolean(API_URL && !API_URL.includes("127.0.0.1") && !API_URL.includes("localhost"));

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    // Only proxy if an external backend API URL is explicitly configured
    if (!isRemoteApi || !API_URL) return [];
    return [
      {
        source: "/api/:path*",
        destination: `${API_URL}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
