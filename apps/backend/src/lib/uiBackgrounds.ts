import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const safeIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/);
const safeFileNameSchema = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,159}$/);
const supportedImageFileSchema = safeFileNameSchema.refine(
  (value) => [".png", ".jpg", ".jpeg", ".webp"].includes(path.extname(value).toLowerCase()),
  "Nicht unterstütztes Bildformat."
);
const previewFileSchema = safeFileNameSchema.refine(
  (value) => path.extname(value).toLowerCase() === ".webp",
  "Vorschaubilder müssen WebP-Dateien sein."
);

const catalogSchema = z.object({
  version: z.literal(1),
  backgrounds: z.array(z.object({
    id: safeIdSchema,
    name: z.string().trim().min(1).max(160),
    fileName: supportedImageFileSchema,
    previewFileName: previewFileSchema,
    width: z.number().int().positive().max(10000),
    height: z.number().int().positive().max(10000)
  })).min(1).max(100)
}).superRefine((catalog, context) => {
  const ids = new Set<string>();
  const files = new Set<string>();

  catalog.backgrounds.forEach((entry, index) => {
    if (ids.has(entry.id)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["backgrounds", index, "id"],
        message: `Doppelte Hintergrund-ID: ${entry.id}`
      });
    }
    ids.add(entry.id);

    if (files.has(entry.fileName)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["backgrounds", index, "fileName"],
        message: `Doppelte Hintergrunddatei: ${entry.fileName}`
      });
    }
    files.add(entry.fileName);
  });
});

export type UiBackgroundCatalogEntry = z.infer<typeof catalogSchema>["backgrounds"][number];

export type UiBackground = UiBackgroundCatalogEntry & {
  imageUrl: string;
  previewUrl: string;
  fileSizeBytes: number;
};

export const UI_BACKGROUND_ROOT = path.join(
  path.resolve(process.env.UPLOAD_DIR?.trim() || "./uploads"),
  "ui-backgrounds"
);

function toPublicUrl(directory: "catalog" | "previews", fileName: string): string {
  return `/uploads/ui-backgrounds/${directory}/${encodeURIComponent(fileName)}`;
}

export function parseUiBackgroundCatalog(value: unknown): UiBackgroundCatalogEntry[] {
  return catalogSchema.parse(value).backgrounds;
}

export async function listUiBackgrounds(rootDirectory = UI_BACKGROUND_ROOT): Promise<UiBackground[]> {
  const manifestPath = path.join(rootDirectory, "backgrounds.json");
  const rawManifest = await fs.readFile(manifestPath, "utf8");
  const entries = parseUiBackgroundCatalog(JSON.parse(rawManifest) as unknown);

  const backgrounds = await Promise.all(entries.map(async (entry): Promise<UiBackground | null> => {
    const imagePath = path.join(rootDirectory, "catalog", entry.fileName);
    const previewPath = path.join(rootDirectory, "previews", entry.previewFileName);

    try {
      const imageStats = await fs.stat(imagePath);
      if (!imageStats.isFile()) {
        return null;
      }

      const previewExists = await fs.stat(previewPath)
        .then((stats) => stats.isFile())
        .catch(() => false);

      return {
        ...entry,
        imageUrl: toPublicUrl("catalog", entry.fileName),
        previewUrl: previewExists
          ? toPublicUrl("previews", entry.previewFileName)
          : toPublicUrl("catalog", entry.fileName),
        fileSizeBytes: imageStats.size
      };
    } catch {
      return null;
    }
  }));

  return backgrounds.filter((entry): entry is UiBackground => entry !== null);
}

export async function getUiBackgroundById(
  backgroundId: string,
  rootDirectory = UI_BACKGROUND_ROOT
): Promise<UiBackground | null> {
  const backgrounds = await listUiBackgrounds(rootDirectory);
  return backgrounds.find((entry) => entry.id === backgroundId) ?? null;
}

export function selectConfiguredUiBackground(
  backgrounds: UiBackground[],
  configuredId?: string | null,
  legacyImageUrl?: string | null,
  legacyFileName?: string | null
): UiBackground | null {
  if (configuredId) {
    const configured = backgrounds.find((entry) => entry.id === configuredId);
    if (configured) {
      return configured;
    }
  }

  const legacyBaseName = path.basename(legacyFileName?.trim() || legacyImageUrl?.trim() || "");
  if (legacyBaseName) {
    const legacy = backgrounds.find((entry) => entry.fileName === legacyBaseName);
    if (legacy) {
      return legacy;
    }
  }

  return backgrounds.find((entry) => entry.id === "standard") ?? backgrounds[0] ?? null;
}
