import { defineConfig } from "vitest/config";
import path from "node:path";

// Security (API-attack) suite only — runs against the live Supabase TEST
// project (taskorbit-test) with real logins. Never run against production.
// Invoked via `npm run test:security`. The default `vitest run` (npm test)
// does NOT pick up tests/security (see vitest.config.ts include).
export default defineConfig({
  resolve: {
    alias: [{ find: "@", replacement: path.resolve(__dirname) }],
  },
  test: {
    environment: "node",
    include: ["tests/security/**/*.test.ts"],
    // Live network round-trips to Supabase; fixture setup does many of them.
    testTimeout: 60_000,
    hookTimeout: 180_000,
    // Fixtures are built once in beforeAll and shared across cases; run in
    // file order so a case never races another case's fixture.
    sequence: { shuffle: false },
  },
});
