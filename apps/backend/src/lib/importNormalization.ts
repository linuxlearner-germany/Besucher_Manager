import { cleanOptional } from "./textValues";

export function normalizeImportDateOnly(value: string | null | undefined): string | null {
  const cleaned = cleanOptional(value);
  if (!cleaned) return null;

  const germanDate = cleaned.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (germanDate) {
    const [, day, month, year] = germanDate;
    const normalized = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    const parsed = new Date(`${normalized}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === normalized ? normalized : null;
  }

  const direct = new Date(cleaned);
  return Number.isNaN(direct.getTime()) ? null : direct.toISOString().slice(0, 10);
}

export function normalizeIdDocumentType(value: string | null | undefined): string | null {
  const cleaned = cleanOptional(value);
  if (!cleaned) return null;

  const normalized = cleaned.toLowerCase().replace(/[\s_-]+/g, "");
  if (["personalausweis", "identitycard", "ausweis", "idcard"].includes(normalized)) return "identity_card";
  if (["reisepass", "pass", "passport"].includes(normalized)) return "passport";
  if (["dienstausweis", "serviceid", "servicecard"].includes(normalized)) return "service_id";
  if (["sonstiges", "sonstige", "other"].includes(normalized)) return "other";
  return cleaned;
}
