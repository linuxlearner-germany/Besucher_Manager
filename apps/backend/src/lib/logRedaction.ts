const REDACTED = "[REDACTED]";
const sensitiveKeyPattern = /(?:password|passwort|authorization|access[_-]?token|refresh[_-]?token|token|cookie|session|secret|api[_-]?key|database[_-]?password|mssql[_-]?password)/i;

export function redactSensitiveText(value: string): string {
  return value
    .replace(/\bauthorization\b\s*[:=]\s*(?:Bearer\s+)?[^\s,;}]+/gi, `Authorization=${REDACTED}`)
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, `Bearer ${REDACTED}`)
    .replace(/\b(password|passwort|access[_-]?token|refresh[_-]?token|token|cookie|session[_-]?secret|api[_-]?key|mssql[_-]?password)\b\s*[:=]\s*([^\s,;}]+)/gi, (_match, key: string) => `${key}=${REDACTED}`);
}

export function redactLogValue(value: unknown, depth = 0): unknown {
  if (depth > 12) return "[MAX_DEPTH]";
  if (typeof value === "string") return redactSensitiveText(value);
  if (Array.isArray(value)) return value.map((entry) => redactLogValue(entry, depth + 1));
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
    key,
    sensitiveKeyPattern.test(key) ? REDACTED : redactLogValue(entry, depth + 1)
  ]));
}

export function parseRedactedLogJson(value: string | null): unknown | null {
  if (!value?.trim()) return null;
  try {
    return redactLogValue(JSON.parse(value));
  } catch {
    return redactSensitiveText(value);
  }
}

export function readLogMetadataString(metadata: unknown, ...keys: string[]): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const record = metadata as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return null;
}
