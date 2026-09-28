// `npm run catalog:check` (runs in CI): fails on an invalid entry, a stale catalog/entry.schema.json, entries that
// differ from the newest snapshot migration, or an entry an earlier snapshot shipped that no longer has a file.
import fs from "node:fs";

import {
  displayPath,
  findDeletedSlugs,
  JSON_SCHEMA_PATH,
  listSnapshots,
  loadEntries,
  renderJsonSchema,
  renderSnapshotSql,
} from "./lib";

const { entries, fileSlugs, problems } = loadEntries();

const schemaFile = displayPath(JSON_SCHEMA_PATH);
if (!fs.existsSync(JSON_SCHEMA_PATH)) {
  problems.push(`${schemaFile}: missing; run \`npm run catalog:schema\``);
} else if (fs.readFileSync(JSON_SCHEMA_PATH, "utf8") !== (await renderJsonSchema())) {
  problems.push(`${schemaFile}: out of date with src/lib/catalog/schema.ts; run \`npm run catalog:schema\``);
}

const snapshots = listSnapshots();
problems.push(...findDeletedSlugs(fileSlugs, snapshots));

const newest = snapshots.at(-1);
// Drift is only meaningful once every entry is valid; an empty catalog with snapshots is reported as deleted slugs.
if (problems.length === 0 && entries.length > 0) {
  const hint = "run `npm run catalog:migration` and commit the new migration";
  if (newest === undefined) {
    problems.push(`supabase/migrations: no *_screening_catalog_snapshot.sql ships these entries yet; ${hint}`);
  } else if (newest.body !== renderSnapshotSql(entries)) {
    problems.push(
      `${displayPath(newest.file)}: catalog/entries changed since this snapshot (or it was edited by hand); ${hint}`,
    );
  }
}

if (problems.length > 0) {
  process.stderr.write(`${problems.join("\n")}\n\ncatalog:check failed with ${problems.length} problem(s)\n`);
  process.exit(1);
}

const snapshotNote = newest === undefined ? "no snapshot yet" : `matches ${displayPath(newest.file)}`;
process.stdout.write(`catalog:check passed: ${entries.length} entries, ${snapshotNote}\n`);
