import ExcelJS from "exceljs";
import {
  getVisitorImportExcelTemplateColumns,
  getVisitorImportTemplateSampleRows
} from "./visitImportDefinitions";

export async function buildImportTemplateWorkbookBuffer(): Promise<Buffer> {
  const columns = getVisitorImportExcelTemplateColumns();
  const headers = columns.map((column) => column.header);
  const sampleRows = getVisitorImportTemplateSampleRows();
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Importvorlage", {
    views: [{ state: "frozen", ySplit: 1 }]
  });
  const hintsSheet = workbook.addWorksheet("Hinweise");
  const listSheet = workbook.addWorksheet("Listen");

  workbook.creator = "Besucher Manager";
  workbook.lastModifiedBy = "Besucher Manager";
  workbook.created = new Date();
  workbook.modified = new Date();

  const widths: Record<string, number> = {
    "Vorname [Pflicht]": 18,
    "Nachname [Pflicht]": 18,
    "Firma / Organisation [Pflicht]": 28,
    "Geburtsdatum [Optional]": 16,
    "Telefon [Optional]": 18,
    "E-Mail [Optional]": 26,
    "Kennzeichen [Optional]": 16,
    "Ausweisart [Pflicht]": 18,
    "Ausweis gültig bis [Optional]": 18,
    "Ausweisnummer [Pflicht]": 20,
    "Bemerkung [Optional]": 28,
    "Ansprechpartner [Pflicht]": 24,
    "Ansprechpartner Telefon [Pflicht]": 20,
    "Ansprechpartner E-Mail [Optional]": 28,
    "Abteilung / Bereich [Optional]": 20,
    "Besuchszweck [Pflicht]": 24,
    "Gültig von [Pflicht]": 16,
    "Gültig bis [Pflicht]": 16
  };

  const headerNotes: Record<string, string> = {
    "Vorname [Pflicht]": "Vorname der besuchenden Person.",
    "Nachname [Pflicht]": "Nachname der besuchenden Person.",
    "Firma / Organisation [Pflicht]": "Firma oder Organisation der besuchenden Person.",
    "Geburtsdatum [Optional]": "Optional, Format TT.MM.JJJJ.",
    "Telefon [Optional]": "Telefon der besuchenden Person.",
    "E-Mail [Optional]": "E-Mail der besuchenden Person.",
    "Kennzeichen [Optional]": "KFZ-Kennzeichen, falls vorhanden.",
    "Ausweisart [Pflicht]": "Pflichtfeld. Bitte über die Auswahlliste wählen.",
    "Ausweis gültig bis [Optional]": "Format TT.MM.JJJJ.",
    "Ausweisnummer [Pflicht]": "Pflichtfeld. Nummer des Ausweisdokuments.",
    "Bemerkung [Optional]": "Freitext für Hinweise.",
    "Ansprechpartner [Pflicht]": "Interner Ansprechpartner vor Ort.",
    "Ansprechpartner Telefon [Pflicht]": "Pflichtfeld. Telefon des Ansprechpartners.",
    "Ansprechpartner E-Mail [Optional]": "E-Mail des Ansprechpartners.",
    "Abteilung / Bereich [Optional]": "Abteilung oder Bereich des Ansprechpartners.",
    "Besuchszweck [Pflicht]": "Kurz und klar, z. B. Besprechung oder Wartung.",
    "Gültig von [Pflicht]": "Besuchsbeginn im Format TT.MM.JJJJ.",
    "Gültig bis [Pflicht]": "Besuchsende im Format TT.MM.JJJJ."
  };

  const sectionColors: Record<string, string> = {
    visitor: "FFD8EAFB",
    host: "FFDFF4DC",
    visit: "FFFDE7BF"
  };

  const requiredSectionColors: Record<string, string> = {
    visitor: "FFB9D8F6",
    host: "FFC4E9BE",
    visit: "FFF6D47A"
  };

  worksheet.columns = headers.map((header) => ({
    header,
    key: header,
    width: widths[header] ?? 18
  }));

  const headerRow = worksheet.getRow(1);
  headerRow.height = 24;
  headerRow.eachCell((cell, colNumber) => {
    const column = columns[colNumber - 1];
    const header = column?.header ?? "";
    cell.font = { bold: true, color: { argb: "FF10233A" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: "FF9FB3C8" } },
      left: { style: "thin", color: { argb: "FF9FB3C8" } },
      bottom: { style: "thin", color: { argb: "FF9FB3C8" } },
      right: { style: "thin", color: { argb: "FF9FB3C8" } }
    };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: {
        argb: column
          ? (column.required ? requiredSectionColors[column.section] : sectionColors[column.section])
          : "FFDCEBFA"
      }
    };
    cell.note = headerNotes[header] || "Importspalte";
  });

  sampleRows.forEach((rowValues) => {
    worksheet.addRow(Object.fromEntries(headers.map((header, index) => [header, rowValues[index] ?? ""])));
  });

  const exampleRows = 150;
  for (let rowNumber = 2; rowNumber < exampleRows + 2; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    row.height = 22;
    row.eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FFE2E8F0" } },
        left: { style: "thin", color: { argb: "FFE2E8F0" } },
        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
        right: { style: "thin", color: { argb: "FFE2E8F0" } }
      };
      cell.alignment = { vertical: "middle" };
    });
  }

  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: headers.length }
  };

  const idDocumentOptions = ["Personalausweis", "Reisepass", "Sonstiges"];
  idDocumentOptions.forEach((value, index) => {
    listSheet.getCell(`A${index + 1}`).value = value;
  });
  listSheet.state = "veryHidden";

  const idDocumentTypeColumnIndex = headers.indexOf("Ausweisart [Pflicht]") + 1;
  const dateColumnIndexes = [
    headers.indexOf("Gültig von [Pflicht]") + 1,
    headers.indexOf("Gültig bis [Pflicht]") + 1,
    headers.indexOf("Geburtsdatum [Optional]") + 1,
    headers.indexOf("Ausweis gültig bis [Optional]") + 1
  ].filter((value) => value > 0);

  for (let rowNumber = 2; rowNumber < exampleRows + 2; rowNumber += 1) {
    if (idDocumentTypeColumnIndex > 0) {
      worksheet.getCell(rowNumber, idDocumentTypeColumnIndex).dataValidation = {
        type: "list",
        allowBlank: false,
        formulae: [`Listen!$A$1:$A$${idDocumentOptions.length}`],
        showErrorMessage: true,
        errorTitle: "Ungültige Ausweisart",
        error: "Bitte eine Ausweisart aus der Liste wählen."
      };
    }

    for (const columnIndex of dateColumnIndexes) {
      const cell = worksheet.getCell(rowNumber, columnIndex);
      cell.numFmt = "@";
      cell.note = "Bitte im Format TT.MM.JJJJ eintragen.";
    }
  }

  hintsSheet.getCell("A1").value = "Excel-Importvorlage";
  hintsSheet.getCell("A1").font = { bold: true, size: 14 };
  hintsSheet.getCell("A3").value = "Pflichtfelder";
  hintsSheet.getCell("B3").value = "Vorname, Nachname, Firma / Organisation, Ausweisart, Ausweisnummer, Ansprechpartner, Ansprechpartner Telefon, Besuchszweck, Gültig von, Gültig bis";
  hintsSheet.getCell("A4").value = "Spaltengruppen";
  hintsSheet.getCell("B4").value = "Blau = Besucher, Grün = Ansprechpartner, Gelb = Besuch.";
  hintsSheet.getCell("A5").value = "Dropdowns";
  hintsSheet.getCell("B5").value = "Für Ausweisart steht eine Auswahlliste bereit.";
  hintsSheet.getCell("A6").value = "Datumsformat";
  hintsSheet.getCell("B6").value = "TT.MM.JJJJ";
  hintsSheet.columns = [
    { width: 24 },
    { width: 90 }
  ];

  const output = await workbook.xlsx.writeBuffer();
  return Buffer.isBuffer(output) ? output : Buffer.from(output);
}
