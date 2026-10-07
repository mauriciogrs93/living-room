import type { NextConfig } from "next";

// v19 security headers (security-kb/security-headers.md). The strict CSP starts as Report-Only;
// the enforced CSP only carries the directives that cannot break the page.
const reportOnlyCsp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "connect-src 'self'",
  "img-src 'self' data: blob:",
  "style-src 'self' 'unsafe-inline'",
  "media-src 'self' https: blob:",
  "font-src 'self' data:",
  "worker-src 'self' blob:",
  "frame-src https://www.youtube-nocookie.com",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'none'; object-src 'none'" },
  { key: "Content-Security-Policy-Report-Only", value: reportOnlyCsp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Permissions-Policy", value: "geolocation=(), camera=(), microphone=(), payment=(), usb=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  poweredByHeader: false,
  // Baked into the client bundle. Production builds set "off", so no query can enable the figure lineup.
  // VERCEL_ENV is inlined so a preview bundle can stay on while a self-hosted production build stays off.
  env: {
    NEXT_PUBLIC_FIGURE_LINEUP: process.env.VERCEL_ENV === "production" ? "off" : "on",
    VERCEL_ENV: process.env.VERCEL_ENV ?? "",
  },
  async headers() {
    const iconCache = { key: "Cache-Control", value: "public, max-age=31536000, immutable" };
    return [
      { source: "/icon.svg", headers: [...securityHeaders, iconCache] },
      { source: "/icon", headers: [...securityHeaders, iconCache] },
      { source: "/:path*", headers: securityHeaders },
    ];
  },
  async rewrites() {
    return [{ source: "/skill.md", destination: "/api/skill" }];
  },
};

export default nextConfig;
