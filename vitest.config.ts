import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
    },
  },
  test: {
    environment: "node",
    include: [
      "lib/**/*.test.ts",
      "tests/**/*.test.ts",
    ],
    // The traffic collisionSystem.test.ts uses @types/jest globals — exclude
    // it from this run so the pipeline suite can ship independently.
    exclude: [
      "node_modules/**",
      ".next/**",
      // Pre-existing tests that use jest globals (describe/it/expect) without
      // imports — they pre-date this vitest setup and are not part of the
      // pipeline suite.
      "lib/traffic/collisionSystem.test.ts",
      "lib/traffic/signalCoordination.test.ts",
      "lib/traffic/vehicleBehavior.test.ts",
    ],
    testTimeout: 60_000,
    hookTimeout: 30_000,
  },
});
