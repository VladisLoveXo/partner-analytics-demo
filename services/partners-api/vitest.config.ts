import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    testTimeout: 30_000,
    // Starting containers (and pulling images on a cold machine) takes longer than a test.
    hookTimeout: 180_000,
  },
});
