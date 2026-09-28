// `npm run catalog:migration`: writes supabase/migrations/<UTC yyyymmddhhmmss>_screening_catalog_snapshot.sql, an
// upsert of every catalog entry. Refuses on invalid or deleted entries, an empty catalog, or nothing new to ship.
import fs from "node:fs";
import path from "node:path";

import {
  displayPath,
  findDeletedSlugs,
  listSnapshots,
  loadEntries,
  MIGRATIONS_DIR,
  newestMigrationVersion,
  renderSnapshotSql,
  snapshotFileName,
} from "./lib";

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

const { entries, fileSlugs, problems } = loadEntries();
const snapshots = listSnapshots();
problems.push(...findDeletedSlugs(fileSlugs, snapshots));
if (problems.length > 0) {
  fail(`${problems.join("\n")}\n\ncatalog:migration refused: fix the ${problems.length} problem(s) above first`);
}
if (entries.length === 0) fail("catalog:migration refused: catalog/entries/ has no entries, nothing to ship");

const body = renderSnapshotSql(entries);
const newest = snapshots.at(-1);
if (newest?.body === body) {
  fail(`catalog:migration refused: nothing to ship, ${displayPath(newest.file)} already matches catalog/entries`);
}

const name = snapshotFileName(new Date());
const newestVersion = newestMigrationVersion();
if (newestVersion !== null && name.slice(0, 14) <= newestVersion) {
  fail(`catalog:migration refused: ${name} would not sort after the newest migration (${newestVersion}); retry`);
}

const file = path.join(MIGRATIONS_DIR, name);
fs.writeFileSync(file, body, { flag: "wx" });
process.stdout.write(`wrote ${displayPath(file)} (${entries.length} entries); commit it with the entry changes\n`);
