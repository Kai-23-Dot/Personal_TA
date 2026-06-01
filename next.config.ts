import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  webpack: (config, { dev }) => {
    // Suppress noisy PackFileCacheStrategy warnings in local dev/build logs.
    config.infrastructureLogging = {
      ...(config.infrastructureLogging ?? {}),
      level: "error",
    };

    if (dev) {
      config.cache = { type: "memory" };
    }
    return config;
  },
  serverExternalPackages: ["pdf-parse", "mammoth", "jszip", "openai"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
      { protocol: "https", hostname: "*.supabase.co" },
    ],
  },
};

export default nextConfig;
