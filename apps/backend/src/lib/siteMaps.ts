import path from "node:path";
import crypto from "node:crypto";

export const SITE_MAP_UPLOAD_SUBDIRECTORY = "site-maps";
export const SITE_MAP_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

export const ALLOWED_SITE_MAP_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp"
] as const;

export const ALLOWED_SITE_MAP_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp"] as const;

export type AllowedSiteMapMimeType = (typeof ALLOWED_SITE_MAP_MIME_TYPES)[number];

export function isAllowedSiteMapMimeType(value: string): value is AllowedSiteMapMimeType {
  return ALLOWED_SITE_MAP_MIME_TYPES.includes(value as AllowedSiteMapMimeType);
}

export function isAllowedSiteMapExtension(value: string): boolean {
  return ALLOWED_SITE_MAP_EXTENSIONS.includes(value.toLowerCase() as (typeof ALLOWED_SITE_MAP_EXTENSIONS)[number]);
}

export function getNormalizedExtension(fileName: string): string | null {
  const extension = path.extname(fileName).toLowerCase();

  if (!extension) {
    return null;
  }

  if (extension === ".jpeg") {
    return ".jpg";
  }

  return extension;
}

export function buildStoredSiteMapFileName(extension: string): string {
  return `site-map-${Date.now()}-${crypto.randomUUID()}${extension}`;
}

export function buildSiteMapPublicPath(storedFileName: string): string {
  return `/uploads/${SITE_MAP_UPLOAD_SUBDIRECTORY}/${storedFileName}`;
}
