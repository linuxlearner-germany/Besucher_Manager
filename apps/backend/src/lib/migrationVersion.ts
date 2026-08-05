export type MigrationFile = {
  fileName: string;
  version: number;
};

export function parseMigrationFile(fileName: string): MigrationFile | null {
  const match = /^(\d+)_[-a-z0-9_]+\.sql$/i.exec(fileName);
  if (!match) return null;

  const version = Number.parseInt(match[1], 10);
  return Number.isSafeInteger(version) && version > 0 ? { fileName, version } : null;
}

export function sortMigrations(files: MigrationFile[]): MigrationFile[] {
  return [...files].sort((left, right) => left.version - right.version || left.fileName.localeCompare(right.fileName));
}
