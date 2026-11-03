import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // The test files are whole-stack runs (Chromium, a relay, a page build, Docker):
    // one at a time, so none starves another's 30 s waits.
    fileParallelism: false,
    include: ["test/**/*.test.ts", "e2e-browser/**/*.test.ts"],
    testTimeout: 180_000,
    hookTimeout: 180_000,
  },
});
