import { defineConfig } from "vitest/config";

/** `pnpm test:browser`: the built extension in Playwright's Chromium. */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests-browser/**/*.test.ts"],
    testTimeout: 30_000,
  },
});
