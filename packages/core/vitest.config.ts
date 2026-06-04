import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      // describe.ts is a thin annotation-store API used by adapters; tested via
      // adapter integration tests in M2.
      include: [
        "src/validator.ts",
        "src/sanitiser.ts",
        "src/projection.ts",
        "src/block-list.ts",
        "src/token.ts",
        "src/emitter.ts",
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 85,
        statements: 90,
      },
    },
  },
});
