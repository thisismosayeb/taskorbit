import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: [{ find: "@", replacement: path.resolve(__dirname) }],
  },
  test: {
    environment: "node",
    // Security tests live in tests/security and run only via
    // `npm run test:security` (vitest.security.config.ts) against the live
    // TEST project — they must never run as part of the default suite.
    include: ["tests/unit/**/*.test.ts", "lib/**/*.test.ts"],
  },
});
