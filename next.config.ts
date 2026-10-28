import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  output: 'standalone',
  // Perf: barrel-file packages are resolved per-symbol at build time, so the
  // client bundle ships only the icons/charts/motion pieces actually imported
  // (smaller First Load JS on every route).
  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts', 'framer-motion', 'date-fns'],
  },
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
