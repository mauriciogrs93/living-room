import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  async rewrites() {
    return [{ source: "/skill.md", destination: "/api/skill" }];
  },
};

export default nextConfig;
