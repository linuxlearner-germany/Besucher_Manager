import fs from "node:fs/promises";
import path from "node:path";

const uploadRoot = path.resolve(process.env.UPLOAD_DIR?.trim() || "./uploads");
export const SITE_MAP_CATALOG_ROOT = path.join(uploadRoot, "site-maps");
const allowedExtensions = new Set([".png", ".jpg", ".jpeg", ".webp", ".svg"]);

export type SiteMapCatalogEntry = {
  id: string;
  name: string;
  fileName: string;
  filePath: string;
  mimeType: string;
  fileSizeBytes: number;
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
};

function getMimeType(fileName: string): string {
  switch (path.extname(fileName).toLowerCase()) {
    case ".png": return "image/png";
    case ".jpg":
    case ".jpeg": return "image/jpeg";
    case ".webp": return "image/webp";
    case ".svg": return "image/svg+xml";
    default: return "application/octet-stream";
  }
}

function toPublicPath(fileName: string): string {
  return `/uploads/site-maps/${encodeURIComponent(fileName)}`;
}

export async function listSiteMapCatalog(
  configuredFileName?: string | null,
  rootDirectory = SITE_MAP_CATALOG_ROOT
): Promise<SiteMapCatalogEntry[]> {
  const entries = await fs.readdir(rootDirectory, { withFileTypes: true }).catch(() => []);
  const files = await Promise.all(entries
    .filter((entry) => entry.isFile() && allowedExtensions.has(path.extname(entry.name).toLowerCase()))
    .map(async (entry): Promise<SiteMapCatalogEntry | null> => {
      const fileName = path.basename(entry.name);
      const stats = await fs.stat(path.join(rootDirectory, fileName)).catch(() => null);
      if (!stats?.isFile()) return null;
      const name = path.basename(fileName, path.extname(fileName)).replace(/[-_]+/g, " ").trim();
      return {
        id: fileName,
        name: name || fileName,
        fileName,
        filePath: toPublicPath(fileName),
        mimeType: getMimeType(fileName),
        fileSizeBytes: stats.size,
        createdAt: stats.birthtime.toISOString(),
        updatedAt: stats.mtime.toISOString(),
        isActive: fileName === configuredFileName
      };
    }));

  const catalog = files.filter((entry): entry is SiteMapCatalogEntry => entry !== null)
    .sort((left, right) => left.fileName.localeCompare(right.fileName, "de"));
  if (catalog.length > 0 && !catalog.some((entry) => entry.isActive)) {
    catalog[0].isActive = true;
  }
  return catalog;
}

export function selectSiteMapCatalogEntry(entries: SiteMapCatalogEntry[], configuredFileName?: string | null): SiteMapCatalogEntry | null {
  return entries.find((entry) => entry.fileName === configuredFileName)
    ?? entries[0]
    ?? null;
}
