import type { NextConfig } from "next";

// In Docker the API runs as a separate container; NEXT_PUBLIC_API_URL is set
// by docker-compose.yml. Falls back to localhost for local dev.
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8002";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // output: "standalone" is only for Docker production builds.
  // Do NOT enable here â€” it breaks `next dev` in Next.js 15.
  // Uncomment in Dockerfile.web build stage only via NEXT_OUTPUT env var if needed.
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${API_URL}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
