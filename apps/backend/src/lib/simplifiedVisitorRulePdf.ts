import { PDFDocument, PDFTextField } from "pdf-lib";
import type { ImportVisitInput } from "./visitImportDefinitions";

const MISSING_IMPORT_VALUE = "[fehlt]";

export type SimplifiedVisitorRulePreview = {
  documentType: "event" | "construction";
  title: string;
  organization: string;
  location: string;
  validFrom: string;
  validUntil: string;
  hostName: string;
  hostPhone: string;
  notes: string;
  visitors: ImportVisitInput[];
  warnings: string[];
};

function clean(value: string | undefined): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function dateOnly(value: string): string {
  const germanDate = value.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!germanDate) return value;
  const [, day, month, year] = germanDate;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function appendNote(parts: string[], label: string, value: string) {
  if (value) parts.push(`${label}: ${value}`);
}

export async function parseSimplifiedVisitorRulePdf(buffer: Buffer, sourceName = ""): Promise<SimplifiedVisitorRulePreview> {
  const document = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const values = new Map<string, string>();

  for (const field of document.getForm().getFields()) {
    if (field instanceof PDFTextField) values.set(field.getName(), clean(field.getText()));
  }

  const findValue = (...candidates: string[]) => {
    for (const candidate of candidates) {
      const exact = values.get(candidate);
      if (exact) return exact;
      const matched = [...values.entries()].find(([name]) => name.toLowerCase().includes(candidate.toLowerCase()))?.[1];
      if (matched) return matched;
    }
    return "";
  };

  const documentType: SimplifiedVisitorRulePreview["documentType"] = /bau.*maßn|bau.*regelung/i.test(sourceName)
    || [...values.keys()].some((name) => /baumaßnahme|maßnahmenort|angemeldete firma/i.test(name))
    ? "construction"
    : "event";
  const title = findValue("Bezeichnung der Veranstaltung", "Bezeichnung der Baumaßnahme");
  const organization = documentType === "construction"
    ? findValue("Angemeldete Firma", "Veranstaltende", "verantwortliche OrgEinheit")
    : findValue("Veranstaltende", "verantwortliche OrgEinheit");
  const location = findValue("Veranstaltungsort", "Maßnahmenort");
  const validFrom = dateOnly(findValue("Datum am/vom"));
  const validUntil = dateOnly(findValue("Datum bis")) || validFrom;
  const hostName = findValue("Verantwortliche Ansprechpersonen", "Ansprechperson-en", "Ansprechperson");
  const hostPhone = findValue("Telefonische Erreichbarkeit");
  const details = findValue("Besonderheiten", "AnmerkungenEinschränkungen");
  const notes: string[] = [];
  appendNote(notes, "Dokument", documentType === "construction" ? "Vereinfachte Besucherregelung Baumaßnahme" : "Vereinfachte Besucherregelung Veranstaltung");
  appendNote(notes, "Ort", location);
  appendNote(notes, "Zeit", [findValue("Beginn"), findValue("Ende")].filter(Boolean).join(" – "));
  appendNote(notes, "Hinweise", details);

  const visitors: ImportVisitInput[] = [];
  const rowValue = (prefix: string, number: number) => {
    const field = [...values.entries()].find(([name]) => name.startsWith(prefix) && new RegExp(`${number}$`).test(name));
    return field?.[1] ?? "";
  };
  for (let number = 1; number <= 45; number += 1) {
    const lastName = rowValue("Name zuerst Name dann ggf DstGrTitel oä", number);
    const firstName = rowValue("Vorname", number);
    if (!lastName && !firstName) continue;
    const company = rowValue("Ggf Firma", number) || organization;

    visitors.push({
      sourceExcelRowNumber: number,
      firstName: firstName || MISSING_IMPORT_VALUE,
      lastName: lastName || MISSING_IMPORT_VALUE,
      company: company || MISSING_IMPORT_VALUE,
      nationalityCode: "DE",
      hostName: hostName || MISSING_IMPORT_VALUE,
      hostPhone: hostPhone || MISSING_IMPORT_VALUE,
      purpose: title || (documentType === "construction" ? "Baumaßnahme" : "Veranstaltung"),
      validFrom,
      validUntil,
      notes: notes.join("\n")
    });
  }

  const warnings: string[] = [];
  if (!visitors.length) warnings.push("Im PDF wurden keine Besucher gefunden.");
  if (!validFrom) warnings.push("Kein Beginn-Datum erkannt. Bitte in der Vorschau ergänzen.");
  if (!hostName) warnings.push("Keine Ansprechperson erkannt. Bitte in der Vorschau ergänzen.");
  warnings.push("Die Vorlage enthält keine Nationalitäten. Für den Import ist Deutschland (DE) voreingestellt und kann vor dem Speichern angepasst werden.");

  return {
    documentType,
    title,
    organization,
    location,
    validFrom,
    validUntil,
    hostName,
    hostPhone,
    notes: notes.join("\n"),
    visitors,
    warnings
  };
}
