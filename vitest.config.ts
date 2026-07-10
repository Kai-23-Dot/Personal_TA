import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Mirrors tsconfig's "@/*" → "./*"
    alias: { "@": path.resolve(__dirname) },
  },
  test: {
    environment: "node",
    include: ["backend/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["backend/groups/**"],
      exclude: ["backend/groups/**/*.test.ts"],
    },
  },
});
