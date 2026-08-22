import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import { buildSimplifiedRegistrationTemplate, parseSimplifiedRegistrationExcel, SimplifiedExcelValidationError } from "./simplifiedRegistrationExcel";

async function workbookWithRows(rows: Array<Record<string,string>>): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load((await buildSimplifiedRegistrationTemplate()) as never);
  const sheet = workbook.getWorksheet("Vereinfachte Anmeldung")!;
  const headers = new Map<string, number>();
  sheet.getRow(1).eachCell((cell, column) => headers.set(cell.text, column));
  rows.forEach((values, index) => {
    const row = sheet.getRow(index + 4);
    for (const [header, value] of Object.entries(values)) {
      const column = headers.get(header);
      if (!column) throw new Error(`Unbekannte Testspalte: ${header}`);
      row.getCell(column).value = value;
    }
  });
  const output = await workbook.xlsx.writeBuffer();
  return Buffer.from(output);
}

const valid={Vorname:"Anna",Nachname:"Arbeiter", "Firma / Organisation":"Bau GmbH",Nationalität:"Deutschland",Kasernenbereich:"Standardbereich","Gültig von (Vorschlag)":"01.09.2026","Gültig bis (Vorschlag)":"31.12.2026"};

test("dedicated template always ignores its two example rows",async()=>{
  const template = await buildSimplifiedRegistrationTemplate();
  await assert.rejects(()=>parseSimplifiedRegistrationExcel(template),(error)=>error instanceof SimplifiedExcelValidationError&&error.messages.some(message=>message.includes("Keine Besucher")));
});

test("parses multiple real visitors as one validated row collection",async()=>{
  const rows=await parseSimplifiedRegistrationExcel(await workbookWithRows([valid,{...valid,Vorname:"Ben",Nachname:"Bauer",Nationalität:"Österreich"}]));
  assert.equal(rows.length,2); assert.equal(rows[0].sourceRow,4); assert.equal(rows[0].nationalityCode,"DE"); assert.equal(rows[1].nationalityCode,"AT");
});

test("rejects invalid dates before persistence",async()=>{
  const workbook = await workbookWithRows([{...valid,"Gültig von (Vorschlag)":"kein Datum"}]);
  await assert.rejects(()=>parseSimplifiedRegistrationExcel(workbook),(error)=>error instanceof SimplifiedExcelValidationError&&error.messages.some(message=>message.includes("Zeile 4")&&message.includes("ungültig")));
});

test("rejects unknown nationalities before persistence",async()=>{
  const workbook = await workbookWithRows([{...valid,Nationalität:"Unbekanntland"}]);
  await assert.rejects(()=>parseSimplifiedRegistrationExcel(workbook),(error)=>error instanceof SimplifiedExcelValidationError&&error.messages.some(message=>message.includes("Nationalität")));
});

test("normalizes optional identity document data before persistence",async()=>{
  const workbook = await workbookWithRows([{...valid,Ausweisart:"Personalausweis","Ausweis gültig bis":"31.12.2030"}]);
  const [row] = await parseSimplifiedRegistrationExcel(workbook);
  assert.equal(row.idDocumentType,"identity_card");
  assert.equal(row.idDocumentValidUntil,"2030-12-31");
});

test("rejects an invalid optional identity document date",async()=>{
  const workbook = await workbookWithRows([{...valid,"Ausweis gültig bis":"nicht lesbar"}]);
  await assert.rejects(()=>parseSimplifiedRegistrationExcel(workbook),(error)=>error instanceof SimplifiedExcelValidationError&&error.messages.some(message=>message.includes("Ausweis gültig bis")));
});

test("rejects workbooks that are not the dedicated template",async()=>{
  const workbook=new ExcelJS.Workbook();workbook.addWorksheet("Tabelle1").addRow(["Name"]);const output=Buffer.from(await workbook.xlsx.writeBuffer());
  await assert.rejects(()=>parseSimplifiedRegistrationExcel(output),(error)=>error instanceof SimplifiedExcelValidationError&&error.messages.some(message=>message.includes("Spalten fehlen")));
});
