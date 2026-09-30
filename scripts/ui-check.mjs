// UI check: fails when a view migrated to the design system uses a hardcoded value instead of a token.
// Zero dependencies on purpose. Run: npm run ui:check (the CI `ci` job and the lint-staged hook run it too).
// The pattern is the /10x-ui hardcoded-value scan: hex/rgb/hsl/oklch literals, arbitrary px/rem values and Tailwind
// palette classes (`bg-purple-600`, `text-white`). Tokens live in src/styles/global.css, components in src/components/ui.
// File arguments (lint-staged passes the staged paths) are ignored: the whole list below is always checked.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

// Files migrated to the design system. Follow-up changes append their files here, and to the matching lint-staged
// glob in package.json. `<dir>/*<suffix>` expands to every file directly in <dir> whose name ends with <suffix>.
const MIGRATED = [
  "src/pages/dashboard.astro",
  "src/pages/dev/kitchen-sink.astro",
  "src/components/AppHeader.astro",
  "src/components/LanguageSwitcher.astro",
  "src/components/recommendations/*.astro",
  "src/components/recommendations/*.ts",
];

const HARDCODED =
  /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|oklch\(|-\[[0-9.]+(px|rem)\]|\b(bg|text|border|ring|outline|from|via|to|fill|stroke|shadow|divide)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)\b/g;

const root = path.resolve(import.meta.dirname, "..");

// A missing file or an empty glob fails the check, so a rename can't silently shrink its coverage.
function expand(entry) {
  const star = entry.indexOf("*");
  if (star === -1) {
    if (!existsSync(path.join(root, entry))) fail(`Listed file does not exist: ${entry}`);
    return [entry];
  }
  const dir = path.dirname(entry);
  const suffix = entry.slice(star + 1);
  if (path.join(dir, "*" + suffix) !== path.normalize(entry) || suffix.includes("/")) {
    fail(`Unsupported pattern (use <dir>/*<suffix>): ${entry}`);
  }
  if (!existsSync(path.join(root, dir))) fail(`Listed directory does not exist: ${dir}`);
  const files = readdirSync(path.join(root, dir))
    .filter((name) => name.endsWith(suffix) && statSync(path.join(root, dir, name)).isFile())
    .sort()
    .map((name) => path.posix.join(dir, name));
  if (files.length === 0) fail(`Pattern matches no files: ${entry}`);
  return files;
}

function fail(message) {
  console.error(`ui:check: ${message}`);
  process.exit(1);
}

const files = [...new Set(MIGRATED.flatMap(expand))];
let hits = 0;
for (const file of files) {
  const lines = readFileSync(path.join(root, file), "utf8").split("\n");
  lines.forEach((line, index) => {
    const matches = [...line.matchAll(HARDCODED)].map((match) => match[0]);
    if (matches.length === 0) return;
    hits += matches.length;
    console.error(`${file}:${index + 1}: ${matches.join(", ")}\n    ${line.trim()}`);
  });
}

if (hits > 0) {
  console.error(
    `\nui:check: ${hits} hardcoded value(s) in migrated files. Use a token from src/styles/global.css ` +
      `(e.g. bg-primary, text-muted-foreground, bg-tier-1) or a component from src/components/ui.`,
  );
  process.exit(1);
}
console.log(`ui:check: ${files.length} migrated files, no hardcoded values.`);
