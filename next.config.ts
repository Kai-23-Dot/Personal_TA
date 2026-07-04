import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Vercel's Next.js builder requires the default ".next" output dir. Locally we
  // use ".next-build" (via NEXT_DIST_DIR) to avoid clashing with the dev server.
  distDir: process.env.VERCEL ? ".next" : (process.env.NEXT_DIST_DIR || ".next"),
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
