import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  output: 'standalone',
  // Perf: don't reveal the framework in response headers (smaller headers,
  // no fingerprinting). Compression itself is always on at the Vercel edge.
  poweredByHeader: false,
  // Baseline hardening headers on every route (HSTS is added by the Vercel
  // edge automatically; CSP needs a nonce rollout and is deliberately not
  // switched on blind).
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
