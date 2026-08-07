export function dateOnlyStart(value: string): Date {
  const parsed = new Date(value);
  return new Date(Date.UTC(
    parsed.getUTCFullYear(),
    parsed.getUTCMonth(),
    parsed.getUTCDate(),
    0,
    0,
    0,
    0
  ));
}

export function dateOnlyEnd(value: string): Date {
  const parsed = new Date(value);
  return new Date(Date.UTC(
    parsed.getUTCFullYear(),
    parsed.getUTCMonth(),
    parsed.getUTCDate(),
    23,
    59,
    59,
    999
  ));
}

export function isIsoDateOnly(value: string | null | undefined): boolean {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
}
