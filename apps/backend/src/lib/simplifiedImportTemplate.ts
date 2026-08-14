import ExcelJS from "exceljs";

export async function buildSimplifiedImportTemplate(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Vereinfachte Erfassung");
  sheet.addRow([
    "Vorname", "Nachname", "Firma / Organisation", "Nationalität", "Geburtsdatum",
    "Telefon", "E-Mail", "Kennzeichen", "Ansprechpartner", "Ansprechpartner Telefon",
    "Ansprechpartner E-Mail", "Besuchszweck", "Gültig von", "Gültig bis", "Bemerkung"
  ]);
  sheet.getRow(1).font = { bold: true };
  sheet.columns.forEach((column) => { column.width = 24; });
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
