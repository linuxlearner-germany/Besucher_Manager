/** Normalisation used for optional values received from HTTP forms and imports. */
export function cleanOptional(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function cleanRequired(value: string | null | undefined, fallback: string): string {
  return cleanOptional(value) ?? fallback;
}

export function isBlankOrPlaceholder(value: string | null | undefined, placeholder: string): boolean {
  const normalized = cleanOptional(value)?.toLowerCase();
  return !normalized || normalized === placeholder.toLowerCase();
}
