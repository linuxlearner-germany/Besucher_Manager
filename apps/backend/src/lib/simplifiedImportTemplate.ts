import ExcelJS from "exceljs";
import { COUNTRIES } from "./countries";

export const SIMPLIFIED_XLSX_HEADERS = [
  "Wache [notwendig]", "Vorname", "Nachname", "Firma / Organisation", "Nationalität", "Geburtsdatum",
  "Telefon", "E-Mail", "Kennzeichen", "Ansprechpartner", "Ansprechpartner Telefon",
  "Ansprechpartner E-Mail", "Abteilung / Bereich", "Besuchszweck", "Gültig von [notwendig]", "Gültig bis [notwendig]", "Bemerkung"
] as const;

export const SIMPLIFIED_XLSX_DATA_START_ROW = 2;

type SimplifiedTemplateGate = { name: string };

export async function buildSimplifiedImportTemplate(gates: readonly SimplifiedTemplateGate[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Vereinfachte Erfassung");
  const rangeValidations = (sheet as ExcelJS.Worksheet & {
    dataValidations: { add(address: string, validation: ExcelJS.DataValidation): void };
  }).dataValidations;
  const references = workbook.addWorksheet("Referenzwerte", { state: "veryHidden" });
  const gateNames = [...new Set(gates.map((gate) => gate.name.trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, "de"));
  const nationalityNames = [...new Set(COUNTRIES.map((country) => country.name.trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, "de"));

  sheet.addRow([...SIMPLIFIED_XLSX_HEADERS]);
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F5E89" } };
  headerRow.alignment = { vertical: "middle", wrapText: true };
  headerRow.height = 34;
  sheet.columns.forEach((column, index) => { column.width = [28, 20, 20, 28, 26, 16, 20, 28, 18, 26, 24, 28, 24, 28, 18, 18, 32][index] ?? 24; });
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: "A1", to: "Q1" };

  references.addRow(["Akzeptierte Nationalitäten", "Aktive Wachen"]);
  nationalityNames.forEach((nationality, index) => { references.getCell(index + 2, 1).value = nationality; });
  gateNames.forEach((gateName, index) => { references.getCell(index + 2, 2).value = gateName; });
  workbook.definedNames.add(`Referenzwerte!$A$2:$A$${nationalityNames.length + 1}`, "SimplifiedNationalities");
  if (gateNames.length > 0) workbook.definedNames.add(`Referenzwerte!$B$2:$B$${gateNames.length + 1}`, "SimplifiedActiveGates");

  const lastDataRow = SIMPLIFIED_XLSX_DATA_START_ROW + 499;
  rangeValidations.add(`A${SIMPLIFIED_XLSX_DATA_START_ROW}:A${lastDataRow}`, gateNames.length > 0 ? {
    type: "list", allowBlank: false, formulae: ["SimplifiedActiveGates"],
    showInputMessage: true, promptTitle: "Aktive Wache", prompt: "Wählen Sie den exakten Namen einer aktuell aktiven Wache.",
    showErrorMessage: true, errorStyle: "stop", errorTitle: "Unbekannte Wache", error: "Bitte wählen Sie eine Wache aus der Liste."
  } : {
    type: "custom", allowBlank: false, formulae: ["FALSE"],
    showInputMessage: true, promptTitle: "Keine aktive Wache", prompt: "Derzeit ist keine aktive Wache für eine Anmeldung verfügbar."
  });
  rangeValidations.add(`E${SIMPLIFIED_XLSX_DATA_START_ROW}:E${lastDataRow}`, {
    type: "list", allowBlank: true, formulae: ["SimplifiedNationalities"],
    showInputMessage: true, promptTitle: "Nationalität", prompt: "Wählen Sie optional einen deutschen Ländernamen aus der Liste.",
    showErrorMessage: true, errorStyle: "stop", errorTitle: "Ungültige Nationalität", error: "Bitte wählen Sie eine Nationalität aus der Liste."
  });

  for (let rowNumber = SIMPLIFIED_XLSX_DATA_START_ROW; rowNumber <= lastDataRow; rowNumber += 1) {
    for (const columnNumber of [6, 15, 16]) sheet.getCell(rowNumber, columnNumber).numFmt = "dd.mm.yyyy";
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
