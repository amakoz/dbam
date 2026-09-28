// `npm run catalog:schema`: rewrites catalog/entry.schema.json from CatalogEntrySchema (src/lib/catalog/schema.ts).
import fs from "node:fs";

import { displayPath, JSON_SCHEMA_PATH, renderJsonSchema } from "./lib";

const expected = await renderJsonSchema();
const current = fs.existsSync(JSON_SCHEMA_PATH) ? fs.readFileSync(JSON_SCHEMA_PATH, "utf8") : null;

if (current === expected) {
  process.stdout.write(`${displayPath(JSON_SCHEMA_PATH)} is already up to date\n`);
} else {
  fs.writeFileSync(JSON_SCHEMA_PATH, expected);
  process.stdout.write(`wrote ${displayPath(JSON_SCHEMA_PATH)}\n`);
}
