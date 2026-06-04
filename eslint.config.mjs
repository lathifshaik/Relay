// Root ESLint flat config. Every package's `pnpm lint` walks up the dir tree
// to find this file, so we don't need a duplicate per package.
import config from "@relay/eslint-config";

export default [
  ...config,
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/coverage/**",
      "**/.turbo/**",
      "**/.next/**",
      "**/*.config.ts",
      "**/*.config.js",
      "**/*.config.mjs",
      "examples/**", // examples are demo apps, not part of the published surface
    ],
  },
];
