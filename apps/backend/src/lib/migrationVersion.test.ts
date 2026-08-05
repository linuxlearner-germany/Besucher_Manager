import test from "node:test";
import assert from "node:assert/strict";
import { parseMigrationFile, sortMigrations } from "./migrationVersion";

test("migration files are ordered by their numeric version and allow version gaps", () => {
  const files = ["030_security_number.sql", "002_roles.sql", "120_future_change.sql"]
    .map(parseMigrationFile)
    .filter((file): file is NonNullable<typeof file> => file !== null);

  assert.deepEqual(sortMigrations(files).map((file) => file.fileName), [
    "002_roles.sql",
    "030_security_number.sql",
    "120_future_change.sql"
  ]);
});

test("migration files require a positive numeric version prefix", () => {
  assert.equal(parseMigrationFile("migration.sql"), null);
  assert.equal(parseMigrationFile("000_invalid.sql"), null);
  assert.equal(parseMigrationFile("004-invalid.sql"), null);
});
