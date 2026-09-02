import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const repositoryRoot = resolve(__dirname, "../../../..");
const backupSource = readFileSync(resolve(repositoryRoot, "scripts/ops/backup_sqlserver.sh"), "utf8");
const restoreSource = readFileSync(resolve(repositoryRoot, "scripts/ops/restore_test_sqlserver.sh"), "utf8");

test("SQL backup requires checksum verification and isolated restore resources", () => {
  assert.match(backupSource, /BACKUP DATABASE.*CHECKSUM/);
  assert.match(backupSource, /RESTORE VERIFYONLY.*CHECKSUM/);
  assert.match(backupSource, /sha256sum/);
  assert.match(restoreSource, /besucher_manager_restore_test_/);
  assert.match(restoreSource, /guard_restore_test_cleanup/);
  assert.match(restoreSource, /schema_migrations missing/);
  assert.doesNotMatch(restoreSource, /docker compose down/);
});

test("retention deletes only checksum-marked backups and preserves the newest", () => {
  const directory = mkdtempSync(join(tmpdir(), "besucher-backup-retention-"));
  try {
    writeFileSync(join(directory, ".besucher-manager-backup-root"), "besucher-manager-sql-backups-v1\n");
    const names = [
      "BesucherManager_20260801_010101.bak",
      "BesucherManager_20260802_010101.bak",
      "BesucherManager_20260803_010101.bak"
    ];
    names.forEach((name, index) => {
      const content = `verified-backup-${index}`;
      writeFileSync(join(directory, name), content);
      const hash = createHash("sha256").update(content).digest("hex");
      writeFileSync(join(directory, `${name}.verified.sha256`), `${hash}  ${name}\n`);
    });
    const unverified = "BesucherManager_20260701_010101.bak";
    writeFileSync(join(directory, unverified), "legacy-unverified");

    const command = [
      resolve(repositoryRoot, "scripts/ops/prune_sql_backups.py"),
      "--backup-dir", directory,
      "--database", "BesucherManager",
      "--recent", "1",
      "--daily-days", "0",
      "--weekly-weeks", "0",
      "--apply"
    ];
    const result = spawnSync("python3", command, { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /2 zum Entfernen, 1 unverifiziert unangetastet/);
    assert.equal(readFileSync(join(directory, names[2]), "utf8"), "verified-backup-2");
    assert.equal(readFileSync(join(directory, unverified), "utf8"), "legacy-unverified");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
