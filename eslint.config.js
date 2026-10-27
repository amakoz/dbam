import { fixupPluginRules } from "@eslint/compat";
import eslint from "@eslint/js";
import { defineConfig, includeIgnoreFile } from "eslint/config";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import eslintPluginAstro from "eslint-plugin-astro";
import pluginReact from "eslint-plugin-react";
import eslintPluginReactHooks from "eslint-plugin-react-hooks";
import path from "node:path";
import tseslint from "typescript-eslint";

// eslint-plugin-react still uses context APIs removed in ESLint 10; wrap it until it ships native support.
const reactPlugin = fixupPluginRules(pluginReact);

const gitignorePath = path.resolve(import.meta.dirname, ".gitignore");

const baseConfig = defineConfig({
  extends: [eslint.configs.recommended, tseslint.configs.strictTypeChecked, tseslint.configs.stylisticTypeChecked],
  languageOptions: {
    parserOptions: {
      projectService: true,
      tsconfigRootDir: import.meta.dirname,
    },
  },
  rules: {
    "no-console": "warn",
    "no-unused-vars": "off",
    "@typescript-eslint/no-unused-vars": [
      "error",
      {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
        destructuredArrayIgnorePattern: "^_",
        ignoreRestSiblings: true,
      },
    ],
    "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
    "@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: { attributes: false } }],
  },
});

const reactConfig = defineConfig({
  files: ["**/*.{js,jsx,ts,tsx}"],
  extends: [eslintPluginReactHooks.configs.flat["recommended-latest"]],
  plugins: { react: reactPlugin },
  languageOptions: {
    ...pluginReact.configs.flat.recommended.languageOptions,
    globals: {
      window: true,
      document: true,
    },
  },
  settings: { react: { version: "detect" } },
  rules: {
    ...pluginReact.configs.flat.recommended.rules,
    "react/react-in-jsx-scope": "off",
  },
});

const astroConfig = defineConfig({
  files: ["**/*.astro"],
  languageOptions: {
    // astro-eslint-parser does not support projectService yet and warns on every file; hand it a project path instead.
    parserOptions: { projectService: false, project: "./tsconfig.json", tsconfigRootDir: import.meta.dirname },
  },
  rules: {
    "astro/no-set-html-directive": "error",
    "astro/no-unused-css-selector": "warn",
    "astro/prefer-class-list-directive": "warn",
    // Crashes ("Expected node to have a parent") on a top-level `return Astro.redirect(...)` in frontmatter, which is
    // Astro's documented redirect pattern. Still enforced in .ts/.tsx.
    "@typescript-eslint/no-misused-promises": "off",
  },
});

// Worker-side jobs log through console on purpose: Workers Logs captures it.
const workerLogsConfig = defineConfig({
  files: [
    "src/worker.ts",
    "src/lib/email.ts",
    "src/lib/failure-alert.ts",
    "src/lib/heartbeat.ts",
    "src/lib/observability.ts",
    "src/lib/reminders/appointment.ts",
    "src/lib/reminders/due-screening.ts",
    "src/lib/reminders/follow-up-nudge.ts",
  ],
  rules: { "no-console": "off" },
});

// The Supabase secret key is for the cron's reminder job only: nothing that serves a request may import its client.
const reminderClientConfig = defineConfig({
  files: [
    "src/pages/**/*.{ts,tsx,astro}",
    "src/components/**/*.{ts,tsx,astro}",
    "src/layouts/**/*.{ts,tsx,astro}",
    "src/middleware.ts",
  ],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            // The whole reminders folder: the job module imports the admin client, so it would leak the key too.
            group: ["@/lib/reminders/*", "**/lib/reminders/*"],
            message: "src/lib/reminders is cron-only (it holds the Supabase secret key): use @/lib/supabase in pages.",
          },
        ],
      },
    ],
  },
});

// The e2e oracle must not come from the code under test: specs read catalog JSON from disk, never production modules.
const e2eOracleConfig = defineConfig({
  files: ["tests/e2e/**", "playwright.config.ts"],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: ["@/*", "**/src/**", "astro:*"],
            message: "e2e specs must not import production code; the oracle reads catalog JSON",
          },
        ],
      },
    ],
  },
});

const scriptsConfig = defineConfig({
  files: ["scripts/**/*.mjs"],
  extends: [tseslint.configs.disableTypeChecked],
  languageOptions: {
    globals: { console: true, process: true, fetch: true, URL: true, URLSearchParams: true, AbortSignal: true },
  },
  rules: { "no-console": "off" },
});

// The AI review core is pure: it must not reach the network, the filesystem or processes (run.mjs does the I/O).
const aiReviewCoreConfig = defineConfig({
  files: ["scripts/ai-review/core.mjs"],
  languageOptions: { globals: { fetch: "off", process: "off" } },
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: [
              "child_process",
              "node:child_process",
              "http",
              "node:http",
              "https",
              "node:https",
              "net",
              "node:net",
              "fs",
              "node:fs",
              "fs/promises",
              "node:fs/promises",
            ],
            message: "scripts/ai-review/core.mjs is pure: do the I/O in run.mjs",
          },
        ],
      },
    ],
    "no-restricted-syntax": [
      "error",
      { selector: "ImportExpression", message: "scripts/ai-review/core.mjs is pure: no dynamic import()" },
    ],
  },
});

export default defineConfig(
  includeIgnoreFile(gitignorePath),
  // Generated by `npm run db:types`; its style follows the Supabase generator, not our lint rules.
  { ignores: ["src/lib/database.types.ts"] },
  // Generated by `npm run cf:types` (wrangler types) from wrangler.jsonc and .dev.vars.
  { ignores: ["worker-configuration.d.ts"] },
  baseConfig,
  reactConfig,
  eslintPluginAstro.configs["flat/recommended"],
  eslintPluginAstro.configs["flat/jsx-a11y-recommended"],
  astroConfig,
  workerLogsConfig,
  reminderClientConfig,
  e2eOracleConfig,
  scriptsConfig,
  aiReviewCoreConfig,
  eslintPluginPrettier,
);
