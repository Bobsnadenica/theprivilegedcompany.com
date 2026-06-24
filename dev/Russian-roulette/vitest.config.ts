import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["packages/**/*.test.ts"],
    coverage: {
      reporter: ["text", "html"]
    }
  },
  resolve: {
    alias: {
      "@rrld/shared": new URL("./packages/shared/src/index.ts", import.meta.url).pathname
    }
  }
});
