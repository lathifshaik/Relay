import { defineConfig } from "tsup";

export default defineConfig([
  // Library entry — programmatic usage.
  {
    entry: { index: "src/index.ts" },
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    clean: true,
    target: "es2022",
  },
  // CLI bin — ESM only with shebang.
  {
    entry: { bin: "src/bin.ts" },
    format: ["esm"],
    sourcemap: true,
    target: "es2022",
    banner: { js: "#!/usr/bin/env node" },
  },
]);
